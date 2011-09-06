// should get it from elsewhere
var mongoose = require('mongoose'),
db = mongoose.connect('mongodb://localhost/tpac');

var People = require('./model.js').People(db);
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
       peopleData = JSON.parse(peopleJSON);
       People.findOne({slug: id}, function(err, people) {
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
	    people.login = peopleData.login;
	    people.slug = peopleData.slug;
	    loadPeopleData(people.slug);
	    if (peopleData.organization && peopleData.organization.slug) {
		     people.affiliationId = peopleData.organization.slug;
  		     org = new Organization();
		     org.slug = peopleData.organization.slug;
		     org.name = peopleData.organization.name;
		     org.save(addOrg(org, people));		       
	    } else {
  	      people.save(addPeople(people));		
	    }
	}
     });
   });

};

exports.importRooms = function() {

};