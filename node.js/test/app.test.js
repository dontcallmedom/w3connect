process.env.NODE_ENV = 'test';
var app = require('../app');
module.exports = {
'GET /people.json': function(assert) {
    assert.response(app,
      { url: '/people.json' },
      { status: 200, headers: { 'Content-Type': 'application/json' }},
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
'GET /': function(assert) {
    assert.response(app,
      { url: '/' },
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }},
      function(res) {
        assert.includes(res.body, '<title>W3C TPAC Web App</title>');
        process.exit();
      });
 }
};