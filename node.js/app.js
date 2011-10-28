
/**
 * Module dependencies.
 */

var express = require('express');
require("express-namespace");
var everyauth = require('everyauth'),
    EventEmitter = require('events').EventEmitter;
var imports = require("./imports.js"),
    twitter = require("./twitter.js");


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

var app;
if (config.https.key_file && config.https.certificate_file) {
    app = express.createServer({key: fs.readFileSync(config.https.key_file), cert: fs.readFileSync(config.https.certificate_file)});
} else {
    app = express.createServer();
}
module.exports = app;

var emitter = new EventEmitter();


var mongoose = require('mongoose'),
db = mongoose.connect('mongodb://' + config.mongo.host + '/' + config.mongo.dbname);
var People = require('./model.js').People(db);

var Organization = require('./model.js').Organization(db);
var Place = require('./model.js').Place(db);
var Event = require('./model.js').Event(db);
var TaxiFromAirport = require('./model.js').TaxiFromAirport(db);
var TaxiToAirport = require('./model.js').TaxiToAirport(db);
var TwitterSettings = require('./model.js').TwitterSettings(db);


// Authentication 
// Session Store
var SessionMongoose = require("session-mongoose");
var mongooseSessionStore = new SessionMongoose({
    url: "mongodb://" + config.mongo.host + '/'  + config.authentication.session_db,
    interval: 120000 // expiration check worker run interval in millisec (default: 60000)
});

everyauth.everymodule.logoutPath(config.hosting.basepath + '/logout');

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

// Adapted from everyauth ldap module
everyauth.password
   .logoutRedirectPath(config.hosting.basepath + '/login')
  .getLoginPath(config.hosting.basepath + '/login')
  .postLoginPath(config.hosting.basepath + '/login') // Uri path that your login form POSTs to
  .loginView('login.ejs')
  .registerView('index.ejs') // @@@ need fixing
  .loginSuccessRedirect(config.hosting.basepath + '/')
  /*.respondToLoginSucceed( function (res, user, data) {
    if (user) {
      res.writeHead(303, {'Location': data.session.redirectTo});
      res.end();
    }   
  })*/
  .authenticate( function (login, password) {
    var promise = this.Promise();  
    var errors = [];
      if (!login) errors.push('Missing login');
      if (!password) errors.push('Missing password');
      if (errors.length) return errors;
      var ldap = require('./ldapauth');
      // modified version of ldapauth that takes an additional scheme parameter available from https://github.com/dontcallmedom/node-ldapauth
      console.log(config.ldap);
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
  })
  .getRegisterPath(config.hosting.basepath + '/')
  .postRegisterPath(config.hosting.basepath + '/')
  .registerUser(function() {
      return null;
   });


// Configuration

app.configure(function(){
  emitter.setMaxListeners(0);
  app.use(express.logger());
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.set('port', 3000);
  app.use(express.bodyParser());
  app.use(config.hosting.basepath, express.static(__dirname + '/public', { maxAge: 86400000}));
  app.use(express.methodOverride());
 app.use(express.cookieParser()); 
  app.use(express.session({store: mongooseSessionStore, secret:config.authentication.session_secret}));
  app.use(everyauth.middleware());
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
		  if (!settings.ids || !settings.ids.length) {
		      if (!settings.ids) {
			  settings.ids = [];
		      }
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
					  twitter.listenToTweets(emitter, settings.ids, app.set('twitter_auth'));
				      });
			      }
			  } else {
			      settings.save();
			      twitter.listenToTweets(emitter, settings.ids, app.set('twitter_auth'));
			  }
		      });
		  } else {
		      twitter.listenToTweets(emitter, settings.ids, app.set('twitter_auth'));
		  }
	      }
	  }
      });
});

app.configure('test', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
  //db = mongoose.connect('mongodb://localhost/tpac-test');
});


app.configure('development', function(){
  everyauth.debug = true;
  app.use(express.logger());
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.logger());
  app.use(express.errorHandler()); 
  app.set('port', 80);
});


