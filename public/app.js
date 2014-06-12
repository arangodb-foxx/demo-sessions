(function() {
'use strict';

var app = angular.module('example', []);

app.controller('MainCtrl', function($http, $timeout) {
  var ctrl = this;
  ctrl.users = [];
  ctrl.credentials = {};

  $http.get('./api/whoami')
  .success(function(res) {
    ctrl.user = res.user;
  });

  $http.get('./api/users')
  .success(function(res) {
    ctrl.users = res.users;
  });

  ctrl.removeError = function() {
    delete ctrl.error;
  };

  ctrl.login = function() {
    delete ctrl.error;
    $http.post('./api/login', ctrl.credentials)
    .success(function(res) {
      ctrl.credentials = {};
      ctrl.user = res.user;
    })
    .error(function(res) {
      ctrl.error = res.error || 'Something went wrong!';
      $timeout(function() {
        delete ctrl.error;
      }, 5000);
    });
  };
  ctrl.logout = function() {
    delete ctrl.error;
    $http.post('./api/logout')
    .success(function(res) {
      ctrl.user = null;
    })
    .error(function(res) {
      ctrl.error = res.error || 'Something went wrong!';
      $timeout(function() {
        delete ctrl.error;
      }, 5000);
    });
  };
});

}());