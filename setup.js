'use strict';
var Foxx = require('org/arangodb/foxx');
var users = Foxx.requireApp('users').userStorage;
var auth = Foxx.requireApp('auth').auth;

var user = users.create({
  username: 'grumpycat',
  firstName: 'Grumpy',
  lastName: 'Cat'
});

auth.setPassword(user.get('_key'), 'hunter2');