// update twitter search on registering new twitter id
emitter.on("twitterListChange", function (id) {
    TwitterSettings.findOne(
	{}, 
	function(err, settings) {
	    var ids = settings.ids;
	    ids.push(id);
	    settings.ids = ids;
	    twitter.listenToTweets(emitter, ids, app.set('twitter_auth'));
	    settings.save();
	}
    );
});

// Utility function
// Parses YYYYMMDDTHHmm into a Date object
function parseDate(datestring) {
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


// Routes

app.error(function(err, req, res, next){
  res.send(err.message, 500);
});

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
  // skipped by middleware at this point, need fixing @@@
  People.count({}, function(err, count) {
      if (!count) {
	  // no user, need to import data
	  if (! req.loggedIn) {
	      return res.redirect(everyauth.password.getLoginPath());
	  } else {
	      // Import basic data: people and rooms
	      imports.importUserList(app.set("w3c_auth"), function(success, info, errors) {
		  req.flash("info", "First run, importing registrants list");
		  if (success) success.forEach(function(i) { req.flash('success',i);});
		  if (info) info.forEach(function(i) { req.flash('info',i);});
		  if (errors) errors.forEach(function(i) { req.flash('error',i);});
		  res.render('index');
	      });
	  }
      } else {
	  res.render('index');
      }
  });
});

app.get('/about', function(req, res){
	    res.render('about', {locals: {title: 'About W3Connect'}});
});

