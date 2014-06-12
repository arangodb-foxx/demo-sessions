'use strict';
var Foxx = require('org/arangodb/foxx');
var Credentials = Foxx.Model.extend({}, {
  attributes: {
    username: {type: 'string', required: true},
    password: {type: 'string', required: true}
  }
});

module.exports = Credentials;