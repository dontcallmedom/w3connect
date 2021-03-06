/**
 * Module dependencies.
 */

var express = require('express');
require("express-namespace");
var engine = require('ejs-locals'),
flash = require("connect-flash");
var everyauth = require('everyauth'),
EventEmitter = require('events').EventEmitter;
var imports = require("./imports.js"),
twitter = require("./twitter.js");
var sanitizer = require('sanitizer');
var icalendar = require('icalendar');
var https = require('https');
var http = require('http');


form = require("express-form"),
filter = form.filter,
validate = form.validate;

var fs = require('fs');

// Reading command line options
var argv = require("optimist")
    .options('c', {
	alias: 'config',
    default:'config.ini'}).argv;

// Reading configuration file
var config = require('iniparser').parseSync(argv.c);

// Setting up server (http or https depending on configuration file)
var app = express();

var server;
if (config.https.key_file && config.https.certificate_file) {
    server = https.createServer({key: fs.readFileSync(config.https.key_file), cert: fs.readFileSync(config.https.certificate_file)}, app);
} else {
    server = http.createServer(app);
}
module.exports.app = app;

var emitter = new EventEmitter();

// Connecting to Mongo database
var mongoose = require('mongoose');
module.exports.db = mongoose;
db = mongoose.connect(config.mongo.host, config.mongo.dbname);

// and loading schemas for it
var People = require('./model.js').People();
var Organization = require('./model.js').Organization();
var Place = require('./model.js').Place();
var Event = require('./model.js').Event();
var Status = require('./model.js').StatusUpdate();
//var TaxiFromAirport = require('./model.js').TaxiFromAirport();
//var TaxiToAirport = require('./model.js').TaxiToAirport();
var TwitterSettings = require('./model.js').TwitterSettings();

// hash array of known places in the system
var places = {};

// Session Store
var SessionMongoose = require("session-mongoose");
var mongooseSessionStore = new SessionMongoose({
    url: "mongodb://" + config.mongo.host + '/'  + config.authentication.session_db,
    interval: 120000 // expiration check worker run interval in millisec (default: 60000)
});

// Authentication 
everyauth.everymodule.moduleTimeout(40000);

everyauth.everymodule.findUserById( function (userId, callback) {
    // is there anyone in the db yet? 
    People.count({}, function(err, count) {
	if (!count) {
	    // No one in the db, we create a mock user to allow for import
	    callback(err, {'login': userId, 'given': 'Admin', 'family': 'Istrator', 'slug': 'admin'});
	} else {
	    People.findOne({login: userId}, callback);
	}
    });
});

/* everyauth.everymodule
   .performRedirect( function (res, location) {
   res.redirect(location, 303);
   });
*/
// Adapted from everyauth ldap module
everyauth.password
    .logoutPath(config.hosting.basepath + '/logout')
    .logoutRedirectPath(config.hosting.basepath + '/login')
    .getLoginPath(config.hosting.basepath + '/login')
    .postLoginPath(config.hosting.basepath + '/login') // Uri path that your login form POSTs to
    .loginView('login.ejs')
    // We assume pre-registered people
    // so we use bogus values for register paths
    .getRegisterPath('/dev/null')
    .postRegisterPath('/dev/null')
     // and we nullify the registerUser step
    .registerUser(function() {
	return null;
    })
    .loginLocals(function (req, res) {
	// if the redirectTo query string param was set
	// we record in the session to redirect the user after successful login
	if (req.query["redirectTo"]) {
	    req.session.redirectTo = req.query["redirectTo"];
	}
    })
/*    .respondToRegistrationSucceed( function (res, user, data) {
	if (data.session.redirectTo) {
	    this.redirect(res, data.session.redirectTo)
	} else {
	    this.redirect(res, config.hosting.basepath + '/');
	}
    })*/
    .respondToLoginSucceed( function (res, user, data) {
	console.log(user);
	console.log(data.session);
	console.log(data.session.redirectTo);
	if (data.session.redirectTo && user) {
	    res.writeHead(303, {"Location":data.session.redirectTo});
	    data.session.redirectTo = null;	  
	    res.end();
	} else if (user){
	    res.writeHead(303, {"Location": config.hosting.basepath + '/'});
	    res.end();	  
	}
    }) 
    .authenticate( function (login, password) {
	var promise = this.Promise();  
	var errors = [];
	if (!login) errors.push('Missing login');
	if (!password) errors.push('Missing password');
	if (errors.length) return errors;
	var ldap = require('./ldapauth');
	ldap.authenticate(config.ldap.scheme, config.ldap.host, parseInt(config.ldap.port),'uid=' + login + ',' + config.ldap.dn_realm , password, function(err, result) {
            if (err) {
		return promise.fail(err);
            }
	    if (result === false) {
		errors = ['Login failed.'];
		return promise.fulfill(errors);
	    } else {
		var user = {id: login};
		// We'll use this to get data from WBS when importing registrants list
		// @@@ move to import.js? use cleaner abstraction
		app.set('w3c_auth', new Buffer(login + ':' + password).toString('base64')); 	  
		return promise.fulfill(user);	    
	    }
	});
	return promise;
    });


