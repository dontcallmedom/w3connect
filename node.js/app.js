
/**
 * Module dependencies.
 */

var express = require('express');
var everyauth = require('everyauth'),
form = require("express-form"),
filter = form.filter,
validate = form.validate;


var app = module.exports = express.createServer();

var mongoose = require('mongoose'),
db = mongoose.connect('mongodb://localhost/tpac');

var People = require('./model.js').People(db);

var Organization = require('./model.js').Organization(db);
var Place = require('./model.js').Place(db);
var Settings = require('./model.js').Settings(db);
var TaxiFromAirport = require('./model.js').TaxiFromAirport(db);
var TaxiToAirport = require('./model.js').TaxiToAirport(db);

function loadPeopleData(id) {
   var http = require('http');
   var request = http.get({host: 'www.w3.org', path:'/2011/08/w3c-data/people/' + id}, function (response) {
     response.setEncoding('utf8');
     var peopleJSON = "", peopleData;
     response.on('data', function (chunk) {
       peopleJSON = peopleJSON + chunk;
     });
     response.on('end', function () {
       peopleData = JSON.parse(peopleJSON);
       People.findOne({w3cId: id}, function(err, people) {
           if (people && people.picture != peopleData.picture) {
	       people.picture = peopleData.picture;
	       people.save();
	   }
           if (people && people.picture_thumb != peopleData.thumbnail) {
	       people.picture_thumb = peopleData.thumbnail;
	       people.save();
	   }

       });
     });
  });
}



// Authentication 
// Session Store
var SessionMongoose = require("session-mongoose");
var mongooseSessionStore = new SessionMongoose({
    url: "mongodb://localhost/session",
    interval: 120000 // expiration check worker run interval in millisec (default: 60000)
});

everyauth.everymodule.findUserById( function (userId, callback) {
  People.findOne({login: userId}, callback);
});

// Adapted from everyauth ldap module
everyauth.password
  .getLoginPath('/login')
  .postLoginPath('/login') // Uri path that your login form POSTs to
  .loginView('login.ejs')
  .registerView('index.ejs')
  .loginSuccessRedirect('/')
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
      ldap.authenticate('ldaps','directory.w3.org',636,'uid=' + login + ',ou=people,dc=w3,dc=org', password, function(err, result) {
        if (err) {
          return promise.fail(err);
        }
	if (result === false) {
          errors = ['Login failed.'];
          return promise.fulfill(errors);
	} else {
          var user = {id: login};
          return promise.fulfill(user);	    
	}
      });
      return promise;
  })
  .getRegisterPath('/')
  .postRegisterPath('/')
  .registerUser(function() {
      return null;
   });


// Configuration

