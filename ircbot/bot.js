// Reading command line options
var argv = require("optimist")
  .options('c', {
	   alias: 'config',
	   default:'config.ini'}).argv;

// Reading configuration file
var config = require('iniparser').parseSync(argv.c);

var irc = require('irc');
var querystring = require('querystring');

var channelsMap = [];
var channels = [];

var url = require("url").parse(config.w3connect.baseurl + "schedule/list.json");
var http;
if (url.protocol == "http:") {
    http = require('http');
} else if (url.protocol == "https:") {
    http = require('https');
}
var request = http.get({host: url.hostname, port: url.port , path: url.pathname + (url.search ? url.search : '') + (url.hash ? url.hash : '')}, function (response) {
    response.setEncoding('utf8');
    var scheduleJSON = "", scheduleData;
    response.on('data', function (chunk) {
	scheduleJSON = scheduleJSON + chunk;
    });
    response.on('end', function () {
	try {
	    scheduleData = JSON.parse(scheduleJSON);
	} catch (err) {
	    console.log("Couldn't parse " + url + " as JSON");
	}
	for (var i in scheduleData) {
	    var event = scheduleData[i];

	    if (event.ircChannel) {
		if (!channelsMap[event.ircChannel]) {
		    channels.push(event.ircChannel);
		    channelsMap[event.ircChannel] = [];
		    console.log("**** " + event.ircChannel);
		}
		channelsMap[event.ircChannel].push(event);
	    }
	}
	setupClient();
    });
});

function setupClient() {
var client = new irc.Client(config.server.host, config.server.nick, {port: config.server.port, channels: channels});

client.addListener('error', function(message) {
    console.log('error: ', message);
});

client.addListener("message", function (from, to, message) {
    if (to == config.server.nick) {
	if (message.match(/^help/)) {
	    client.say(from, "I am a bot that watches for 'Topic:' messages on channels and publishes them on " + config.w3connect.baseurl);
	}
    } else if (channelsMap[to]) {
	// find the right event for the given channel based on time
	var now = new Date();
	var event;
	for (var c in channelsMap[to]) {
	    var ev = channelsMap[to][c];
	    if (ev.timeStart < now && ev.timeEnd > now) {
		event = ev;
		break;
	    }
	}
	console.log(event && event.name);
	var topic = message.match(/^topic:(.*)$/i)
	if (event && topic) {
	    var url = require("url").parse(config.w3connect.baseurl + "schedule/events/" + event.slug + "/updates");
	    var post_data = querystring.stringify({"updateStatus":topic[1]});
	    var updateStatus = http.post(
		{host: url.hostname, 
		 port: url.port ,
		 path: url.pathname,
		 headers: {
		     'Content-Type': 'application/x-www-form-urlencoded',
		     'Content-Length': post_data.length
		 }
		}, null);
	    updateStatus.write(post_data);
	    updateStatus.end();
	}
    }
});
}