app.post('/admin/', function(req, res, next){
  if (req.body.peopleUpdate) {
    if (! req.loggedIn) {
      return res.redirect(everyauth.password.getLoginPath());
    } else if (!app.set("w3c_auth")) {
	// in case user logged in a previous session
	// should find how to logout?
	return res.redirect(everyauth.password.getLoginPath());
    }
    var isAdmin = new RegExp("^" + config.admin.login.replace(",","|") + "$");
    if (!isAdmin.test(req.user.login)) {
	return res.render("403");
    }    
      imports.importUserList(app.set("w3c_auth"), function(success, info, errors) {
	  if (success) success.forEach(function(i) { req.flash('success',i);});
	  if (info) info.forEach(function(i) { req.flash('info',i);});
	  if (errors) errors.forEach(function(i) { req.flash('error',i);});
	  next();
      });
  } else if (req.body.registrationUpdate) {
      imports.importRegistrationData(app.set("w3c_auth"), function(success, info, errors) {
	  if (success) success.forEach(function(i) { req.flash('success',i);});
	  if (info) info.forEach(function(i) { req.flash('info',i);});
	  if (errors) errors.forEach(function(i) { req.flash('error',i);});
	  next();
      });    
  } else if (req.body.clearInterested) {
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

  } else  if (req.body.placeAdd) {
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
  } else if (req.body.placesUpdate) {
      var url = require("url").parse(config.map.rooms_json);
      var http;
      if (url.protocol == "http:") {
	  http = require('http');
      } else if (url.protocol == "https:") {
	  http = require('https');
      } else {
	  req.flash("error", "Unrecognized protocol for room descriptions: " + config.map.rooms_json);
	  next();
      }
      if (http) {
	  var request = http.get({host: url.hostname, port: url.port , path: url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '')}, function (response) {
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
  } else if (req.body.twitterSetting) {
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
	if (req.body.updateProfile && req.body.twitter && req.user.slug == req.params.id) {
	    twitter.getTwitterId(req.body.twitter, function(err, id) {
		if (err) {
		    req.flash("error", err);
		    next();
		} else {
		    People.findOne({slug: req.params.id}).run( function(err, indiv) {
			if (err) {
			    next();
			} else {
			    indiv.twitterAccount = {"name": req.body.twitter, id: id};
			    indiv.save(function(err) {
				// re-start twitter listener
				emitter.emit("twitterListChange");
				TwitterSettings.findOne(
				    {}, 
				    function(err, settings) {
					var ids = settings.ids;
					ids.push(id);
					settings.ids = ids;
					twitter.listenToTweets(emitter, ids, app.set('twitter_auth'));
					settings.save();
				    }
				);
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
    People.findOne({slug: req.params.id}).populate('affiliation', ['slug', 'name']).run( function(err, indiv) {
	if (indiv) {
	    switch (req.params.format) {
		// When json, generate suitable data
	    case 'json':
		res.send(indiv);
		break;
	    default:
		res.render('people/indiv.ejs', { locals: { indiv: indiv, title: indiv.given + ' ' + indiv.family }});
	    }
	} else {
	    next();
	}
  });  
});

app.get('/locations.:format?', function(req, res) {
  Place.find({}).asc('name').run( function (err, places) {
    var counter=0;
    for (p in places) {
      People.find({"lastKnownPosition.shortname": places[p].shortname}, ['slug', 'given', 'family', 'picture_thumb'],  (function(place) { return function(err, people) {
         counter++;
         place.checkedin = people;
         if (counter==places.length) {	     
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
	    ["lastKnownPosition"],
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


app.post('/locations/:id.:format?', function(req, res, next) {
  setFormatOutput(req);
  if (! req.loggedIn) {
    req.session.redirectTo = '/locations/' + req.params.id;
    return res.redirect(everyauth.password.getLoginPath());
  }
    Place.findOne({shortname: req.params.id}, function(err, place) {
    if (place) {
	if (req.body.checkin && req.user) {
	    // the user is already checked in in that place
	    if (req.user.lastKnownPosition.shortname == place.shortname) {
		switch (req.outputFormat) {
		case "json":
		    res.send(JSON.stringify({success: "Already checked in at " + place.name}));
		    break;
		default:
		    req.flash('info', "You’re already checked in at " + place.name);
		    next();
		}
	    } else {
	   var indiv = req.user ;
	    var prevPosition = {shortname: indiv.lastKnownPosition.shortname,
				name: indiv.lastKnownPosition.name,
				time: indiv.lastKnownPosition.time};
	   indiv.lastKnownPosition = {};		      
	   indiv.lastKnownPosition.shortname = place.shortname; 
	   indiv.lastKnownPosition.name = place.name; 
	   indiv.lastKnownPosition.time = Date.now();
	   indiv.save(function(err) {
             req.flash('error',err);
	       if (!err) {
		   emitter.emit("checkin", req.user, prevPosition, place);
	       }
               switch (req.outputFormat) {
                 case 'json':
		   if (!err) { 
                     res.send(JSON.stringify({success: 'Checked in at ' + place.name}));
		   } else {
		     res.send({error: err});
		   }
    	           break;
                 default:
		   if (!err) {
		     req.flash('info', 'Checked in at '  + place.name);
		   } else {
		       req.flash('error', err);
		   }
		   next();
	       }
	   });
	    }
	} else {
	    next();
	}
   } else {
       next();
   }
  });

});

app.all('/locations/:id.:format?', function(req, res) {
  Place.find({}).asc('name').run( function (err, places) {
    places.sort(function (a,b) { return (a.name > b.name ? 1 : (b.name > a.name ? -1 : 0));});
    Place.findOne({shortname: req.params.id}, function(err, place) {
    if (place) {
      People.find({"lastKnownPosition.shortname": place.shortname}, ['slug', 'given', 'family', 'picture_thumb'], function(err, people) {
	people.sort(function (a,b) { return (a.lastKnownPosition.time > b.lastKnownPosition.time ? 1 : (b.lastKnownPosition.time  > a.lastKnownPosition.time ? -1 : 0));});
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
		.run( 
		    function(err, event) {	  

        switch (req.params.format) {
	    // When json, generate suitable data
	case 'json':
	    var placeData = place.toObject();
	    placeData.checkedin = people.map(function(x) { return x.toObject();});
            res.send(placeData);
	    break;
	default:
	    res.render('locations/place.ejs', { locals: { place: place, people: people, title: place.name, places:places, event: event}});
	}
      });
    });

    } else {
       res.render('locations/unknown.ejs', {locals: { shortname: req.params.id, title: 'Unknown location'}});
   }
  });
  });
});



app.get('/people/:letter?.:format?', function (req, res, next){
  var letter = req.params.letter;
  if (!letter) {
      letter = "a";
  } 
  if  (!(letter=='all' || letter.match(/^[a-z]$/))) {
      next();
  }
  var filter = new RegExp('^' + letter, 'i');
  if (letter=='all') {
      filter = new RegExp('.*');
  }
  var people = People.find({})
	        .where('family', filter)
		.run(function (err, people) {
    people.sort(function (a,b) { return (a.family > b.family ? 1 : (b.family > a.family ? -1 : 0));});
    switch (req.params.format) {
      // When json, generate suitable data
      case 'json':
        res.send(people);
	break;
      default:
        res.render('people/index.ejs', { locals: { letter: letter, people: people, title: 'People — ' + letter}});
    }
  });
  
});

app.get('/orgs.:format?', function (req, res){
  var orgs = Organization.find({})
		.populate('employees', ['login'])
		.run( function (err, orgs) {
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
        .populate('employees', ['login', 'slug', 'given', 'family', 'picture_thumb'])
	.run( function(err, org) {
	    if (org) {
		var employees = org.employees.slice(0); // slice(0) to work around bug in populating arrays
		employees.sort(function (a,b) { return (a.family > b.family ? 1 : (b.family > a.family ? -1 : 0));});
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

  if (req.body.addEvent) { 
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
      var places = {};
      Place.find({}, function(err, rooms) {
	  if (err) {
	      req.flash("error", "No room known in the system; load the list of rooms before loading the schedule");
	      next();
	  }
	  for (i in rooms) {
	      places[rooms[i].shortname] = rooms[i];
	  }

      var event = new Event(
	  {timeStart: parseDate(req.body.day + 'T' + ('' + (parseInt(req.body.start.replace(":",""),10) - 100* parseInt(config.schedule.timezone_offset, 10))).replace(/^([0-9])$/, '0$1') + '00'),
	   timeEnd: parseDate(req.body.day + 'T' + ('' + (parseInt(req.body.end.replace(":",""),10) - 100 * parseInt(config.schedule.timezone_offset, 10))).replace(/^([0-9])$/, '0$1') + '00'),
	   name: req.body.name,
	   presenters: req.body.presenters,
	   slug: require("slug")(req.body.name),
	   confidentiality: req.body.confidentiality,
	   observers: req.body.observers
	  });
         if (places[req.body.room]) {
	    event.room = places[req.body.room]._id;
         } else {
	    req.flash('error', 'Failed to locate event “' + event.name + '” as it is set for a room with unknown shortname ' + req.body.room);			
         }
      event.save(function (err) {
		     if (err) {
			 req.flash('error',err);
		     } else {
		         req.flash('info', req.body.name + ' successfully added to schedule')	 ;
		     }
		     next();
      });
    });
  } else if (req.body.updateSchedule) {
      if (!req.body.schedule) {
	  req.flash("error", "Missing URL of schedule");
	  next();
      }
      var places = {};
      Place.find({}, function(err, rooms) {
	  if (err) {
	      req.flash("error", "No room known in the system; load the list of rooms before loading the schedule");
	      next();
	  }
	  for (i in rooms) {
	      places[rooms[i].shortname] = rooms[i];
	  }
      var http;
      var url = require("url").parse(req.body.schedule);
      if (url.protocol == "http:") {
	  http = require('http');
      } else if (url.protocol == "https:") {
	  http = require('https');
      } else {
	  req.flash("error", "Unrecognized protocol for room descriptions: " + config.map.rooms_json);
	  next();
      }
      if (http) {
	  var request = http.get({host: url.hostname, port: url.port , path: url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '')}, function (response) {
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
  });
 } else {
     next();
 }
});

app.all('/schedule/admin', function(req,res) {
  Place.find({}).asc('name').run( function (err, places) {
    Event.find({})
	        .asc('timeStart', 'name')
		.populate('room', ['shortname','name'])
		.run( 
	function(err, events) {
	    var days = [];
	    var timeslots = [];
	    var schedule = {};
	    for (var i in events) {
		var day = events[i].timeStart.toDateString();
		events[i].timeStart.setUTCHours(events[i].timeStart.getUTCHours() + parseInt(config.schedule.timezone_offset, 10));
		events[i].timeEnd.setUTCHours(events[i].timeEnd.getUTCHours() +  parseInt(config.schedule.timezone_offset,10));
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
        res.render("schedule/admin", { locals: {title: "Schedule update", places: places, days: days, timeslots: timeslots, schedule:schedule, expanded: true, interestMarker: false, admin: true}});
    });
  });
});

app.post("/schedule/events/:slug/admin", function(req, res, next) {
    if (! req.loggedIn) {
      return res.redirect(everyauth.password.getLoginPath());
    }
    var isAdmin = new RegExp("^" + config.admin.login.replace(",","|") + "$");
    if (!isAdmin.test(req.user.login)) {
	return res.render("403");
    }    
    Event.findOne({slug: req.params.slug}, function(err, event) {
      if (err) {
	 next();
      }
      if (req.body.updateEvent){
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
      Place.findOne({shortname: req.body.room}, function(err, room) {
	  if (err) {
	      req.flash("error", "No known room with shortname" + req.body.room);
	  }
	  event.timeStart =  parseDate(req.body.day.replace(/-/g,'') + 'T' + (parseInt(req.body.start.replace(":",""),10) - 100* parseInt(config.schedule.timezone_offset, 10)).toString().replace(/^([0-9])$/, '0$1') + '00');
	  event.timeEnd =  parseDate(req.body.day.replace(/-/g,'') + 'T' + (parseInt(req.body.end.replace(":",""),10) - 100 * parseInt(config.schedule.timezone_offset, 10)).toString().replace(/^([0-9])$/, '0$1') + '00');
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
    });
      } else if (req.body.deleteEvent) {
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
  Place.find({}).asc('name').run( function (err, places) {
    Event.findOne({slug: req.params.slug}).populate('room').run(function(err, event) {
	if (err) {
	    next();
	}
        res.render("schedule/event-admin", {locals: {title: "Update " + event.name, event: event, places: places, timezone_offset: parseInt(config.schedule.timezone_offset, 10)}});
    });
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
    if (req.user && (req.body.interested || req.body.uninterested)) {	
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
		    if (!req.body.uninterested) {
			success = false;
		    } else {
			emitter.emit("uninterest", req.user, event);
			success = true;
		    }
		} else {
		    interested.push(interestedList[i]);
		}
	    }
	    if (!userFound && req.body.interested) {
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
			    res.send(JSON.stringify({success: 'Interest ' + (req.body.interested ? "recorded for" : "removed from") + event.name}));
			} else { 
			    res.send({error: err});                   
			}
			break;
		    default:
			if (!err) {
			    req.flash('success', 'Interest recorded in '  + (req.body.interested ? "recorded for " : "removed from ") + event.name);
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
	.populate('room', ['shortname', 'name'])
	.run(
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
		    res.render("schedule/event.ejs", {event: event, title: event.name});
		}
	    });
});

app.get('/schedule/?(:datetime)?', function (req, res, next){
    var current = new Date();
    current.setUTCHours(current.getUTCHours() + config.schedule.timezone_offset);
    if (req.params.datetime) {
	current = parseDate(req.params.datetime);
	// if the datetime param is not a valid date, pursue
	if (isNaN(current.getTime())) {
	    next();
	}
    }
    Event.find({})
	        .asc('timeStart', 'name')
		.populate('room', ['shortname','name'])
		.run( 
	function(err, events) {
	    var days = [];
	    var timeslots = [];
	    var schedule = {};
	    var currentEvents = [];
	    var nextEvents = [];
	    var myEvents = [];
	    var currentTimeEnd;
	    for (var i in events) {
		events[i].timeStart.setUTCHours(events[i].timeStart.getUTCHours() + parseInt(config.schedule.timezone_offset, 10));
		events[i].timeEnd.setUTCHours(events[i].timeEnd.getUTCHours() +  parseInt(config.schedule.timezone_offset,10));
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
	    res.render('schedule.ejs', {locals: {days: days, timeslots: timeslots, schedule:schedule, currentEvents: currentEvents, nextEvents: nextEvents, myEvents: myEvents, title: "Schedule", script:"/js/event-interest.js"}});
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

everyauth.helpExpress(app);
app.helpers({baseurl: config.hosting.basepath});
app.dynamicHelpers({ messages: require('express-messages') , url: function(req, res) { return require("url").parse(req.url).pathname;} });
app.listen(  app.set('port'));
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