app.configure(function(){
   Settings.findOne({}, ['w3c_admin_user','w3c_admin_password'], function (err, data) {
      if (data) {
        app.set('w3c_auth', new Buffer(data.w3c_admin_user + ':' + data.w3c_admin_password).toString('base64')); 	  
      } else {
	  // Configure error, inform viewer
      }
   });
  app.use(express.logger());
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.set('port', 3000);
  app.use(express.bodyParser());
  app.use(express.static(__dirname + '/public'));
  app.use(express.methodOverride());
 app.use(express.cookieParser()); 
  app.use(express.session({store: mongooseSessionStore, secret:'abc'}));
  app.use(everyauth.middleware());
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



// Routes

app.get('/', function(req, res){
  res.render('index', {
    title: 'TPAC Web App'
  });
});

app.get('/admin/', function(req, res){
  res.render('admin/index', {
    title: 'TPAC Web App Administration'
  });
});

app.post('/admin/', function(req, res){
  if (req.body.peopleUpdate) {
   var https = require('https');
   console.log(app.set('w3c_auth'));

   var request = https.get({host: 'www.w3.org', path:'/2002/09/wbs/tpRegistrants-json.php?wgid=35125&qaireno=TPAC2011', headers: {Authorization: 'Basic ' + app.set('w3c_auth')}}, function (response) {
     response.setEncoding('utf8');
     var registrantsJSON = "", registrantsData;
     response.on('data', function (chunk) {
       registrantsJSON = registrantsJSON + chunk;
     });
     response.on('end', function () {
        registrantsData = JSON.parse(registrantsJSON);
        var additions = {orgs:[],people:[]}, errors;
        var counter = 0, counterAdded = 0;
        function addOrg(org, people) {
	    return function (err) {
		people.affiliation = org._id;
		// We ignore duplicate key errors
	        if (!err) {
                    req.flash('info', org.name + ' added');
		}
     	        people.save(addPeople(people));		      
	    };
	}
        function addPeople(people) {
  	  return function (err) {
               counter++;
		// We ignore duplicate key errors
	       if (!err) {
                 counterAdded++;
                 req.flash('info', people.given + ' ' + people.family + ' added');
	       }		
       	       if (counter == registrantsData.registrants.length) {
		if (!counterAdded) {
		    req.flash('info', 'No new data to import');
		}
                res.render('admin/index');
	       }
	     };
        }
        for (p in registrantsData.registrants) {
            var peopleData = registrantsData.registrants[p];
	    var people = new People();
	    people.given = peopleData.given;
	    people.family = peopleData.family;
	    people.email = peopleData.email;
	    people.login = peopleData.login;
	    people.w3cId = peopleData.w3cId;
	    loadPeopleData(people.w3cId);
	    if (peopleData.organization && peopleData.organization.w3cId) {
		var org = new Organization();
		org.w3cId = peopleData.organization.w3cId;
		org.name = peopleData.organization.name;
		org.save(addOrg(org, people));
	    } else {
  	      people.save(addPeople(people));		
	    }
	}
     });
   });
  } else  if (req.body.placeAdd) {
      var place = new Place();
      place.shortname = req.body.shortname;
      place.name = req.body.name;
      function addPlace(p) {
	  return function(err) { 
                res.render('admin/index', {
                  locals: {
	            placeAddition : p
	          }
                 });
	       };
      };
      place.save(addPlace(place));
  } else {
    res.render('admin/index', {
      title: 'TPAC Web App Administration'
    });      
  }
});


app.get('/people/:id.:format?', function(req, res){
    People.findOne({w3cId: req.params.id}).populate('affiliation').run( function(err, indiv) {
    switch (req.params.format) {
      // When json, generate suitable data
      case 'json':
        res.send(indiv);
	break;
      default:
	res.render('people/indiv.ejs', { locals: { indiv: indiv}});
    }
  });  
});

app.get('/locations.:format?', function(req, res) {
  Place.find({}, function (err, places) {
    places.sort(function (a,b) { return (a.name > b.name ? 1 : (b.name > a.name ? -1 : 0));});
    switch (req.params.format) {
      // When json, generate suitable data
      case 'json':
        res.send(places.map(function (p) {
          return p.__doc;
        }));
	break;
      default:
        res.render('locations/index.ejs', { locals: { places: places}});
    }
  });

});

app.get('/locations/:id.:format?', function(req, res) {
    Place.findOne({shortname: req.params.id}, function(err, place) {
    if (place) {
    switch (req.params.format) {
      // When json, generate suitable data
      case 'json':
        res.send(place);
	break;
      default:
	People.find({"lastKnownPosition.shortname": place.shortname}, function(err, people) {
	  people.sort(function (a,b) { return (a.lastKnownPosition.time > b.lastKnownPosition.time ? 1 : (b.lastKnownPosition.time  > a.lastKnownPosition.time ? -1 : 0));});
	  res.render('locations/place.ejs', { locals: { place: place, people: people}});
				 
        });
    }
   } else {
       res.render('locations/unknown.ejs', {locals: { shortname: req.params.id}});
   }
  });

});

app.post('/locations/:id.:format?', function(req, res) {
  if (! req.loggedIn) {
    req.session.redirectTo = '/locations/' + req.params.id;
    return res.redirect(everyauth.password.getLoginPath());
  }

    Place.findOne({shortname: req.params.id}, function(err, place) {
    if (place) {
	if (req.body.checkin && req.user) {
	   var indiv = req.user ;
	   indiv.lastKnownPosition = {};		      
	   indiv.lastKnownPosition.shortname = place.shortname; 
	   indiv.lastKnownPosition.name = place.name; 
	   indiv.lastKnownPosition.time = Date.now();
	   indiv.save(function(err) {
             req.flash('error',err);
	     if (!err) req.flash('info', 'Checked in at '  + place.name);
             People.find({"lastKnownPosition.shortname": place.shortname}, function(err, people) {
		res.render('locations/place.ejs', { locals: { place: place, people: people}});
	     });
	   });
	} else {
    switch (req.params.format) {
      // When json, generate suitable data
      case 'json':
        res.send(place);
	break;
      default:
	People.find({"lastKnownPosition.shortname": place.shortname}, function(err, people) {
	  res.render('locations/place.ejs', { locals: { place: place, people: people}});
				 
        });
    }
	    
	}
   } else {
       res.render('locations/unknown.ejs', {locals: { shortname: req.params.id}});
   }
  });

});


app.get('/people.:format?', function (req, res){
  var people = People.find({}, function (err, people) {
    people.sort(function (a,b) { return (a.family > b.family ? 1 : (b.family > a.family ? -1 : 0));});
    switch (req.params.format) {
      // When json, generate suitable data
      case 'json':
        res.send(people.map(function (p) {
          return p.__doc;
        }));
	break;
      default:
        res.render('people/index.ejs', { locals: { people: people}});
    }
  });
  
});

app.get('/orgs.:format?', function (req, res){
  var orgs = Organization.find({}, function (err, orgs) {
    orgs.sort(function (a,b) { return (a.name > b.name ? 1 : (b.name > a.name ? -1 : 0));});
    switch (req.params.format) {
      // When json, generate suitable data
      case 'json':
        res.send(org.map(function (p) {
          return p.__doc;
        }));
	break;
      default:
        res.render('orgs/index.ejs', { locals: { orgs: orgs}});
    }
  });  
});


app.get('/taxi/', function (req, res) {
  res.render('taxi/index.ejs');
});

app.get('/taxi/from', function (req, res) {
  TaxiFromAirport.find({}).populate('requester').run (function (err, taxi) {
     req.flash('error',err);
     res.render('taxi/from.ejs', {locals: {taxi: taxi}});
});
});

app.post('/taxi/from',
  form(
	 validate("airport").required().custom(function(n) { if (!( n in {'San Jose':1, 'San Francisco':1, 'Oakland':1})) throw new Error('%s is not valid airport');}),
	 validate("terminal").required(),
	 validate("arrival").required().regex("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]*)?)?", "%s must match YYYY-MM-DDTHH:mm(:ss)?")
  ),
  function (req, res) {
  if (! req.loggedIn) {
    req.session.redirectTo = '/taxi/from';
    return res.redirect(everyauth.password.getLoginPath());
  }
  if (!req.form.isValid) {
       TaxiFromAirport.find({}).populate('requester').run( function (err, taxi) {
	 req.flash('error',err);
 	 res.render('taxi/from.ejs', {locals: {taxi: taxi}});
        });
  } else {
     var taxi = new TaxiFromAirport({flight: {airport: req.form.airport, eta: req.form.arrival, airline: req.form.airline, code: req.form.code, terminal: req.form. terminal}, requester: req.user._id});
     taxi.save(function (err) {
       req.flash('error',err);
       TaxiFromAirport.find({}).populate('requester').run( function (err, taxi) {
	 req.flash('error',err);
 	 res.render('taxi/from.ejs', {locals: {taxi: taxi}});
        });
      });
  }
});



app.get('/taxi/to', function (req, res) {
  TaxiToAirport.find({}).populate('requester').run( function (err, taxi) {
     req.flash('error',err);
     res.render('taxi/to.ejs', {locals: {taxi: taxi}});
  });
});

app.post('/taxi/to',
  form(
	 validate("airport").required().custom(function(n) { if (!( n in {'San Jose':1, 'San Francisco':1, 'Oakland':1})) throw new Error('%s is not valid airport');}),
	 validate("departureDate").required().regex("[0-9]{4}-[0-9]{2}-[0-9]{2}", "%s must match YYYY-MM-DD"),
	 validate("minDepartureTime").required().regex("[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]*)?)?", "%s must match HH:mm"),
	 validate("maxDepartureTime").required().regex("[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]*)?)?", "%s must match HH:mm")
  ),
  function (req, res) {
  if (! req.loggedIn) {
    req.session.redirectTo = '/taxi/to';
    return res.redirect(everyauth.password.getLoginPath());
  }
  if (!req.form.isValid) {
       TaxiToAirport.find({}).populate('requester').run( function (err, taxi) {
	 req.flash('error',err);
 	 res.render('taxi/to.ejs', {locals: {taxi: taxi}});
        });
  } else {
     var taxi = new TaxiToAirport({airport: req.form.airport, minTime: req.form.departureDate + 'T' + req.form.minDepartureTime + 'Z', maxTime: req.form.departureDate + 'T' + req.form.maxDepartureTime + 'Z', requester: req.user._id});
     taxi.save(function (err) {
       req.flash('error',err);
       TaxiToAirport.find({}).populate('requester').run( function (err, taxi) {
	 req.flash('error',err);
 	 res.render('taxi/to.ejs', {locals: {taxi: taxi}});
        });
      });
  }

});

everyauth.helpExpress(app);
app.dynamicHelpers({ messages: require('express-messages') });
app.listen(  app.set('port'));
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
