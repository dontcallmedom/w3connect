var express = require('express');
var everyauth = require('everyauth');

everyauth.ldap
  .host('directory.w3.org')
  .port(636)
  .getLoginPath('/login')
  .postLoginPath('/login') // Uri path that your login form POSTs to
  .loginView('login.ejs')
.loginSuccessRedirect('/');
;

var routes = function (app) {
  // Define your routes here
};

everyauth.helpExpress(app);
app.listen(3000);