// Configuration
app.configure(function(){
    emitter.setMaxListeners(0);
    //  use ejs-locals for all ejs templates:
    app.engine('ejs', engine);
    app.use(express.logger());
    app.set('views', __dirname + '/views');
    app.set('view engine', 'ejs');
    app.set('port', config.hosting.hostname.split(":")[2] ? config.hosting.hostname.split(":")[2] : 3000);
    app.use(express.bodyParser());
    app.use(config.hosting.basepath, express.static(__dirname + '/public', { maxAge: 86400000}));
    app.use(flash());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    app.use(express.session({store: mongooseSessionStore, secret:config.authentication.session_secret, cookie: {maxAge: new Date(Date.now() + (config.authentication.duration ? parseInt(config.authentication.duration,10) : 3600*24*1000)), path: config.hosting.basepath }}));
    app.use(function(req, res, next) {
	res.locals({baseurl: config.hosting.basepath, elapsedTime: elapsedTime, places: places, messages: require("express-messages")(req, res) , url: require("url").parse(req.url).pathname});
	next();
    });
    app.use(everyauth.middleware(app));
    app.use(function(req, res, next) {
	res.locals({user: req.user});
	next();
    });

    // Loading up list of places
    Place.find({}).sort('name').exec( function(err, rooms) {
	if (err) {
	    console.log("No room known in the system");		     
	} else {
	    for (i in rooms) {
		places[rooms[i].shortname] = rooms[i];
	    }	  
	}
    });
    // Loading up list of twitter users
    TwitterSettings.findOne(
	{}, 
	function(err, settings) {
	    // No twitter settings
	    if (err || !settings) {
		console.log("No twitter settings found, won't get updates from Twitter");
	    } else {
		if (!(settings.username && settings.password)) {
		    console.log("Incomplete twitter settings found, won't get updates from Twitter: " + JSON.stringify(settings));
		} else {
		    app.set('twitter_auth', new Buffer(settings.username + ':' + settings.password).toString('base64')); 	  
		    if (true) {
			People.find({}, ['twitterAccount'], function(err, people) {
			    for (p in people) {
				if (people[p].twitterAccount && people[p].twitterAccount.id) {
				    settings.ids.push(people[p].twitterAccount.id);
				}
			    }
			    // defaulting to registered list of users
			    if (!settings.ids.length) {
				if (settings.list && settings.list.owner && settings.list.slug) {
				    // load a list of users from Twitter
				    twitter.listTwitterIdsFromTwitterList(
					settings.list.owner,
					settings.list.slug,
					function (ids) {
					    settings.ids = ids;
					    settings.save();
					    twitter.listenToTweets(emitter, settings.ids, app.get('twitter_auth'));
					});
				}
			    } else {
				settings.save();
				twitter.listenToTweets(emitter, settings.ids, app.get('twitter_auth'));
			    }
			});
		    } else {
			twitter.listenToTweets(emitter, settings.ids, app.get('twitter_auth'));
		    }
		}
	    }
	});
    if (config.schedule.autocheckout && config.schedule.autocheckout.match(/[0-9][0-9][0-9][0-9]?/)) {
	var now = new Date();
	var then = new Date();
	then.setUTCHours(parseInt(config.schedule.autocheckout, 10) / 100 - parseInt(config.schedule.timezone_offset, 10));
	then.setUTCMinutes(parseInt(config.schedule.autocheckout, 10) % 100);
	if (then < now) {
	    then.setUTCDate(now.getUTCDate() + 1);
	}
	setTimeout(function() {
	    autoCheckout();
	    setInterval(autoCheckout, 3600 * 24 * 1000);
	}, then - now);
	console.log("Setting auto checkout " + ((then - now) / 1000) + " seconds from now");
    }
});


app.configure('test', function(){
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
    //db = mongoose.connect('mongodb://localhost/tpac-test');
});


app.configure('development', function(){
    everyauth.debug = true;
    app.use(express.logger());
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
    // Error handling
    app.use(function(err, req, res, next) {
	console.error(err.stack);
	res.send(500, 'Something broke!');
    });
});

app.configure('production', function(){
    app.use(express.logger());
    app.use(express.errorHandler()); 
    app.set('port', 80);
    // Error handling
    app.use(function(err, req, res, next) {
	console.error(err.stack);
	res.send(500, 'Something broke!');
    });
});


// update twitter search on registering new twitter id
emitter.on("twitterListChange", function (id) {
    if (id) {
	TwitterSettings.findOne(
	    {}, 
	    function(err, settings) {
		var ids = settings.ids;
		ids.push(id);
		settings.ids = ids;
		twitter.listenToTweets(emitter, ids, app.get('twitter_auth'));
		settings.save();
	    }
	);
    }
});

// Record events as statusupdates
emitter.on("checkin", function(user, left, entered) {
    var status  = new Status({author: user, time: Date.now(), statusType: "checkin", contentHTML: (left && left.name ? " left <a href='" + sanitizer.escape(config.hosting.basepath) + "/locations/" + sanitizer.escape(left.shortname) + "'>" + sanitizer.escape(left.name) + "</a>" + (entered && entered.name ? " and " : "") : "") + (entered && entered.name ? " entered <a href='" + sanitizer.escape(config.hosting.basepath) + "/locations/" + sanitizer.escape(entered.shortname) + "'>" + sanitizer.escape(entered.name) + "</a>" : "")});
    
    status.save();
});

emitter.on("newevent", function(event) {
    var time = event.time;
    if (time) {
	time.setUTCHours(time.getUTCHours() + parseInt(config.schedule.timezone_offset, 10));
        var status  = new Status({author: event.proposedBy, time: Date.now(), statusType: "event", contentHTML: " scheduled a new ad-hoc event: " + sanitizer.escape(event.name) + " at " + sanitizer.escape(time) + " in <a href='" + sanitizer.escape(config.hosting.basepath + "/locations/" + event.room.shortname) + "'>" + sanitizer.escape(event.room.name) + "</a>"});
	status.save();
    }
});

emitter.on("newtwitteraccount", function(indiv) {
    var status = new Status({author: indiv, time: Date.now(), statusType:"profile", contentHTML: "’s profile is now bound with the <a href='http://twitter.com/" + sanitizer.escape(indiv.twitterAccount.name) + "'>Twitter account " + sanitizer.escape(indiv.twitterAccount.name) + "</a>"});
    status.save();
});


emitter.on("tweet", function(tweet) {
    People.findOne(
	{"twitterAccount.id":tweet.user.id},
	function(err, indiv) {
	    if (indiv) {
		var status = new Status({author: indiv, time: Date.now(), statusType: "tweet", contentHTML: /*indiv.given + " " + indiv.family + */" <a href='http://twitter.com/" + sanitizer.escape(indiv.twitterAccount.name) + '/status/' + sanitizer.escape(tweet.id_str) + "'>tweeted</a>: “" + sanitizer.escape(tweet.text) + "” as <a href='http://twitter.com/" + sanitizer.escape(indiv.twitterAccount.name) + "'>@" + sanitizer.escape(indiv.twitterAccount.name) + "</a>"});
		status.save();
	    }
	});
});



// Utility function
// Parses YYYYMMDDTHHmm into a Date object
function parseDate(datestring) {
    console.log("parsing date " + datestring);
    var ret = new Date();
    ret.setUTCFullYear(datestring.substr(0,4));
    ret.setUTCMonth(datestring.substr(4,2) - 1);
    ret.setUTCDate( datestring.substr(6,2));
    ret.setUTCHours(parseInt(datestring.substr(9,2), 10));
    ret.setUTCMinutes(datestring.substr(11,2));
    ret.setUTCSeconds(0);
    ret.setUTCMilliseconds(0);
    return ret;
};

