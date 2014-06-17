'use strict';
var Foxx = require('org/arangodb/foxx');
var controller = new Foxx.Controller(applicationContext);
var Credentials = require('./models/credentials');
var UserProfile = require('./models/userProfile');

controller.activateAuthentication({
  sessionStorageApp: 'sessions',
  cookieName: 'sid',
  cookieSecret: 'secret',
  type: 'cookie'
});

function getAuthenticator() {
  return Foxx.requireApp('auth').auth;
}

function getUserStorage() {
  return Foxx.requireApp('users').userStorage;
}

function NotAnAdmin() {}
NotAnAdmin.prototype = new Error();

function isAdmin(req) {
  var userData = req.session.get('userData');
  if (!userData || !userData.admin) throw new NotAnAdmin();
}

/** Login route
 *
 * Attempts to log the user in using username and password auth.
 */
controller.post('/login', function(req, res) {
  var credentials = req.params('credentials');
  var user = getAuthenticator().login(
    req.session,
    getUserStorage().resolve(credentials.get('username')),
    credentials.get('password')
  );
  if (user) {
    req.session.save();
    res.json({success: true, user: user.get('userData')});
  } else {
    res.status(403);
    res.json({success: false, error: 'Invalid password or unknown username.'});
  }
})
.bodyParam('credentials', 'Authentication credentials.', Credentials)
.summary('AuthenticuserProfile')
.notes('Attempts to log the user in with username and password.');

/** Registration route
 *
 * Demonstrates creating a new account and logging the user in manually.
 */
controller.post('/register', function(req, res) {
  var credentials = req.params('credentials');
  var userProfile = req.params('profile');
  var userData = userProfile.forDB();
  userData.username = credentials.get('username');
  var users = getUserStorage();
  var user = users.create(userData);
  getAuthenticator().setPassword(user, credentials.get('password'));
  user.save();
  // now log the user in
  req.session.setUser(user);
  req.session.save();
  res.json({success: true, user: user.get('userData'), users: users.list()});
})
.bodyParam('credentials', 'Username and password', Credentials)
.bodyParam('profile', 'User profile data', UserProfile)
.summary('Register')
.notes('Create a new account and log the user in.');

/** Logout route
 *
 * Logs the user out by deleting their session. Always creates a new
 * session to make sure cookies are overwritten.
 */
controller.logout('/logout', function(req, res) {
  res.json({success: true});
})
.summary('De-authenticate')
.notes('Wipes the session data for the active session.');

/** Registered user list
 *
 * Demonstrates fetching the list of usernames from the user storage.
 */
controller.get('/users', function(req, res) {
  res.json({users: getUserStorage().list()});
})
.summary('Registered users')
.notes('Returns a list of all known usernames.');

/** Get current user
 *
 * If the user is logged in, returns the user's userData. Otherwise
 * returns null for the userData.
 */
controller.get('/whoami', function(req, res) {
  if (!req.session.get('uid')) {
    res.json({user: null});
  } else {
    res.json({user: req.session.get('userData') || {}});
  }
})
.summary('Session user status')
.notes('Returns the active user or null.');

/** Counter
 *
 * Demonstrates storing and updating a value in the session.
 * Also shows how to restrict a route to logged-in users.
 */
controller.get('/counter', function(req, res) {
  var sdata = req.session.get('sessionData');
  if (sdata.counter) sdata.counter++;
  else sdata.counter = 1;
  req.session.set('sessionData', sdata);
  req.session.save();
  res.json({counter: sdata.counter});
})
.onlyIfAuthenticated()
.summary('Get and increment a counter')
.notes('Fetches the number of times this routes has been called in this session.');

/** Session dump
 *
 * Dumps the content of the session object. Also demonstrates how to
 * restrict a route to admin users.
 */
controller.get('/dump', function(req, res) {
  res.json(req.session.forClient());
})
.onlyIf(isAdmin)
.errorResponse(NotAnAdmin, 403, 'You are not an admin.')
.summary('Dump session object')
.notes('Returns the session object. Demonstrates restricting route access.');
