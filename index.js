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

controller.addInjector({
  auth: function() {return Foxx.requireApp('auth').auth;},
  users: function() {return Foxx.requireApp('users').userStorage;},
  oauth2: function() {return Foxx.requireApp('oauth2').providers;}
});

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
controller.post('/login', function(req, res, injected) {
  var credentials = req.params('credentials');
  var user = injected.users.resolve(credentials.get('username'));
  var valid = injected.auth.verifyPassword(
    user ? user.get('authData').simple : {},
    credentials.get('password')
  );
  if (valid) {
    req.session.setUser(user);
    req.session.save();
    res.json({success: true, user: user.get('userData')});
  } else {
    res.status(403);
    res.json({success: false, error: 'Invalid password or unknown username.'});
  }
})
.bodyParam('credentials', 'Authentication credentials.', Credentials)
.summary('Authenticate')
.notes('Attempts to log the user in with username and password.');

controller.post('/oauth2/:provider/auth', function(req, res, injected) {
  var provider = injected.oauth2.get(req.params('provider'));
  res.status(303);
  res.set('location', provider.getAuthUrl(
    'http://localhost:8529/_db/_system/sessions-example-app/api/oauth2/' +
    provider.get('_key') + '/login',
    {state: req.session.get('_key')}
  ));
});

controller.get('/oauth2/:provider/login', function(req, res, injected) {
  var provider = injected.oauth2.get(req.params('provider'));
  if (req.params('error')) {
    res.status(500);
    res.json({success: false, error: req.params('error')});
    return;
  }
  if (req.params('state') !== req.session.get('_key')) {
    res.status(400);
    res.json({success: false, error: 'CSRF mismatch'});
    return;
  }
  try {
    var authData = provider.exchangeGrantToken(
      req.params('code'),
      'http://localhost:8529/_db/_system/sessions-example-app/api/oauth2/' +
      provider.get('_key') + '/login'
    );
    var profile = provider.fetchActiveUser(authData.access_token);
    var username = provider.get('_key') + ':' + provider.getUsername(profile);
    var userData = {username: username};
    var uid = req.session.get('uid');
    var user = injected.users.resolve(username);
    if (!user) user = injected.users.create({username: username});
    user.get('userData')['oauth2_' + provider.get('_key')] = profile;
    user.get('authData')['oauth2_' + provider.get('_key')] = authData;
    user.save();
    req.session.setUser(user);
    req.session.save();
    res.status(303);
    res.set('location', 'http://localhost:8529/_db/_system/sessions-example-app/');
  } catch(err) {
    res.status(500);
    res.json({success: false, error: err.message});
  }
})
.summary('')
.notes('');

/** Registration route
 *
 * Demonstrates creating a new account.
 */
controller.post('/register', function(req, res, injected) {
  var credentials = req.params('credentials');
  if (credentials.get('username').indexOf(':') !== -1) {
    res.status(400);
    res.json({
      success: false,
      error: 'Username must not contain a colon'
    });
    return;
  }
  var userProfile = req.params('profile');
  var userData = userProfile.forDB();
  userData.username = credentials.get('username');
  if (injected.users.resolve(userData.username)) {
    res.status(400);
    res.json({
      success: false,
      error: 'Username already taken'
    });
    return;
  }
  var user = injected.users.create(userData);
  user.get('authData').simple = injected.auth.hashPassword(credentials.get('password'));
  user.save();
  // now log the user in
  req.session.setUser(user);
  req.session.save();
  res.json({
    success: true,
    user: user.get('userData'),
    users: injected.users.list()
  });
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
controller.get('/users', function(req, res, injected) {
  res.json({users: injected.users.list()});
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
  var sdata = req.session.get('sessionData') || {};
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
