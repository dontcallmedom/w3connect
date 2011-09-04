// Note: expresso doesn't support https as of now, see 
// https://github.com/visionmedia/expresso/issues/129
// need to fudge in the code in the meantime

process.env.NODE_ENV = 'test';
var app = require('../app'),  assert = require('assert');
module.exports = {
'GET /': function() {
    assert.response(app,
      { url: '/' },
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }},
      function(res) {
        assert.includes(res.body, '<title>W3Connect</title>');
      });
},
    'GET /locations' : function() {
    assert.response(app,
      { url: '/locations' },
		    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }},
	function(res) {
	    assert.includes("<h1>Places</h1>");
	});
    }, 

    'GET /people' : function() {
    assert.response(app,
      { url: '/people' },
		    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }},
	function(res) {
	    assert.includes("<h1>People</h1>");
	});
    }, 
'GET /people.json': function() {
    assert.response(app,
      { url: '/people.json' },
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }},
      function(res) {
        var people = JSON.parse(res.body);
        assert.type(people, 'object');
      });
}
};