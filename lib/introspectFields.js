'use strict';

const extend = require('extend');
const graphQL = require('graphql');

const SEARCH_PATH_SEPARATOR = '.';

function buildFragmentExtension(_info, _parent, _fragment) {
  const parent = _info.schema.getType(_fragment.typeCondition.name.value);
  let extension = introspectLocalFields(_info, parent, _fragment);
  if (_fragment.typeCondition.name.value !== _parent.name) {
    extension = {
      $: {
        [_fragment.typeCondition.name.value]: extension
      }
    };
  }

  return extension;
}

function introspectLocalFields(_info, _parent, _context) {
  return _context.selectionSet.selections.reduce((projection, selection) => {
    switch (selection.kind) {
      case 'Field': {
        if (selection.selectionSet) {
          const field = _parent.getFields()[selection.name.value];
          if (field.resolve) {
            return projection;
          }

          let type = field.type;
          while (!(type instanceof graphQL.GraphQLObjectType)) {
            if (type instanceof graphQL.GraphQLList) {
              type = type.ofType;
            } else if (type instanceof graphQL.GraphQLNonNull) {
              type = type.ofType;
            } else {
              throw new Error('Unsupported child type');
            }
          }

          return extend(true, projection, {
            [selection.name.value]: introspectLocalFields(_info, type, selection)
          });
        } else {
          return extend(projection, {
            [selection.name.value]: true
          });
        }
      }
      case 'InlineFragment':
        return extend(true, projection, buildFragmentExtension(_info, _parent, selection));
      case 'FragmentSpread': {
        const fragment = _info.fragments[selection.name.value];
        return extend(true, projection, buildFragmentExtension(_info, _parent, fragment));
      }
      default:
        throw new Error(`Unsupported ${selection.kind} query selection`);
    }
  }, {});
}

function introspectFields(_info, _searchPath) {
  let context = _info.fieldNodes[0];
  if (_searchPath) {
    const parts = _searchPath.split(SEARCH_PATH_SEPARATOR);
    for (let i = 0; i < parts.length; ++i) {
      const part = parts[i];
      if (!context.selectionSet) {
        return {};
      }

      context = context.selectionSet.selections.find(
        selection => selection.kind === 'Field' &&
        selection.name.value === part
      );

      if (!context) {
        return {};
      }
    }
  }

  if (!context.selectionSet) {
    return {};
  }

  const returnType = _info.schema.getType(_info.returnType);
  return introspectLocalFields(_info, returnType, context);
}

module.exports = introspectFields;
