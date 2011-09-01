var http = require('http');
var https = require('https');
var EventEmitter = require('events').EventEmitter;

function loadTwitterListPage(owner, slug, cursor, users, callback) {
    // Rate limited to 150 / hour, beware!
   var request = http.get({host: 'api.twitter.com', path:'/1/lists/members.json?slug=' + slug + '&owner_screen_name=' + owner + '&skip_status=1&cursor=' + cursor}, function (response) {
       response.setEncoding('utf8');
       var twitterDataJSON = "", twitterData;
       response.on('data', function (chunk) {
	   twitterDataJSON = twitterDataJSON + chunk;
       });
       response.on(
	   'end',
	   function () {
	       if (response.statusCode != 200){
  		   console.log(response.statusCode + JSON.stringify(response.headers));		   
	       }
	       twitterData = JSON.parse(twitterDataJSON);
	       users = users.concat(twitterData.users);
	       if (twitterData.next_cursor) {
		   loadTwitterListPage(owner, slug, twitterData.next_cursor, users, callback);
	       } else {
		   callback(users);
	       }
	   });
			  });
}

exports.listTwitterIds = function(list_owner, list_slug, callback) {
    loadTwitterListPage(
	list_owner,
	list_slug,
	    -1,
	[], 
	function (users) {
	    var twitterIds = [];
	    for (u in users) {
		twitterIds.push(users[u].id);
	    }
	    callback(twitterIds);
    
	});
};

exports.getTwitterId = function(screen_name, callback) {
   var request = http.get(
       {host: 'api.twitter.com', path:'/1/users/lookup.json?screen_name=' + screen_name},
       function (response) {
	   response.setEncoding('utf8');
	   var twitterDataJSON = "", twitterData;
	   response.on('data', function (chunk) {
	       twitterDataJSON = twitterDataJSON + chunk;
	   });
	   response.on(
	       'end',
	       function () {
		   if (response.statusCode != 200){
  		       console.log("Looking twitter user id failed: " + response.statusCode + JSON.stringify(response.headers));		   
		   } else {
		       try {
			   twitterData = JSON.parse(twitterDataJSON);
			   callback(twitterData[0].id);
		       } catch (err) {
			   console.log(err);
		       }
		   }
	       });
       });
};

exports.listenToTweets = function(emitter, twitter_ids, twitter_auth)  {
    var stream = https.request(
	{host: 'stream.twitter.com', path:'/1/statuses/filter.json', 'method': 'POST'}, 
	function (res) {
	    res.setEncoding('utf8');
	    var incompleteChunk = "";
	    res.on(
		'data',
		function (chunk) {
		    incompleteChunk += chunk;
		    incompleteChunk = incompleteChunk.trim();
		    if (incompleteChunk) {
			try {
			    var tweet = JSON.parse(incompleteChunk);
			    emitter.emit("tweet", tweet);
			    incompleteChunk = "";
			} catch (err) {
			    console.log(err);
			}
		    }
		});
	    res.on(
		'end',
		function () {
		    console.log("Twitter stream terminated with error " + res.statusCode);
		    console.log(JSON.stringify(res.headers));
		});
	}
    );
    stream.setHeader("Content-Type", "application/x-www-form-urlencoded");
    stream.setHeader("Authorization", 'Basic ' + twitter_auth);
    stream.write("follow=" + twitter_ids.join(","));
    stream.end();
    emitter.on("twitterListChange", function() {
	stream.abort();
    });
};
