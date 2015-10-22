'use strict';
var Foxx = require('org/arangodb/foxx');
var controller = new Foxx.Controller(applicationContext);
var createError = require('http-errors');
var Credentials = require('./models/credentials');
var UserProfile = require('./models/userProfile');
var url = require('url');
var joi = require('joi');

var auth = applicationContext.dependencies.auth;
var users = applicationContext.dependencies.users;
var oauth2 = {
  github: applicationContext.dependencies.github,
  google: applicationContext.dependencies.google,
  facebook: applicationContext.dependencies.facebook
};

function getBaseUrl(req) {
  return url.format({
    protocol: req.protocol,
    hostname: req.server.address,
    port: req.server.port,
    pathname: `/_db/${encodeURIComponent(req.database)}${applicationContext.mount}`
  });
}

controller.activateSessions({
  autoCreateSession: true,
  sessionStorage: '/_system/sessions',
  // This is the default value. ArangoDB always mounts a copy of the built-in session storage
  // at this mount point, but we could provide the mount point of our own sessions implementation
  // if it is API compatible. Note that all services using the same `sessionStorage` will share
  // their sessions, so you probably want to mount your own copy.
  cookie: {
    name: `${applicationContext.mount}:sid`,
    // The session ID will be stored in a cookie called. The cookie name is irrelevant if
    // our service doesn't need to access it directly. This is the default value and thus optional.
    secret: 'secret'
    // If we provide a cookie.secret, ArangoDB will automatically sign the session cookie
    // cryptographically using the given secret. This should be a non-guessable value unique
    // to this service. The signature will be stored in a cookie with called `name + '.sig'`,
    // e.g. in this service it would be called 'sid.sig'. Signed cookies will only be read by
    // ArangoDB if the signature is valid.
  }
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
controller.post('/login', function(req, res) {
  var credentials = req.params('credentials');
  var user = users.resolve(credentials.get('username'));

  // The users-local service provides a `resolve` method that fetches the user object
  // for a given username, or `null` if the user could not be found.
  var valid = auth.verifyPassword(
    user ? user.get('authData').simple : {},
    credentials.get('password')
  );

  // The simple-auth service provides a `verifyPassword` method we can use to
  // determine if the entered password matches the stored user's password. It expects
  // an auth object containing the user's salt and password hash, and the password
  // to verify. Because we don't want to distinguish between invalid passwords and
  // invalid usernames, we just pass in an empty object if we couldn't find a user.
  if (!valid) {
    throw createError(403, 'Invalid password or unknown username.');
  }

  req.session.get('sessionData').username = user.get('user');
  // This is an example of storing arbitrary service-specific data in the
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
})
.bodyParam('credentials', {
  description: 'Authentication credentials.',
  type: Credentials
});

/** Registration route
 *
 * Creates a new user and logs the user in.
 */
controller.post('/register', function(req, res) {
  var credentials = req.params('credentials');
  if (credentials.get('username').indexOf(':') !== -1) {
    // This is an example of arbitrary service-specific restrictions.
    // We want to use the colon as a special character for usernames elsewhere
    // in this service, so we can't allow users to create accounts with that
    // character in it.
    throw createError(400, 'Username must not contain a colon.');
  }
  var username = credentials.get('username');
  var user;
  try {
    user = users.create(username, req.params('profile').forDB(), {
      simple: auth.hashPassword(credentials.get('password'))
    });
    // The users-local service provides a `create` method to create users.
    // The second parameter will be stored as the user object's `userData`
    // property, the last parameter will be stored as its `authData`.
    // Generally a user's `authData` should never leave the database.
  } catch (err) {
    if (err instanceof users.errors.UsernameAlreadyTaken) {
      throw createError(400, `Username "${username}" already in use.`);
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
    users: users.list(),
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
});

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
});

/** OAuth2 authorization redirect
 *
 * Redirects the user to the authorization endpoint of the given OAuth2 provider.
 */
controller.post('/oauth2/:provider/auth', function(req, res) {
  var providerName = req.urlParameters.provider;
  var provider = oauth2[providerName];
  if (!provider) {
    throw createError(500, `OAuth2 provider "${providerName}" not found or not configured correctly.`);
  }
  res.status(303);
  res.set('location', provider.getAuthUrl(
    getBaseUrl(req) + '/api/oauth2/' +
    providerName + '/login',
    {state: req.session.get('_key')}
  ));
})
.pathParam('provider', joi.string().description('Provider _key.'));


/** OAuth2 authorization callback
 *
 * Redirect target for the OAuth2 authorization endpoint.
 */
controller.get('/oauth2/:provider/login', function(req, res) {
  var providerName = req.urlParameters.provider;
  var provider = oauth2[providerName];
  if (!provider) {
    throw createError(500, `OAuth2 provider "${providerName}" not found or not configured correctly.`);
  }
  if (req.params('error')) {
    throw createError(500, req.params('error'));
    return;
  }
  if (req.params('state') !== req.session.get('_key')) {
    throw createError(400, 'CSRF mismatch');
    return;
  }
  try {
    var authData = provider.exchangeGrantToken(
      req.params('code'),
      getBaseUrl(req) + '/api/oauth2/' + providerName + '/login'
    );
    var profile = provider.fetchActiveUser(authData.access_token);
    var username = providerName + ':' + provider.getUsername(profile);
    // We want user objects created via OAuth2 to have their usernames prefixed with
    // the name of the OAuth2 provider and a colon. This allows us to distinguish
    // them more easily.
    var user = users.resolve(username);
    if (!user) user = users.create(username);
    user.get('userData')['oauth2_' + providerName] = profile;
    user.get('authData')['oauth2_' + providerName] = authData;
    user.save();
    req.session.get('sessionData').username = user.get('user');
    req.session.setUser(user);
    req.session.save();
    res.status(303);
    res.set('location', getBaseUrl(req) + '/');
  } catch(err) {
    throw createError(500, err.message);
  }
})
.pathParam('provider', joi.string().description('Provider _key.'));

/** Registered user list
 *
 * Returns a list of all known usernames.
 */
controller.get('/users', function(req, res) {
  res.json({users: users.list()});
});

/** Get current user
 *
 * If the user is logged in, returns the active user's userData. Otherwise
 * returns null for the userData.
 */
controller.get('/whoami', function(req, res) {
  if (!req.session.get('uid')) {
    res.json({user: null, username: ''});
  } else {
    res.json({
      user: req.session.get('userData') || {},
      username: req.session.get('sessionData').username
    });
  }
});

/** Get and increment a counter
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
.onlyIfAuthenticated();

/** Session dump
 *
 * Dumps the content of the session object. Also demonstrates how to
 * restrict a route to admin users.
 */
controller.get('/dump', function(req, res) {
  res.json(req.session.forClient());
})
.onlyIf(isAdmin)
.errorResponse(NotAnAdmin, 403, 'You are not an admin.');

