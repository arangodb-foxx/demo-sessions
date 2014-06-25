'use strict';
var Foxx = require('org/arangodb/foxx');
var users = Foxx.requireApp('/_system/users').userStorage;
var auth = Foxx.requireApp('/_system/simple-auth').auth;

var user = users.create({
  username: 'admin',
  firstName: 'Admin',
  lastName: 'Admin',
  admin: true
});

user.get('authData').simple = auth.hashPassword('admin');
user.save();