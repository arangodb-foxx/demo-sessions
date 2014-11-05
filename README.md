# Foxx Sessions Example App

This is the official example app for the Foxx `activateSessions` feature ArangoDB 2.3.

See the source of `index.js` for a full explanation.

If you want to mount this app and use the OAuth2 examples, make sure to mount the [official OAuth2 app](https://github.com/arangodb/foxx-oauth2) at `/oauth2` and ensure that the sessions example app is mounted at `/sessions-example-app`. Also make sure that you're using the default database called `_system` and ArangoDB is running at the default port (8529).
