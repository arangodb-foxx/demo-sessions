'use strict';
var foxxApp = require('org/arangodb/foxx/manager').mountedApp;
var users = foxxApp('/users').userStorage;
var auth = foxxApp('/auth').auth;

var user = users.create({
  username: 'grumpycat',
  firstName: 'Grumpy',
  lastName: 'Cat'
});

auth.setPassword(user.get('_key'), 'hunter2');