function elapsedTime(time) {
    var elapsedTime = (Date.now() - time) / 1000 ;
    var weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]; 
    var months = ["January", "February", "March", "April", "May",   
		  "June", "July", "August", "September", "October", "November", "December"];
    var days = Math.floor(elapsedTime / 86400);
    var hours = Math.floor((elapsedTime - (days*86400)) / 3600);
    var minutes = Math.floor((elapsedTime - (days * 86400) - (hours * 3600)) / 60);
    if (days > 7) {
	return time.getDate() + ' ' + months[time.getMonth()] + ' ' + time.getFullYear();
    } else if (days > 1) {
	return weekDays[time.getDay()] + ' (' + days.toString() + ' days ago)';
    } else if (days == 2) {
	return '2 days ago';
    } else if (days == 1) {
	return 'yesterday';
    } else if (hours > 1) {
	return hours.toString() + ' hours ago';
    } else if (hours == 1) {
	return '1 hour ago';
    } else {
	return minutes.toString() + ' minute' + (minutes > 1 ? 's' : '') + ' ago';
    }
}

function prepareEventsList(events) {
    var days = [];
    var timeslots = [];
    var schedule = {};
    for (var i in events) {
	events[i].timeStart.setUTCHours(events[i].timeStart.getUTCHours() + parseInt(config.schedule.timezone_offset, 10));
	events[i].timeEnd.setUTCHours(events[i].timeEnd.getUTCHours() +  parseInt(config.schedule.timezone_offset, 10));
	var day = events[i].timeStart.toDateString();
	var timeslot = {timeStart: events[i].timeStart , timeEnd: events[i].timeEnd}; 
	if (!schedule[day]) {
	    days.push(day);
	    schedule[day] = {};
	    timeslots[day] = [];
	}
	if (!schedule[day][JSON.stringify(timeslot)]) {
	    schedule[day][JSON.stringify(timeslot)] = [];
	    timeslots[day].push(timeslot);
	}
	schedule[day][JSON.stringify(timeslot)].push(events[i]);
    }
    return [days, timeslots, schedule];
}

function addEvent(req, res, next, eventType, proposedBy) {
    if (!req.body.name){
	req.flash("error", "Missing event name");
	next();
    } else if (!req.body.day) {
	req.flash("error", "Missing event day");
	next();
    } else if (!req.body.start) {
	req.flash("error", "Missing event start time");
	next();
    } else if (!req.body.end) {
	req.flash("error", "Missing event end time");
	next();
    } 
    // uuid generation from http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
    var slug = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
    var event = new Event(
	{timeStart: parseDate(req.body.day + 'T' + String('0000' + (parseInt(req.body.start.replace(":",""), 10) - 100* parseInt(config.schedule.timezone_offset, 10))).slice(-4) + '00'),
	 timeEnd: parseDate(req.body.day + 'T' + String('0000' + (parseInt(req.body.end.replace(":",""), 10) - 100 * parseInt(config.schedule.timezone_offset, 10))).slice(-4) + '00'),
	 name: req.body.name,
	 presenters: req.body.presenters,
	 slug: slug,
	 confidentiality: req.body.confidentiality,
	 observers: req.body.observers,
	 eventType: eventType
	});
    if (proposedBy) {
	event.proposedBy = proposedBy._id;
    }
    if (places[req.body.room]) {
	event.room = places[req.body.room]._id;
    } else {
	req.flash('error', 'Failed to locate event “' + event.name + '” as it is set for a room with unknown shortname ' + req.body.room);			
    }
    event.save(function (err) {
	if (err) {
	    req.flash('error',err);
	} else {
	    if (event.proposedBy) {
		emitter.emit("newevent", event);
	    }
	    req.flash('info', req.body.name + ' successfully added to schedule')	 ;
	}
	next();
    });
}

function autoCheckout() {
    if (config.schedule.autocheckout) {
	var now = new Date();
	if (now.getUTCHours() +  parseInt(config.schedule.timezone_offset, 10) > parseInt(config.schedule.autocheckout, 10) / 100 || (now.getUTCHours() +  parseInt(config.schedule.timezone_offset, 10) == parseInt(config.schedule.autocheckout, 10) / 100 && now.getUTCMinutes() >= parseInt(config.schedule.autocheckout,10) % 100)) {
	    People.find({"lastKnownPosition.shortname": {$ne: null}}, "lastKnownPosition", function(err, people) {
		if (err) {
		    console.log("autocheckout query error: " + err);
		} else {
		    for (p in people) {
			var indiv = people[p];
			indiv.lastKnownPosition = { shortname: null, name:null, time: Date.now()};
			indiv.save(function(err) {
			    if (err) {
				console.log("autocheckout error: " + err);
			    }
			});
		    }
		}
	    });
	}
    }
}

// Routes
// Would be better in a post(/.*/) route but that breaks with express-namespace
// cf https://github.com/visionmedia/express-namespace/issues/5
function setFormatOutput(req) {
    // if the _format parameter is set, we set req.outputFormat
    if (req.body && req.body._format) {
	req.outputFormat = req.body._format;
    }    
}


