# Foxx Sessions Example

This is the official example service for local Foxx sessions in ArangoDB 2.

See the source of `index.js` for more details. The `activateSessions` feature is documented in the Sessions section of the Foxx chapter of the ArangoDB documentation starting with ArangoDB 2.3.

## Dependencies

This Foxx uses the following dependencies:

* `users`: [util-users-local version 3.0.0](https://github.com/arangodb-foxx/util-users-local)
* `auth`: [util-simple-auth version 2.0.0](https://github.com/arangodb-foxx/util-simple-auth)
* `github` (optional): [util-oauth version 2.0.0](https://github.com/arangodb-foxx/util-oauth2) configured for GitHub
* `google` (optional): [util-oauth version 2.0.0](https://github.com/arangodb-foxx/util-oauth2) configured for Google
* `facebook` (optional): [util-oauth version 2.0.0](https://github.com/arangodb-foxx/util-oauth2) configured for Facebook

You need to install these services and provide their mount paths in the dependency setup dialog of this example service.
