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

user.get('authData').simple = auth.hashPassword('admin');
user.save();