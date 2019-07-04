'use strict';

const bourne = require('@hapi/bourne');
const {GraphQLError, introspectFields} = require('titan-graphql');

function factory(_router, _graphQL) {
  _router.decorateStream('graphql', {
    get() {
      const proto = {};
      const self = this;

      async function request(_query, _variables, _operationName) {
        const res = await _graphQL.request({
          stream: self
        }, _query, _variables, _operationName);

        self.status(200).type('application/json').send(res);
      }

      Object.defineProperties(proto, {
        GraphQLError: {enumerable: true, value: GraphQLError},
        introspectFields: {enumerable: true, value: introspectFields},
        request: {enumerable: true, value: request}
      });

      return proto;
    }
  });

  _router.get('', async _stream => {
    const {query, operationName} = _stream.query;
    let variables = _stream.query.variables;
    if (variables) {
      variables = bourne.parse(variables);
    }

    return _stream.graphql.request(
      query,
      variables,
      operationName
    );
  });

  _router.post('', async _stream => {
    const body = await _stream.body();
    if (!body || body.constructor !== Object) {
      throw new GraphQLError('Invalid input format', [{message: 'Invalid input format'}]);
    }

    const {query, variables, operationName} = body;
    return _stream.graphql.request(
      query,
      variables,
      operationName
    );
  });

  _router.setErrorHandler((_error, _stream) => {
    if (_error instanceof GraphQLError) {
      _stream.status(409).type('application/json').send({
        data: null,
        errors: _error.errors
      });
      return;
    }

    throw _error;
  });
}

module.exports = factory;