app.namespace(config.hosting.basepath, function(){
    
    app.get('/', function(req, res){
	People.count({}, function(err, count) {
	    if (!count) {
		// no user, need to import data
		if (! req.loggedIn) {
		    return res.redirect(everyauth.password.getLoginPath());
		} else {
		    // Import basic data: people and rooms
		    imports.importUserList(app.get("w3c_auth"), function(success, info, errors) {
			req.flash("info", "First run, importing registrants list");
			if (success) success.forEach(function(i) { req.flash('success',i);});
			if (info) info.forEach(function(i) { req.flash('info',i);});
			if (errors) errors.forEach(function(i) { req.flash('error',i);});
			res.render('index');
		    });
		}
	    } else {
		// parameter to load list of status updates until the said date
		var until = new Date();
		if (req.query["until"]) {
		    until = parseDate(req.query.until);
		}
		var limit = 20;
		if (until > 0) {
		    limit = 1000;
		}
		Status.find({})
		    .sort('-time')
		    .limit(limit)
		    .where('time').lte(until)
		    .populate('author', 'given family slug picture_thumb')
		    .exec(function(err, statusupdates) { 
			if (err) return done(err);
			if (req.user) {
			    Event.count({"interested":req.user._id}, function(err, count) {
				res.render('index', {locals: {statusupdates: statusupdates, scheduledEvents: count, user: req.user}});
			    });
			} else {
			    res.render('index', {locals:  {statusupdates: statusupdates, user: req.user}});
			}
		    });
		     
	    }
	});
    });

    app.get('/about', function(req, res){
	res.render('about', {locals: {title: 'About W3Connect'}});
    });

    app.post('/admin/', function(req, res, next){
	if (! req.loggedIn) {
	    return res.redirect(everyauth.password.getLoginPath());
	}
	var isAdmin = new RegExp("^" + config.admin.login.replace(",","|") + "$");
	if (!isAdmin.test(req.user.login)) {
	    return res.render("403");
	}    
	if (req.body.peopleUpdate !== undefined) {
	    if (!app.get("w3c_auth")) {
		// in case user logged in a previous session
		// should find how to logout?
		return res.redirect(everyauth.password.getLoginPath());
	    }
	    imports.importUserList(app.get("w3c_auth"), function(success, info, errors) {
		if (success) success.forEach(function(i) { req.flash('success',i);});
		if (info) info.forEach(function(i) { req.flash('info',i);});
		if (errors) errors.forEach(function(i) { req.flash('error',i);});
		next();
	    });
	} else if (req.body.registrationUpdate !== undefined) {
	    imports.importRegistrationData(app.get("w3c_auth"), function(success, info, errors) {
		if (success) success.forEach(function(i) { req.flash('success',i);});
		if (info) info.forEach(function(i) { req.flash('info',i);});
		if (errors) errors.forEach(function(i) { req.flash('error',i);});
		next();
	    });    
	} else if (req.body.clearInterested !== undefined) {
	    var counter = 0;
	    Event.find(
		{}, 
		function(err, events) {
		    for (e in events) {
			var event = events[e];
			event.interested = [];
			event.save(
			    function(err) {
				counter++;
				if (counter == events.length) {
				    req.flash("info", "Cleared");
				    next();			      
				}
			    });
		    }
		});
	} else  if (req.body.placeAdd !== undefined) {
	    var place = new Place();
	    place.shortname = req.body.shortname;
	    place.name = req.body.name;
	    place.save(
		function(err) {
		    if (err) {
			req.flash("error", "Error while adding new place: " + err);
		    } else {
			req.flash("success", "New place added: " + p.name);
		    }
		    next();
		}
	    );
	} else if (req.body.placesUpdate !== undefined) {
	    var url = require("url").parse(config.map.rooms_json);
	    var http_client;
	    if (url.protocol == "http:") {
		http_client = http;
	    } else if (url.protocol == "https:") {
		http_client = https;
	    } else {
		req.flash("error", "Unrecognized protocol for room descriptions: " + config.map.rooms_json);
		next();
	    }
	    if (http_client) {
		var request = http_client.get({host: url.hostname, port: url.port , path: url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '')}, function (response) {
		    response.setEncoding('utf8');
		    var placesJSON = "", placesData;
		    response.on('data', function (chunk) {
			placesJSON = placesJSON + chunk;
		    });
		    response.on('end', function () {
			Place.find({}).remove();
			placesData = JSON.parse(placesJSON);
			for (i in placesData) {
			    var p = new Place(placesData[i]);
			    var counter = 0;
			    var addCounter = 0;
			    p.save(function (err) {
				counter++;
				if (err) {
				    req.flash('error',err);
				} else {
				    addCounter++;
				}
				if (counter == placesData.length) {
				    next();
				}
			    });
			}
		    });
		});
	    }
	} else if (req.body.twitterSetting !== undefined) {
	    if (!req.body.username) {
		req.flash("error", "Missing Twitter username");
		next();
	    } else if (!req.body.password) {
		req.flash("error", "Missing Twitter password");
		next();
	    }
	    TwitterSettings.findOne(
		{}, 
		function(err, settings) {
		    if (!settings) {
			settings = new TwitterSettings();
		    }
		    settings.username = req.body.username;
		    settings.password = req.body.password;
		    settings.save(function(err) {
			if (err)  { 
			    req.flash("error", "Saving Twitter settings failed with error " + err);
			} else {
			    req.flash("success", "Successfully saved Twitter settings");
			}
			next();
		    });
		});
	} else if (req.body.autocheckout) {
	    autoCheckout();
	    req.flash("success", "Autocheckout triggered");
	    next();
	} else {
	    next();
	}
    });

    app.all('/admin/', function(req, res){
	res.render('admin/index', {locals: { title: 'Administration'}});
    });

    app.post('/people/profile/:id.:format?', function(req, res, next){
	setFormatOutput(req);
	if (! req.loggedIn) {
	    return res.redirect(everyauth.password.getLoginPath());
	} else {
	    if (req.body.updateProfile !== undefined && req.body.twitter && req.user.slug == req.params.id) {
		twitterAccount = req.body.twitter.replace(/^@/, '');
		twitter.getTwitterId(twitterAccount, function(err, id) {
		    if (err) {
			req.flash("error", err);
			next();
		    } else {
			People.findOne({slug: req.params.id}).exec( function(err, indiv) {
			    if (err) {
				next();
			    } else {
				indiv.twitterAccount = {"name": twitterAccount, id: id};
				indiv.save(function(err) {
				    emitter.emit("newtwitteraccount", indiv);
				    // re-start twitter listener
				    emitter.emit("twitterListChange", id);
				    if (!err) {
					req.flash("success", "Successfully added your twitter account");
				    } else {
					req.flash("error", "Failed to add your twitter account: " + err);
				    }
				    next();
				});
			    }
			});
		    }
		});
	    } else {
		next();
	    }
	}
    });


    app.all('/people/profile/:id.:format?', function(req, res, next){
	People.findOne({slug: req.params.id}).populate('affiliation', 'slug name').exec( function(err, indiv) {
	    if (indiv) {
		Event.find({})
	    	    .populate('proposedBy')
		    .populate('room', 'name')
		//.$where('RegExp("^" + this.interested.join("|") + "$").test(' + indiv._id + ')')
	            .sort('timeStart')
		    .exec(function(err, events) {
			var days, timeslots, schedule;
			var userEvents = [];
			if (events) {
			    for (var i = 0; i < events.length ; i++) {
				var isInterested = new RegExp("^"  + events[i].interested.join("|") + "$");
				if (isInterested.test(indiv._id)) {
				    userEvents.push(events[i]);
				}
			    }
			    var data = prepareEventsList(userEvents);
			    days = data[0];
			    timeslots = data[1];
			    schedule = data[2];
			}
			Status.find({"author": indiv})
			    .sort("-time")
			    .limit(20)
			    .exec(function(err, statusupdates) {
				switch (req.params.format) {
				    // When json, generate suitable data
				case 'json':
				    res.send(indiv);
				    break;
				case 'ics':
				    res.set("Content-Type", "text/calendar");
				    var ical = new icalendar.iCalendar();
				    for (var i = 0 ; i < userEvents.length ; i++) {
					var  event = userEvents[i];
					var icalEv = new icalendar.VEvent(event.slug);
					icalEv.setSummary(event.name);
					if (event.room) {
					    icalEv.addProperty('LOCATION', event.room.name);
					}
					icalEv.setDate(event.timeStart.setUTCHours(event.timeStart.getUTCHours() - parseInt(config.schedule.timezone_offset, 10)),new Date(event.timeEnd.setUTCHours(event.timeEnd.getUTCHours() - parseInt(config.schedule.timezone_offset, 10))));
					ical.addComponent(icalEv);
				    }
				    res.send(ical.toString());
				    break;
				default:
				    res.render('people/indiv.ejs', { locals: { indiv: indiv, title: indiv.given + ' ' + indiv.family, days: days, timeslots: timeslots, schedule:schedule, statusupdates: statusupdates }});
				}
			    });
		    });
	    } else {
		next();
	    }
	});  
    });

    app.get('/locations.:format?', function(req, res) {
	var counter=0;
	if (Object.keys(places).length == 0) {
            return res.render('locations/index.ejs', { locals: { places: places, title: 'Rooms'}});
	}
	for (var p in places) {
	    People.find({"lastKnownPosition.shortname": places[p].shortname}, ['slug', 'given', 'family', 'picture_thumb'],  (function(place) { return function(err, people) {
		counter++;
		place.checkedin = people;
		if (counter==Object.keys(places).length) {	     
		    switch (req.params.format) {
			// When json, generate suitable data
		    case 'json':
			res.send(places);
			break;
		    default:
			res.render('locations/index.ejs', { locals: { places: places, title: 'Rooms'}});
		    }
		}
	    };})(places[p]));
	}		    
    });

    app.get('/locations/stream', function(req, res) {
	res.setHeader("Content-Type", 'text/event-stream');
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.writeHead(200);
	setInterval(function() { res.write(":\n"); }, 30000);
	emitter.on("checkin", function(user, left, entered) {
	    res.write("data: " + JSON.stringify({"user": user, "left": left, "entered": entered, "you": (req.user && JSON.stringify(user._id) == JSON.stringify(req.user._id))}) + "\n\n");
	});
	emitter.on("tweet", function(tweet) {
	    People.findOne(
		{"twitterAccount.id":tweet.user.id},
		"lastKnownPosition",
		function(err, indiv) {
		    res.write("event: tweet\n");
		    tweet.position = "";
		    if (indiv && indiv.lastKnownPosition && indiv.lastKnownPosition.shortname) {
			tweet.position = indiv.lastKnownPosition.shortname;
		    }
		    res.write("data: " + JSON.stringify(tweet) + "\n\n");		
		});
	});
    });


    function userCheckin(req, res, next, place) {
	// the user is already checked in in that place
	var actionNeeded = true;
	if (req.user.lastKnownPosition.shortname == place.shortname) {
	    if (req.body.checkin !== undefined) {
		actionNeeded = false;
		switch (req.outputFormat) {
		case "json":
		    res.send(JSON.stringify({success: "Already checked in at " + place.name}));
		    
		    break;
		default:
		    req.flash('info', "You’re already checked in at " + place.name);
		    if (next) next();
		}
	    }
	} else {
	    if (req.body.checkout !== undefined) {
		actionNeeded = false;
		switch (req.outputFormat) {
		case "json":
		    res.send(JSON.stringify({error: "You’re not checked in at " + place.name + ", so you can’t checkout from it"}));
		    
		    break;
		default:
		    req.flash('info', "You’re not checked in at " + place.name + ", so you can’t checkout from it");
		    if (next) next();
		}
	    }
	}
	if (actionNeeded) {
	    var indiv = req.user ;
	    var prevPosition = {shortname: indiv.lastKnownPosition.shortname,
				name: indiv.lastKnownPosition.name,
				time: indiv.lastKnownPosition.time};
	    var newPosition = {shortname: null, name: null, time: Date.now()};
	    if (req.body.checkin !== undefined) {
		newPosition.shortname = place.shortname;
		newPosition.name = place.name;
	    }
	    indiv.lastKnownPosition = newPosition; 
	    indiv.save(function(err) {
		req.flash('error',err);
		if (!err) {
		    emitter.emit("checkin", req.user, prevPosition, newPosition);
		}
		switch (req.outputFormat) {
                case 'json':
		    if (!err) { 
			res.send(JSON.stringify({success: (req.body.checkin !== undefined ? 'Checked in at ' + newPosition.name : "Checked out")}));
		    } else {
			res.send(JSON.stringify({error: err}));
		    }
    	            break;
                default:
		    if (!err) {
			req.flash('info', (req.body.checkin !== undefined ? 'Checked in at '  + newPosition.name : "Checked out"));
		    } else {
			req.flash('error', err);
		    }
		    if (next) next();
		}
	    });
	}

    }

    app.post('/locations/:id.:format?', function(req, res, next) {
	setFormatOutput(req);
	if (! req.loggedIn) {
	    req.session.redirectTo = '/locations/' + req.params.id;
	    return res.redirect(everyauth.password.getLoginPath());
	}
	var place = places[req.params.id];
	if (place) {
	    if ((req.body.checkin !== undefined || req.body.checkout !== undefined) && req.user) {
		userCheckin(req, res, next, place)
	    } else {
		next();
	    }
	} else {
	    next();
	}
    });



    app.all('/locations/:id.:format?', function(req, res) {
	var place = places[req.params.id];
	if (place) {
	    People.find({"lastKnownPosition.shortname": place.shortname}, ['slug', 'given', 'family', 'picture_thumb', 'lastKnownPosition'])
		.exec(function(err, people) {
		    people.sort(function (a,b) { return (a.lastKnownPosition.time > b.lastKnownPosition.time ? -1 : (b.lastKnownPosition.time  > a.lastKnownPosition.time ? 1 : 0));});
		    var current = new Date();
		    if (req.query.datetime) {
			current = parseDate(req.query.datetime);
			if (isNaN(current.getTime())) {
			    current = new Date();
			}
		    }
		    Event.findOne({"room": place._id})
			.where('timeStart').lte(current)
			.where('timeEnd').gte(current)
			.populate('proposedBy')
			.exec( 
			    function(err, event) {	  

				switch (req.params.format) {
				    // When json, generate suitable data
				case 'json':
				    var placeData = place.toObject();
				    placeData.checkedin = people.map(function(x) { return x.toObject();});
				    res.send(placeData);
				    break;
				default:
				    var render = function () {
					res.render('locations/place.ejs', { locals: { place: place, people: people, title: place.name, places:places, event: event}});
				    };
				    // auto-check-in if nfc is set in the query string
				    if (req.loggedIn && req.query["nfc"] === '') {
					req.body.checkin = true;
					userCheckin(req, res, render, place)		
				    } else {
					render();
				    }
				}
			    });
		});

	} else {
	    res.render('locations/unknown.ejs', {locals: { shortname: req.params.id, title: 'Unknown location'}});
	}
    });

    app.post("/locations/:id/admin", function(req,res, next) {
	if (req.body.placeUpdate !== undefined) {
	    if (!req.body.name) {
		req.flash("error", "Missing name of room to update");
		next();
	    }
	    var place = places[req.params.id];
	    if (!place) {
		req.flash("error", "No room found with shortname " + req.params.id);
		next();
	    }
	    place.name = req.body.name;
	    place.save(
		function(err) {
		    if (err) {
			req.flash("error", err);
		    } else {
			req.flash("success", "Room successfully updated");
		    }
		    next();
		});
	} else {
	    next();
	}
    });
    
    app.all("/locations/:id/admin", function(req,res, next) {
	var place = places[req.params.id];
	if (place) {
	    res.render("locations/admin.ejs", {locals: {place: place}});
	} else {
	    next();
	}
    });

    app.get('/people/:letter?.:format?', function (req, res, next){
	var letter = req.params.letter;
	if (!letter) {
	    letter = "a";
	} 
	if  (!(letter=='all' || letter.match(/^.$/))) {
	    next();
	}
	var people = People.find({})
	    .exec(function (err, people) {
		var activeLetters = {};
		var letterPeople = [];
		people.sort(function (a,b) { return a.family.toLowerCase().localeCompare(b.family.toLowerCase());});	
		for (var p in people) {
		    activeLetters[people[p].family[0].toUpperCase()]++;
		    if (letter != 'all' && people[p].family[0].toLowerCase() == letter.toLowerCase()) {
			letterPeople.push(people[p]);
		    }
		}
		if (letter == 'all') {
		    letterPeople = people;
		}
		switch (req.params.format) {
		    // When json, generate suitable data
		case 'json':
		    res.send(letterPeople);
		    break;
		default:
		    res.render('people/index.ejs', { locals: { activeLetters: activeLetters, letter: letter, people: letterPeople, title: 'People — ' + letter}});
		}
	    });
	
    });

    app.get('/orgs.:format?', function (req, res){
	var orgs = Organization.find({})
	    .populate('employees', 'login')
	    .exec( function (err, orgs) {
		orgs.sort(function (a,b) { return (a.name > b.name ? 1 : (b.name > a.name ? -1 : 0));});
		switch (req.params.format) {
		    // When json, generate suitable data
		case 'json':
		    res.send(orgs);
		    break;
		default:
		    res.render('orgs/index.ejs', { locals: { orgs: orgs, title: 'Organizations' }});
		}
	    });  
    });

    app.get('/orgs/:id.:format?', function(req, res, next){
	Organization.findOne({slug: req.params.id})
            .populate('employees', 'login slug given family picture_thumb')
	    .exec( function(err, org) {
		if (org) {
		    var employees = org.employees.slice(0); // slice(0) to work around bug in populating arrays
		    employees.sort(function (a,b) { return a.family.toLowerCase().localeCompare(b.family.toLowerCase());});
		    switch (req.params.format) {
		    case 'json':
			res.send(org);
			break;
		    default:
			res.render('orgs/org.ejs', { locals: { org: org, people:employees, title: org.name}}); 
		    }
		} else {
		    next();
		}
	    });  
    });

    app.post('/schedule/admin', function(req,res, next) {
	if (! req.loggedIn) {
	    return res.redirect(everyauth.password.getLoginPath());
	}
	var isAdmin = new RegExp("^" + config.admin.login.replace(",","|") + "$");
	if (!isAdmin.test(req.user.login)) {
	    return res.render("403");
	}    

	if (req.body.addEvent !== undefined) { 
	    addEvent(req, res, next, 'meeting', null);
	} else if (req.body.updateSchedule !== undefined) {
	    if (!req.body.schedule) {
		req.flash("error", "Missing URL of schedule");
		next();
	    }
	    var http_client;
	    var url = require("url").parse(req.body.schedule);
	    if (url.protocol == "http:") {
		http_client = http;
	    } else if (url.protocol == "https:") {
		http_client = https;
	    } else {
		req.flash("error", "Unrecognized protocol for room descriptions: " + config.map.rooms_json);
		next();
	    }
	    if (http_client) {
		var request = http_client.get({host: url.hostname, port: url.port , path: url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '')}, function (response) {
		    response.setEncoding('utf8');
		    var scheduleJSON = "", events;
		    response.on('data', function (chunk) {
			scheduleJSON = scheduleJSON + chunk;
		    });
		    response.on('end', function () {
			Event.find({}).remove();
			try {
			    events = JSON.parse(scheduleJSON);
			} catch (err) {
			    req.flash("error", "Couldn't parse schedule as JSON: " + err);
			    console.log(scheduleJSON);
			    next();
			}
			for (i in events) {
			    var e = events[i];
			    var counter = 0;
			    var addCounter = 0;
			    var event = new Event(
				{timeStart: parseDate(e.timeStart),
				 timeEnd: parseDate(e.timeEnd),
				 name: e.name,
				 presenters: e.presenters,
				 slug: e.slug,
				 confidentiality: e.confidentiality,
				 observers: e.observers
				});
			    if (places[e.room]) {
				event.room = places[e.room]._id;
			    } else {
				req.flash('error', 'Failed to locate event “' + e.name + '” as it is set for a room with unknown shortname ' + e.room);			
			    }
			    event.save(function (err) {
				counter++;
				if (err) {
				    req.flash('error',err);
				} else {
				    addCounter++;
				}
				if (counter == events.length) {
				    req.flash("success", "Schedule successfully loaded");
				    next();
				}
			    });
			}
		    });
		});
	    }
	} else {
	    next();
	}
    });

    app.all('/schedule/admin', function(req,res) {
	Event.find({})
	    .sort('timeStart name')
	    .populate('room', 'shortname name')
	    .populate('proposedBy')
	    .exec( 
		function(err, events) {
		    var data = prepareEventsList(events);
		    var days = data[0], timeslots = data[1], schedule = data[2];
		    res.render("schedule/admin", { locals: {title: "Schedule update", places: places, days: days, timeslots: timeslots, schedule:schedule, expanded: true, interestMarker: false, admin: true}});
		});
    });

    app.post("/schedule/events/:slug/updates", function(req, res, next) {
	Event.findOne({slug: req.params.slug}).exec(function(err, event) {
	    if (err) {
		next();
	    }
	    if (req.body.updateStatus !== undefined){    
		var status = new Status({time: Date.now(), statusType: "newtopic", content: "The topic “" + req.body.updateStatus + "” has been taken up in " + event.name});
		status.save();	  
	    }
	})
    });

    app.post("/schedule/events/:slug/admin", function(req, res, next) {
	if (! req.loggedIn) {
	    return res.redirect(everyauth.password.getLoginPath());
	}
	Event.findOne({slug: req.params.slug}).populate('proposedBy').exec(function(err, event) {
	    if (err) {
		next();
	    }
	    // only admin && event proposers can update
	    if (!event.proposedBy || req.user.login !== event.proposedBy.login) {
		var isAdmin = new RegExp("^" + config.admin.login.replace(",","|") + "$");
		if (!isAdmin.test(req.user.login)) {
		    return res.render("403");
		}    
	    }

	    if (req.body.updateEvent !== undefined){
		if (!req.body.name){
		    req.flash("error", "Missing event name");
		    next();
		} else if (!req.body.day) {
		    req.flash("error", "Missing event day");
		    next();
		} else if (!req.body.start) {
		    req.flash("error", "Missing event start time");
		    next();
		} else if (!req.body.end) {
		    req.flash("error", "Missing event end time");
		    next();
		}
		var room = places[req.body.room];
		if (!room) {
		    req.flash("error", "No known room with shortname" + req.body.room);
		}
		event.timeStart =  parseDate(req.body.day.replace(/-/g,'') + 'T' + String('0000'  + (parseInt(req.body.start.replace(":",""), 10) - 100* parseInt(config.schedule.timezone_offset, 10))).slice(-4) + '00');
		event.timeEnd =  parseDate(req.body.day.replace(/-/g,'') + 'T' + String('0000' + (parseInt(req.body.end.replace(":",""), 10) - 100 * parseInt(config.schedule.timezone_offset, 10))).slice(-4) + '00');
		if (req.body.ircchannel) {
		    event.ircChannel = req.body.ircchannel;
		}
		event.name= req.body.name;
		event.presenters= req.body.presenters;
		event.confidentiality = req.body.confidentiality;
		event.observers = req.body.observers;
		event.room = room._id;
		event.save(function (err) {
		    if (err) {
			req.flash('error',err);
		    } else {
			req.flash('success', req.body.name + ' successfully updated')	 ;
		    }
		    next();
		});
	    } else if (req.body.deleteEvent !== undefined) {
		if (!req.body.confirm){
		    req.flash("error", "If you really want to delete the event, you need to confirm so by checking the checkbox");
		    next();
		}
		event.remove(
		    function(err) {
			if (err) {
			    req.flash("error", err);
			    next();
			} else {
			    req.flash("success", "Event successfully deleted");
			    return res.redirect(config.hosting.basepath + '/schedule/admin');
			}
		    });
	    }
	});
    });

    app.all("/schedule/events/:slug/admin", function(req, res, next) {
	if (! req.loggedIn) {
	    return res.redirect(everyauth.password.getLoginPath());
	}

	Event.findOne({slug: req.params.slug}).populate('room').populate('proposedBy').exec(function(err, event) {
	    if (err) {
		next();
	    }
	    // only admin && event proposers can update
	    if (!event.proposedBy || req.user.login !== event.proposedBy.login) {
		var isAdmin = new RegExp("^" + config.admin.login.replace(",","|") + "$");
		if (!isAdmin.test(req.user.login)) {
		    return res.render("403");
		}    
	    }

	    res.render("schedule/event-admin", {locals: {title: "Update " + event.name, event: event, places: places, timezone_offset: parseInt(config.schedule.timezone_offset, 10)}});
	});
    });

    app.get('/schedule/stream', function(req, res) {
	res.setHeader("Content-Type", 'text/event-stream');
	res.setHeader("Cache-Control", "no-cache");
	res.setHeader("Connection", "keep-alive");
	res.writeHead(200);
	// Heroku requires activity to avoid request timeout
	setInterval(function() { res.write(":\n"); }, 30000);
	emitter.on("interest", function(user, event) {
	    res.write("event: interest\n" + "data:  "+ JSON.stringify({"user": user, "event": event}) + "\n\n");
	});
	emitter.on("uninterest", function(user, event) {
	    res.write("event: uninterest\n" + "data:  "+ JSON.stringify({"user": user, "event": event}) + "\n\n");
	});
    });


    app.post("/schedule/events/:slug/", function(req, res, next) {
	setFormatOutput(req);
	if (req.user && (req.body.interested  !== undefined || req.body.uninterested  !== undefined)) {	
	    Event.findOne({slug: req.params.slug}, function(err, event) {
		if (err) {
		    next();
		}
		var interestedList = event.interested.slice(0);
		var interested = [];
		var userFound = false;
		var success = false;
		for (var i in interestedList) {
		    if (interestedList[i].toString() == req.user._id.toString()) {
			userFound = true;
			if (req.body.uninterested == undefined) {
			    success = false;
			} else {
			    emitter.emit("uninterest", req.user, event);
			    success = true;
			}
		    } else {
			interested.push(interestedList[i]);
		    }
		}
		if (!userFound && req.body.interested !== undefined) {
		    interested.push(req.user._id);
		    emitter.emit("interest", req.user, event);
		    success = true;
		}
		if (!success) {
		    switch (req.outputFormat) {
		    case 'json':
			res.send(JSON.stringify({error: "no change"}));
			break;
		    default:
			req.flash("error", "no change");
			next();
		    }
		} else {
		    event.interested = interested;
		    event.save(function(err) {
			switch (req.outputFormat) {
			case "json":
			    if (!err) {
				res.send(JSON.stringify({success: 'Interest ' + (req.body.interested !== undefined ? "recorded for" : "removed from") + event.name}));
			    } else { 
				res.send(JSON.stringify({error: err}));                   
			    }
			    break;
			default:
			    if (!err) {
				req.flash('success', 'Interest recorded in '  + (req.body.interested !== undefined ? "recorded for " : "removed from ") + event.name);
			    } else {
				req.flash('error', err);
			    }
			    next();
			    break;
			}
		    });
		}
	    });
	} else {
	    next();
	}
    });

    app.all('/schedule/events/:slug.:format?', function(req, res, next) {
	Event.findOne({slug: req.params.slug})
	    .populate('room', 'shortname name')
	    .populate('proposedBy')
            .populate('interested')
	    .exec(
		function(err, event) {
		    if (err) {
			console.log("unknown event: " + err);
			next();
		    }
		    switch (req.params.format) {
		    case 'json':
			res.send(event);
			break;
		    default:
			res.render("schedule/event.ejs", {event: event, title: event.name, people: event.interested.slice(0)});
		    }
		});
    });

    app.post('/schedule/add', function (req, res, next) {
	if (! req.loggedIn) {
	    return res.redirect(everyauth.password.getLoginPath());
	}
	if (req.body.addEvent !== undefined) { 
	    addEvent(req, res, next, 'adhoc', req.user);
	} else {
	    next();
	}
    });

    app.all('/schedule/add', function (req, res, next) {
	if (! req.loggedIn) {
	    return res.redirect(everyauth.password.getLoginPath());
	}
	res.render('schedule/add.ejs');
    });


    app.get('/schedule/list.json', function (req, res, next) {
	Event.find({})
	    .populate('room', 'shortname name')
	    .sort('timeStart')
	    .populate('proposedBy')
	    .exec( 
		function(err, events) {
		    res.setHeader("Content-Type", 'application/json');
		    if (err) {
			res.send(JSON.stringify({"error": err}));
		    } else {
			res.send(events);
		    }
		});
    });

    app.all('/schedule/?(:datetime)?', function (req, res, next){
	var current = new Date();
	current.setUTCHours(current.getUTCHours() + parseInt(config.schedule.timezone_offset,10));
	if (req.params.datetime) {
	    current = parseDate(req.params.datetime);
	    // if the datetime param is not a valid date, pursue
	    if (isNaN(current.getTime())) {
		next();
	    }
	}
	Event.find({})
	    .populate('room', 'shortname name')
	    .sort('timeStart')
	    .populate('proposedBy')
	    .exec( 
		function(err, events) {
		    var days = [];
		    var timeslots = [];
		    var schedule = {};
		    var currentEvents = [];
		    var nextEvents = [];
		    var myEvents = [];
		    var currentTimeEnd;
		    events.sort(function (a,b) { return (a.timeStart > b.timeStart ? 1 : (b.timeStart > a.timeStart ? -1  : (a.room && b.room ? (a.room.name > b.room.name ? 1 : (b.room.name > a.room.name ? -1 : 0)) : 0)));});	    
		    for (var i in events) {
			events[i].timeStart.setUTCHours(events[i].timeStart.getUTCHours() + parseInt(config.schedule.timezone_offset, 10));
			events[i].timeEnd.setUTCHours(events[i].timeEnd.getUTCHours() +  parseInt(config.schedule.timezone_offset, 10));
			var day = events[i].timeStart.toDateString();
			var timeslot = {timeStart: events[i].timeStart , timeEnd: events[i].timeEnd}; 
			if (events[i].timeStart <= current && events[i].timeEnd >= current) {
			    currentTimeEnd = events[i].timeEnd;
			    currentEvents.push(events[i]);
			}
			if (currentTimeEnd && events[i].timeStart.toString() == currentTimeEnd.toString()) {
			    nextEvents.push(events[i]);
			}
			var isInterested = new RegExp("^"  + events[i].interested.join("|") + "$");
			if (req.user && isInterested.test(req.user._id)) {
			    myEvents.push(events[i]);
			}
			if (!schedule[day]) {
			    days.push(day);
			    schedule[day] = {};
			    timeslots[day] = [];
			}
			if (!schedule[day][JSON.stringify(timeslot)]) {
			    schedule[day][JSON.stringify(timeslot)] = [];
			    timeslots[day].push(timeslot);
			}
			schedule[day][JSON.stringify(timeslot)].push(events[i]);
		    }
		    res.render('schedule.ejs', {locals: {days: days, timeslots: timeslots, schedule:schedule, currentEvents: currentEvents, nextEvents: nextEvents, myEvents: myEvents, places: places, title: "Schedule", additionalScript:"/js/event-interest.js"}});
		});
    });

    /*
      app.get('/taxi/', function (req, res) {
      res.render('taxi/index.ejs');
      });


      app.post('/taxi/from',
      form(
      validate("airport").required().custom(function(n) { if (!( n in {'San Jose':1, 'San Francisco':1, 'Oakland':1})) throw new Error('%s is not valid airport');}),
      validate("terminal").required(),
      validate("arrival").required().regex("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]*)?)?", "%s must match YYYY-MM-DDTHH:mm(:ss)?")
      ),
      function (req, res, next) {
      if (! req.loggedIn) {
      req.session.redirectTo = '/taxi/from';
      return res.redirect(everyauth.password.getLoginPath());
      }
      if (!req.form.isValid) {
      next();
      } else {
      var taxi = new TaxiFromAirport({flight: {airport: req.form.airport, eta: req.form.arrival, airline: req.form.airline, code: req.form.code, terminal: req.form. terminal}, requester: req.user._id});
      taxi.save(function (err) {
      req.flash('error',err);
      next();
      });
      }
      });

      app.all('/taxi/from', function (req, res) {
      TaxiFromAirport.find({}).populate('requester', ['slug', 'given', 'family', 'picture_thumb']).run (function (err, taxi) {
      if (err) {
      req.flash('error',err);
      }
      res.render('taxi/from.ejs', {locals: {taxi: taxi}});
      });
      });


      app.post('/taxi/to',
      form(
      validate("airport").required().custom(function(n) { if (!( n in {'San Jose':1, 'San Francisco':1, 'Oakland':1})) throw new Error('%s is not valid airport');}),
      validate("departureDate").required().regex("[0-9]{4}-[0-9]{2}-[0-9]{2}", "%s must match YYYY-MM-DD"),
      validate("minDepartureTime").required().regex("[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]*)?)?", "%s must match HH:mm"),
      validate("maxDepartureTime").required().regex("[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]*)?)?", "%s must match HH:mm")
      ),
      function (req, res, next) {
      if (! req.loggedIn) {
      req.session.redirectTo = '/taxi/to';
      return res.redirect(everyauth.password.getLoginPath());
      }
      if (!req.form.isValid) {
      next();
      } else {
      var taxi = new TaxiToAirport({airport: req.form.airport, minTime: req.form.departureDate + 'T' + req.form.minDepartureTime + 'Z', maxTime: req.form.departureDate + 'T' + req.form.maxDepartureTime + 'Z', requester: req.user._id});
      taxi.save(function (err) {
      req.flash('error',err);
      next();
      });
      }

      });

      app.all('/taxi/to', function (req, res) {
      TaxiToAirport.find({}).populate('requester', ['slug', 'given', 'family', 'picture_thumb']).run( function (err, taxi) {
      if (err) {
      req.flash('error',err);
      }
      res.render('taxi/to.ejs', {locals: {taxi: taxi}});
      });
      });*/
});

if (require.main === module) {
    server.listen(  app.get('port'));
    console.log("Express server listening on port %d in %s mode", app.get('port'), app.settings.env);
}
