var http = require('http');
var EventEmitter = require('events').EventEmitter;

function loadTwitterListPage(owner, slug, cursor, users, callback) {
   var request = http.get({host: 'api.twitter.com', path:'/1/lists/members.json?slug=' + slug + '&owner_screen_name=' + owner + '&skip_status=1&cursor=' + cursor}, function (response) {
       response.setEncoding('utf8');
       var twitterDataJSON = "", twitterData;
       response.on('data', function (chunk) {
	   twitterDataJSON = twitterDataJSON + chunk;
       });
       response.on('end', function () {
	   console.log(response.statusCode + JSON.stringify(response.headers));
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

loadTwitterListPage('t', 'sf', -1, [], function (users) {
    var twitterIds = [];
    console.log(users);
    for (u in users) {
	twitterIds.push(users[u].id);
    }
    var stream = http.request({host: 'stream.twitter.com', path:'/1/statuses/filter.json', 'method': 'POST'}, function (res) {
	res.setEncoding('utf8');
	var incompleteChunk = "";
	res.on('data', function (chunk) {
	    incompleteChunk += chunk;
	    incompleteChunk = incompleteChunk.trim();
	    if (incompleteChunk) {
		console.log(chunk);
		try {
		    var tweet = JSON.parse(incompleteChunk);
		    console.log(tweet.text);
		    incompleteChunk = "";
		} catch (err) {
		    console.log(err);
		}
	    }
	});
	res.on('end', function () {
	    console.log("terminated with error " + res.statusCode);
	});
    });
    stream.setHeader("Content-Type", "application/x-www-form-urlencoded");
    stream.setHeader("Authorization", 'Basic ' + new Buffer('dontcallmedom' + ':' + '@@@').toString('base64'));
    stream.write("follow=" + twitterIds.join(","));
    stream.end();
});
