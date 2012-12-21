var assert = require("assert");
var request = require("supertest");
var app = require("../app.js").app;
var mongoose = require("../app.js").db;

var dom = { login: "dom", email: "dom@w3.org", given: "Dominique", family: "Hazael-Massieux", slug: "dom"};

function createUser(done) {
    mongoose.connection.collections["peoples"].save(dom, done);
}

describe('GET /test/namespace/', function(){
    before(function(done) {
	mongoose.connection.db.dropDatabase();
	createUser(done);
    });
    it('should return HTML with 200 status', function(done){
	request(app)
	    .get('/test/namespace/')
	    .expect('Content-Type', /html/)
	    .expect(200)
	    .end(function(err, res){
		if (err) return done(err);
		    done();
	    });
    });
});

describe('GET /test/namespace/locations/', function(){
    it('should return HTML with 200 status', function(done){
	request(app)
	    .get('/test/namespace/locations/')
	    .expect('Content-Type', /html/)
	    .expect(200, /<h1>Places<\/h1>/)
	    .end(function(err, res){
		if (err) return done(err);
		    done();
	    });
    });
});

describe('GET /test/namespace/people/', function(){
    it('should return HTML with 200 status', function(done){
	request(app)
	    .get('/test/namespace/people/')
	    .expect('Content-Type', /html/)
	    .expect(200, /<h1>People<\/h1>/)
	    .end(function(err, res){
		if (err) return done(err);
		    done();
	    });
    });
});

describe('GET /test/namespace/people.json', function(){
    before(createUser);
    it('should return JSON with 200 status', function(done){
	request(app)
	    .get('/test/namespace/people/all.json')
	    .expect('Content-Type', /json/)
	    .expect(200)
	    .end(function(err, res){
		if (err) return done(err);
		var people = res.body;
		assert.equal(people[0].login, 'dom');
		done();
	    });
    });
});

describe('GET /test/namespace/orgs', function(){
    it('should return HTML with 200 status', function(done){
	request(app)
	    .get('/test/namespace/orgs/')
	    .expect('Content-Type', /html/)
	    .expect(200, /<h1>Organizations<\/h1>/)
	    .end(function(err, res){
		if (err) return done(err);
		    done();
	    });
    });
});
