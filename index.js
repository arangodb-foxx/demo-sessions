'use strict';
var Foxx = require('org/arangodb/foxx');
var controller = new Foxx.Controller(applicationContext);
var Credentials = require('./models/credentials');
var UserProfile = require('./models/userProfile');
var url = require('url');

function getBaseUrl(req) {
  return url.format({
    protocol: req.protocol,
    hostname: req.server.address,
    port: req.server.port,
    pathname: '/_db/' + encodeURIComponent(req.database) + applicationContext.mount
  });
}

controller.activateSessions({
  sessionStorageApp: '/_system/sessions',
  // This is the default value. ArangoDB always mounts a copy of the built-in sessions app
  // at this mount point, but we could provide the mount point of our own sessions implementation
  // if it is API compatible. Note that all apps using the same `sessionStorageApp` will share
  // their sessions, so you probably want to mount your own copy.
  type: 'cookie',
  cookie: {
    name: 'sid',
    // The session ID will be stored in a cookie called 'sid'. The cookie name is irrelevant if
    // our app doesn't need to access it directly. This is the default value and thus optional.
    secret: 'secret'
    // If we provide a cookie.secret, ArangoDB will automatically sign the session cookie
    // cryptographically using the given secret. This should be a non-guessable value unique
    // to this app. The signature will be stored in a cookie with called `name + '.sig'`,
    // e.g. in this app it would be called 'sid.sig'. Signed cookies will only be read by
    // ArangoDB if the signature is valid.
  }
  // Note that unlike `activateAuthentication` the `activateSessions` API doesn't allow
  // modifying the session TTL (the time to live, or duration). Configuration options like
  // these must now be set when mounting the sessions app you want to use.
});

controller.addInjector({
  auth: function() {return Foxx.requireApp('/_system/simple-auth').auth;},
  users: function() {return Foxx.requireApp('/_system/users').userStorage;},
  oauth2: function() {return Foxx.requireApp('/oauth2').providers;}
  // ArangoDB 2.2 introduced exports and injectors. Here we're injecting the exported APIs
  // of the built-in user and auth apps, as well as the official OAuth2 app into our
  // controller. Like the built-in sessions app, a copy of the user and auth apps are
  // automatically mounted at these mount points by ArangoDB. The OAuth2 app can be
  // found at https://github.com/arangodb/foxx-oauth2 and should be mounted at `/oauth2`
  // for this example app to work.
});

function NotAnAdmin() {}
NotAnAdmin.prototype = new Error();

function isAdmin(req) {
  var userData = req.session.get('userData');
  if (!userData || !userData.admin) throw new NotAnAdmin();
}
// We'll later use this predicate to ensure that a user accessing a particular route
// is logged in as an admin using `ctrl.onlyIf`.

/** Login route
 *
 * Attempts to log the user in using username and password auth.
 */
controller.post('/login', function(req, res, injected) {
  // The third parameter (`injected`) contains the values provided by our injectors
  // above. For more information injectors see the section on Dependency Injection
  // in the Foxx chapter of the documentation.
  var credentials = req.params('credentials');
  var user = injected.users.resolve(credentials.get('username'));
  // The built-in users app provides a `resolve` method that fetches the user object
  // for a given username, or `null` if the user could not be found.
  var valid = injected.auth.verifyPassword(
    user ? user.get('authData').simple : {},
    credentials.get('password')
  );
  // The built-in simple-auth app provides a `verifyPassword` method we can use to
  // determine if the entered password matches the stored user's password. It expects
  // an auth object containing the user's salt and password hash, and the password
  // to verify. Because we don't want to distinguish between invalid passwords and
  // invalid usernames, we just pass in an empty object if we couldn't find a user.
  if (valid) {
    req.session.get('sessionData').username = user.get('user');
    // This is an example of storing arbitrary application-specific data in the
    // `sessionData` property of the session object. In this case, the username.
    req.session.setUser(user);
    // The `setUser` method copies the user's `_id` and `userData` properties into
    // the session object. This allows us to determine whether a user is logged in
    // by checking whether the session's `uid` property is empty.
    req.session.save();
    // Whenever we modify the session object, we need to explicitly save it to make
    // sure the data is updated in the database. We don't need to worry about setting
    // the session cookie as it will be renewed automatically when we are using the
    // `activateSessions` feature.
    res.json({success: true, user: user.get('userData'), username: user.get('user')});
  } else {
    res.status(403);
    res.json({success: false, error: 'Invalid password or unknown username.'});
  }
})
.bodyParam('credentials', {
  description: 'Authentication credentials.',
  type: Credentials
})
.summary('Authenticate')
.notes('Attempts to log the user in with username and password.');

