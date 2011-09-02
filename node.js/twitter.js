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

exports.listTwitterIdsFromTwitterList = function(list_owner, list_slug, callback) {
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
		       callback("Looking twitter user id failed: " + response.statusCode + JSON.stringify(response.headers), null);
		   } else {
		       try {
			   twitterData = JSON.parse(twitterDataJSON);
			   callback(null, twitterData[0].id);
		       } catch (err) {
			   callback("Failed to parse response from Twitter API (" + err + ")", null);
		       }
		   }
	       });
       });
};

exports.listenToTweets = function(emitter, twitter_ids, twitter_auth, attempt)  {
    if (!attempt) {
	attempt = 1;
    }
    var stream = https.request(
	{
	    //host: 'stream.twitter.com'
	    host: 'localhost', port: 3030
	 , path:'/1/statuses/filter.json', 'method': 'POST'}, 
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
		    // https://dev.twitter.com/docs/streaming-api/concepts
		    // When a HTTP error (> 200) is returned, back off exponentially. 
		    // Perhaps start with a 10 second wait, double on each subsequent failure, and finally cap the wait at 240 seconds
		    setTimeout(function() { exports.listenToTweets(emitter, twitter_ids, twitter_auth, attempt + 1); }, Math.min(Math.pow(2, attempt - 1) * 10000, 240000));

		});
	}
    );
    try {
    stream.setHeader("Content-Type", "application/x-www-form-urlencoded");
    stream.setHeader("Authorization", 'Basic ' + twitter_auth);
    stream.write("follow=" + twitter_ids.join(","));
    stream.on('error', function(err) {
	// https://dev.twitter.com/docs/streaming-api/concepts
	// When a network error (TCP/IP level) is encountered, back off linearly.
	// Perhaps start at 250 milliseconds and cap at 16 seconds.
	setTimeout(function() { exports.listenToTweets(emitter, twitter_ids, twitter_auth, attempt + 1); }, Math.min(attempt * 250, 16000));
    });
    stream.end();
    } catch(err) {
	console.log(err);
    }
    emitter.on("twitterListChange", function() {
	stream.abort();
    });
};
