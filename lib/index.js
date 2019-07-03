'use strict';

const bourne = require('@hapi/bourne');
const hashLRU = require('hashlru');
const graphQL = require('graphql');

const modelError = require('./error');
const introspectFields = require('./introspectFields');

function defaultFormatError(_error) {
  return {
    message: _error.message,
    stack: _error.stack
  };
}

function factory(_router, _config) {
  const config = Object.assign({
    schema: `
      type Query
      type Mutation

      schema {
        query: Query
        mutation: Mutation
      }
    `,
    root: {},
    extensions: [],
    formatError: defaultFormatError,
    cacheSize: 100
  }, _config);

  const astSchema = graphQL.parse(config.schema);
  let schema = graphQL.buildASTSchema(astSchema);
  if (config.extensions.length) {
    const extensionsSchema = config.extensions.map(e => e.schema).join('');
    const astExtensions = graphQL.parse(extensionsSchema);
    schema = graphQL.extendSchema(schema, astExtensions);

    for (const extension of config.extensions) {
      if (extension.populate) {
        extension.populate(schema, graphQL);
      }
    }
  }

  const errors = graphQL.validateSchema(schema);
  if (errors.length) {
    throw new modelError(`Invalid GraphQL schema:\n${JSON.stringify(errors, null, '  ')}`, errors);
  }

  const cache = hashLRU(config.cacheSize);
  async function request(_context, _query, _variables, _operationName) {
    if (typeof _query !== 'string') {
      throw new modelError('Missing GraphQL query', [{message: 'Missing query'}]);
    }

    let astQuery = cache.get(_query);
    if (!astQuery) {
      astQuery = graphQL.parse(_query);
      const errors = graphQL.validate(schema, astQuery);
      if (errors.length) {
        throw new modelError('Malformed GraphQL query', errors);
      }

      cache.set(_query, astQuery);
    }

    const res = graphQL.execute(
      schema,
      astQuery,
      config.root,
      _context,
      _variables,
      _operationName
    );

    if (res.errors) {
      throw new modelError('GraphQL query execution error', errors);
    }

    return res;
  }

  _router.decorateStream('graphql', {
    get() {
      const self = this;
      return {
        introspectFields,
        async request(_query, _variables, _operationName) {
          const res = await request({
            stream: self
          }, _query, _variables, _operationName);

          self.status(200).type('application/json').send(res);
        }
      };
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
    if (typeof body !== 'object') {
      throw new modelError('Invalid input format', [{message: 'Invalid input format'}]);
    }

    const {query, variables, operationName} = body;
    return _stream.graphql.request(
      query,
      variables,
      operationName
    );
  });

  _router.setErrorHandler((_error, _stream) => {
    if (_error instanceof modelError) {
      _stream.status(409).type('application/json').send({
        data: null,
        errors: _error.errors
      });
      return;
    }

    throw _error;
  });
}

Object.defineProperties(factory, {
  GraphQLError: {enumerable: true, value: modelError}
});

module.exports = factory;
