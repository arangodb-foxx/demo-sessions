(function() {
'use strict';

var app = angular.module('example', []);

app.controller('MainCtrl', function($http, $timeout) {
  var ctrl = this;
  ctrl.users = [];
  ctrl.loginData = {};
  ctrl.registerData = {};

  $http.get('./api/whoami')
  .success(function(res) {
    ctrl.user = res.user;
    ctrl.uid = res.uid;
  });

  $http.get('./api/users')
  .success(function(res) {
    ctrl.users = res.users;
    ctrl.uid = res.uid;
  });

  ctrl.removeError = function() {
    delete ctrl.error;
  };

  ctrl.login = function() {
    delete ctrl.error;
    $http.post('./api/login', ctrl.loginData)
    .success(function(res) {
      ctrl.loginData = {};
      ctrl.user = res.user;
      ctrl.uid = res.uid;
    })
    .error(function(res) {
      ctrl.error = res.error || 'Something went wrong!';
      $timeout(function() {
        delete ctrl.error;
      }, 5000);
    });
  };

  ctrl.register = function() {
    delete ctrl.error;
    $http.post('./api/register', ctrl.registerData)
    .success(function(res) {
      ctrl.registerData = {};
      ctrl.user = res.user;
      ctrl.users = res.users;
      ctrl.uid = res.uid;
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
      ctrl.uid = null;
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