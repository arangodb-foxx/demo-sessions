'use strict';
var Foxx = require('org/arangodb/foxx');
var UserProfile = Foxx.Model.extend({}, {
  attributes: {
    firstName: {type: 'string', required: true},
    lastName: {type: 'string', required: true}
  }
});

module.exports = UserProfile;