'use strict';
var Foxx = require('org/arangodb/foxx');
var users = Foxx.requireApp('users').userStorage;
var auth = Foxx.requireApp('auth').auth;

var user = users.create({
  username: 'admin',
  firstName: 'Admin',
  lastName: 'Admin',
  admin: true
});

auth.setPassword(user.get('_key'), 'admin');