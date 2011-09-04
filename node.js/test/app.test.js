// Note: expresso doesn't support https as of now, see 
// https://github.com/visionmedia/expresso/issues/129
// need to fudge in the code in the meantime

process.env.NODE_ENV = 'test';
var app = require('../app'),  assert = require('assert');
module.exports = {
'GET /people.json': function() {
    assert.response(app,
      { url: '/people.json' },
      { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }},
      function(res) {
        var documents = JSON.parse(res.body);
        assert.type(documents, 'object');

/*        documents.forEach(function(d) {
          app.People.findById(d._id, function(people) {
            document.remove();
          });
        });*/
      });
  },
'GET /': function() {
    assert.response(app,
      { url: '/' },
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }},
      function(res) {
        assert.includes(res.body, '<title>W3Connect</title>');
        process.exit();
      });
 }
};