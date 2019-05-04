'use strict';

class GraphQLError extends Error {
  constructor(_message, _errors) {
    super(_message);

    this.errors = _errors;
  }
}

module.exports = GraphQLError;
