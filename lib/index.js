'use strict';

const http2 = require('http2');
const bourne = require('@hapi/bourne');
const {GraphQLError, introspectFields} = require('titan-graphql');

function factory(_router, _config) {
  const config = {
    buildContext: stream => {
      stream;
    },
    formatError: error => error,
    ..._config
  };

  _router.decorateStream('graphql', async function(_query, _variables, _operationName) {
    const context = config.buildContext(this);
    const res = await config.graphql.request(context, _query, _variables, _operationName);
    if (res.errors) {
      res.errors = res.errors.map(e => config.formatError(e, this));
    }

    this
      .status(http2.constants.HTTP_STATUS_OK)
      .type('application/json')
      .send(res);
  });

  _router.get('', async _stream => {
    const {query, operationName} = _stream.query;
    let variables = _stream.query.variables;
    if (variables) {
      variables = bourne.parse(variables);
    }

    return _stream.graphql(
      query,
      variables,
      operationName
    );
  });

  _router.post('', async _stream => {
    const body = await _stream.body();
    if (!body || body.constructor !== Object) {
      throw new GraphQLError('Invalid input format');
    }

    const {query, variables, operationName} = body;
    return _stream.graphql(
      query,
      variables,
      operationName
    );
  });

  _router.setErrorHandler((_error, _stream) => {
    if (_error instanceof GraphQLError) {
      _stream
        .status(http2.constants.HTTP_STATUS_CONFLICT)
        .type('application/json').send({
          code: 'graphql',
          message: _error.message,
          errors: _error.errors
        });
      return;
    }

    throw _error;
  });
}

Object.defineProperties(factory, {
  GraphQLError: {enumerable: true, value: GraphQLError},
  introspectFields: {enumerable: true, value: introspectFields}
});

module.exports = factory;