/** Registration route
 *
 * Demonstrates creating a new account.
 */
controller.post('/register', function(req, res, injected) {
  var credentials = req.params('credentials');
  if (credentials.get('username').indexOf(':') !== -1) {
    // This is an example of arbitrary application-specific restrictions.
    // We want to use the colon as a special character for usernames elsewhere
    // in this app, so we can't allow users to create accounts with that
    // character in it.
    res.status(400);
    res.json({
      success: false,
      error: 'Username must not contain a colon'
    });
    return;
  }
  var user;
  try {
    user = injected.users.create(
      credentials.get('username'),
      req.params('profile').forDB(),
      {
        simple: injected.auth.hashPassword(credentials.get('password'))
      }
    );
    // The built-in users app provides a `create` method to create users.
    // The second parameter will be stored as the user object's `userData`
    // property, the last parameter will be stored as its `authData`.
    // Generally a user's `authData` should never leave the database.
  } catch (err) {
    if (err instanceof injected.users.errors.UsernameAlreadyTaken) {
      res.status(400);
      res.json({
        success: false,
        error: 'Username already taken'
      });
      return;
    }
    throw err;
  }
  req.session.get('sessionData').username = user.get('user');
  req.session.setUser(user);
  req.session.save();
  // Same logic as in the login route.
  res.json({
    success: true,
    user: user.get('userData'),
    users: injected.users.list(),
    username: user.get('user')
  });
})
.bodyParam('credentials', {
  description: 'Username and password',
  type: Credentials
})
.bodyParam('profile', {
  description: 'User profile data', 
  type: UserProfile
})
.summary('Register')
.notes('Create a new account and log the user in.');

/** Logout route
 *
 * Logs the user out by deleting their session.
 */
controller.destroySession('/logout', function(req, res) {
  // The special `destroySession` route type is provided by the `activateSessions`
  // feature and deletes the current session object from the database and then
  // (by default) creates a new session or alternatively (only when using cookie
  // sessions) clears the session cookie.
  res.json({success: true});
})
.summary('De-authenticate')
.notes('Wipes the session data for the active session.');

/** OAuth2 redirect
 *
 * Redirects the user to the authorization endpoint of the given provider.
 */
controller.post('/oauth2/:provider/auth', function(req, res, injected) {
  if (!injected.oauth2) {
    res.status(500);
    res.json({success: false, error: "Expecting 'oauth2' provider to be available at mount point '/oauth2'. Please execute: require('org/arangodb/foxx/manager').install('oauth2', '/oauth2')."});
    return;
  }
  // This app expects the official OAuth2 app available at
  // https://github.com/arangodb/foxx-oauth2 to be mounted at `/oauth2`.

  var provider = injected.oauth2.get(req.urlParameters.provider);
  res.status(303);
  res.set('location', provider.getAuthUrl(
    getBaseUrl(req) + '/api/oauth2/' +
    provider.get('_key') + '/login',
    {state: req.session.get('_key')}
  ));
})
.pathParam('provider', {
  description: 'Provider _key.',
  type: 'string'
})
.summary('OAuth2 authorization redirect')
.notes('Redirects to the authorization endpoint of an OAuth2 provider.');


/** OAuth2 callback
 *
 * An example for an OAuth2 callback.
 */
controller.get('/oauth2/:provider/login', function(req, res, injected) {
  var provider = injected.oauth2.get(req.urlParameters.provider);
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
      getBaseUrl(req) + '/api/oauth2/' + provider.get('_key') + '/login'
    );
    var profile = provider.fetchActiveUser(authData.access_token);
    var username = provider.get('_key') + ':' + provider.getUsername(profile);
    // We want user objects created via OAuth2 to have their usernames prefixed with
    // the `_key` of the OAuth2 provider and a colon. This allows us to distinguish
    // them more easily.
    var user = injected.users.resolve(username);
    if (!user) user = injected.users.create(username);
    user.get('userData')['oauth2_' + provider.get('_key')] = profile;
    user.get('authData')['oauth2_' + provider.get('_key')] = authData;
    user.save();
    req.session.get('sessionData').username = user.get('user');
    req.session.setUser(user);
    req.session.save();
    res.status(303);
    res.set('location', getBaseUrl(req) + '/');
  } catch(err) {
    res.status(500);
    res.json({success: false, error: err.message});
  }
})
.pathParam('provider', {
  description: 'Provider _key.',
  type: 'string'
})
.summary('OAuth2 authorization callback')
.notes('Redirect target for the OAuth2 authorization endpoint.');

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
    res.json({user: null, username: ''});
  } else {
    res.json({user: req.session.get('userData') || {}, username: req.session.get('sessionData').username});
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
