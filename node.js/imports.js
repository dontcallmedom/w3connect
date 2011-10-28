// should get it from elsewhere
var mongoose = require('mongoose'),
db = mongoose.connect('mongodb://localhost/tpac');

var People = require('./model.js').People(db);
var Event = require('./model.js').Event(db);
var Organization = require('./model.js').Organization(db);

function loadPeopleData(id) {
   var http = require('http');
   var request = http.get({host: 'www.w3.org', path:'/2011/08/w3c-data/people/' + id}, function (response) {
     response.setEncoding('utf8');
     var peopleJSON = "", peopleData;
     response.on('data', function (chunk) {
       peopleJSON = peopleJSON + chunk;
     });
     response.on('end', function () {
	 
		     try {
       peopleData = JSON.parse(peopleJSON);
       People.findOne({slug: id}, function(err, people) {
           if (people && peopleData.picture && people.picture != peopleData.picture) {
	       people.picture = peopleData.picture;
	       people.save(function(err) { console.log(err);});
	   }
           if (people && peopleData.thumbnail && people.picture_thumb != peopleData.thumbnail) {
	       people.picture_thumb = peopleData.thumbnail;
	       people.save(function(err) { console.log(err);});
	   }

       });			 
		     } catch (x) {
			 console.log("Retrieved http://www.w3.org/2011/08/w3c-data/people/" + id);
			 console.log(peopleJSON);
		     }
     });
  });
}

exports.importUserList = function(auth, callback)  {
   var https = require('https');
    var success = [];
    var info = [];
    var errors = [];
   var request = https.get({host: 'www.w3.org', path:'/2002/09/wbs/tpRegistrants-json.php?wgid=35125&qaireno=TPAC2011', headers: {Authorization: 'Basic ' + auth}}, function (response) {
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
		// assume duplicate key errors
	        if (err) {
		    Organization.findOne({slug: people.affiliationId}, ["_id", "name"], function(err, org) {
		    if (org) {
			people.affiliation = org._id;
		    }
     	            people.save(addPeople(people));		    
		    });
		} else {
		    success.push(org.name + ' added');
		    people.affiliation = org._id;
     	            people.save(addPeople(people));		      
		}
	    };
	}
        function addPeople(people) {
  	  return function (err) {
               counter++;
		// We ignore duplicate key errors
	       if (err){
		   console.log(err);
	       }
	       if (!err) {
                 counterAdded++;
                 success.push(people.given + ' ' + people.family + ' added');
		 // update list of employees
  	         Organization.findById(people.affiliation
                     // closure to add employee to org record
				    , (function (p) {
					return function (err, org) {
					if (org) {
					    org.employees.push(people._id);
					    org.save();
					}};})(people) );
	       }
       	       if (counter == registrantsData.registrants.length) {
		if (!counterAdded) {
		    info.push('No new data to import');
		}
		callback(success, info, errors);
	       }
	     };
        }
        for (p in registrantsData.registrants) {
            var peopleData = registrantsData.registrants[p];
	    var people = new People();
	    people.given = peopleData.given;
	    people.family = peopleData.family;
	    people.email = peopleData.email;
	    if (peopleData.w3cId > 0) {
		people.slug = peopleData.w3cId;
		people.login = peopleData.login;
		loadPeopleData(people.slug);
		if (peopleData.organization && peopleData.organization.w3cId) {
		    people.affiliationId = peopleData.organization.w3cId;
  		    org = new Organization();
		    org.slug = peopleData.organization.w3cId;
		    org.name = peopleData.organization.name;
		    org.save(addOrg(org, people));		       
		} else {
  		    people.save(addPeople(people));		
		}
	    } else {
		console.log("non W3C account: " + people.given + " " + people.family);
		people.slug = people.w3cId;
		people.login = peopleData.email;
		people.save(addPeople(people));
	    }
	}
     });
   });

};

exports.importRegistrationData = function(auth, callback)  {
   var https = require('https');
    var success = [];
    var info = [];
    var errors = [];
   var request = https.get({host: 'www.w3.org', path:'/2002/09/wbs/tpRegistrants-schedule.php?wgid=35125&qaireno=TPAC2011', headers: {Authorization: 'Basic ' + auth}}, function (response) {
     response.setEncoding('utf8');
     var registrantsJSON = "", registrantsData;
     response.on('data', function (chunk) {
       registrantsJSON = registrantsJSON + chunk;
     });
     response.on('end', function () {
        try {
            registrantsData = JSON.parse(registrantsJSON);	    
	} catch (x) {
	    errors.push(x);
	    console.log(registrantsJSON);
	    callback(success, info, errors);
	    return;
	}
        var peopleCounter = 0;
        for (p in registrantsData.registrants) {
            var peopleData = registrantsData.registrants[p];
	    var slug = peopleData.w3cId;
	    People.findOne(
		{slug: peopleData.w3cId},
		function(err, people) {
		    peopleCounter++;
		    if (err){
			errors.push(err);
		    }
		    if (people) {
		    var eventCounter = 0;
		    for (var e in peopleData.registered) {
			var eventSlug = peopleData.registered[e];
			Event.findOne(
			    {slug: eventSlug},
			    function(err, event) {
				errors.push(err);
				event.interested.push(people._id);
				event.save(
				    function(err) {
					errors.push(err);
					if (peopleCounter == registrantsData.registrants.length && eventCounter == peopleData.registered.length) {
					    if (!errors.length) {
						success.push("Registration data successfully imported");
					    }
					    callback(success, info, errors);
					}
				    });
			    });
		    }
		    }		    
		});
	}
     });
   });

};


exports.importRooms = function() {

};