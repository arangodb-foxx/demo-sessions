'use strict';
var Foxx = require('org/arangodb/foxx');
var controller = new Foxx.Controller(applicationContext);
var foxxApp = require('org/arangodb/foxx/manager').mountedApp;
var Credentials = require('./models/credentials');

function getAuthenticator() {
  return foxxApp('/auth').auth;
}

function getUserStorage() {
  return foxxApp('/users').userStorage;
}

function getSessionStorage() {
  return foxxApp('/sessions').sessionStorage;
}

controller.before('/*', function(req, res) {
  var sessions = getSessionStorage();
  var session = sessions.fromCookie(req);
  if (!session) {
    session = sessions.create();
  }
  session.addCookie(res);
  req.session = session;
});

controller.get('/users', function(req, res) {
  res.json({users: getUserStorage().list()});
})
.summary('Registered users')
.notes('Returns a list of all known usernames.');


controller.get('/whoami', function(req, res) {
  if (!req.session.get('uid')) {
    res.json({user: null});
  } else {
    res.json({user: req.session.get('userData') || {}});
  }
})
.summary('Session user status')
.notes('Returns the active user or null.');

controller.post('/login', function(req, res) {
  var sid = req.session.get('_key');
  var credentials = req.body();
  var users = getUserStorage();
  var auth = getAuthenticator();
  var uid = users.resolve(credentials.username);
  var user = auth.login(sid, uid, credentials.password);
  if (user) {
    res.json({success: true, user: user.get('userData')});
  } else {
    res.status(403);
    res.json({success: false, error: 'Invalid password or unknown username.'});
  }
})
.bodyParam('credentials', 'Authentication credentials.', Credentials)
.summary('Authenticate')
.notes('Attempts to log the user in with username and password.');

controller.post('/logout', function(req, res) {
  var sessions = getSessionStorage();
  sessions.setUser(req.session.get('_key'), null);
  res.json({success: true});
})
.summary('De-authenticate')
.notes('Wipes the session data for the active session.');