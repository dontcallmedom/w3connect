
var    EventEmitter = require('events').EventEmitter;
var express = require('express');
var fs = require('fs');

var app = module.exports = express.createServer({key: fs.readFileSync('/etc/ssl/private/wildcard.w3.org.key'), cert: fs.readFileSync('/etc/ssl/certs/cert-w3.org.crt')});
var emitter = new EventEmitter();

app.configure(function(){
    emitter.setMaxListeners(0);
    app.use(express.logger());
    app.use(express.bodyParser());
    app.use(app.router);
    app.use(express.errorHandler()); 
});

app.get("/", function(req, res) {
    console.log("OK");
    res.writeHead(200);
    res.write("OK");
    res.end();

});

app.post("/", function(req, res) {
    console.log("OK " + req.body.text);
    emitter.emit("tweet", {text: req.body.text, id: 23423, user: {id: 19218240, screen_name: "dontcallmedom", name: "Dom Hazael-Massieux", profile_image_url_https: "http://www.w3.org/2006/05/u/f592bc2388f1-tn.jpg"}});
    res.write("OK");
    res.end();
});

app.post("/1/statuses/filter.json", function(req, res) {
    res.writeHead(200);
    emitter.on("tweet", function(tweet) {
	console.log("sending tweet on the pipe");
	res.write(JSON.stringify(tweet));
    });
});

app.listen(3030);
console.log("starting server");