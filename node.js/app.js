
/**
 * Module dependencies.
 */

var express = require('express');
var everyauth = require('everyauth');



var app = module.exports = express.createServer();

var mongoose = require('mongoose'),
db = mongoose.connect('mongodb://localhost/tpac');

var People = require('./model.js').People(db);
var Organization = require('./model.js').Organization(db);
var Place = require('./model.js').Place(db);
var Settings = require('./model.js').Settings(db);

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
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('test', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
  //db = mongoose.connect('mongodb://localhost/tpac-test');
});


app.configure('development', function(){
  app.use(express.logger());
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.logger());
  app.use(express.errorHandler()); 
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
        var counter = 0;
        function addOrg(org, people) {
	    return function (err) {
	        if (err) {
		    console.log(err);
		} else {
		    additions.orgs.push(org);
		}
     	        people.save(addPeople(people));		      
	    };
	}
        function addPeople(people) {
  	  return function (err) {
               counter++;
	       if (err) {
                 console.log(err);		   
	       } else {
                  additions.people.push(people);  
	       }		
       	       if (counter == registrantsData.registrants.length) {
                res.render('admin/index', {
                  locals: {
	            additions : additions
	          },
                  title: 'TPAC Web App Administration'
                 });
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
		people.affiliation = peopleData.organization.w3cId;
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
    People.findOne({w3cId: req.params.id}, function(err, indiv) {
    switch (req.params.format) {
      // When json, generate suitable data
      case 'json':
        res.send(indiv);
	break;
      default:
	Organization.findOne({w3cId: indiv.affiliation}, function(err, org) {
	  res.render('people/indiv.ejs', { locals: { indiv: indiv, org: org}});
				 
        });
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
	  res.render('locations/place.ejs', { locals: { place: place, people: people}});
				 
        });
    }
   } else {
       res.render('locations/unknown.ejs', {locals: { shortname: req.params.id}});
   }
  });

});

app.post('/locations/:id.:format?', function(req, res) {
    Place.findOne({shortname: req.params.id}, function(err, place) {
    if (place) {
	if (req.body.checkin && req.body.user) {
	   People.findOne({login: req.body.user}, function (err, indiv) {
              if (indiv) {
	        indiv.lastKnownPosition = {};		      
	        indiv.lastKnownPosition.shortname = place.shortname; 
	        indiv.lastKnownPosition.name = place.name; 
	        indiv.lastKnownPosition.time = Date.now();
		indiv.save(function(err) {
           	  People.find({"lastKnownPosition.shortname": place.shortname}, function(err, people) {
		    res.render('locations/place.ejs', { locals: { place: place, people: people}});
	          });
	        });
	      } else {
		  console.log(err);
	      }
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
  //res.render('people/index.ejs', { locals: { people: [{given: "Dom"}, {given: "Amy"}]}});
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


app.listen(3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
