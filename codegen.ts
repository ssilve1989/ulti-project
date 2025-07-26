import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: {
    'https://www.fflogs.com/api/v2/client': {
      headers: {
        Authorization: `Bearer ${process.env.FFLOGS_API_ACCESS_TOKEN}`,
      },
      experimentalFragmentVariables: true,
    },
  },
  documents: ['src/**/*.graphql', 'src/fflogs/queries.ts'],
  ignoreNoDocuments: true,
  emitLegacyCommonJSImports: false,
  generates: {
    './src/fflogs/graphql/schema.graphql': {
      plugins: ['schema-ast'],
      config: {
        includeDirectives: true,
        includeIntrospectionTypes: true,
      },
    },

    './src/fflogs/graphql/sdk.ts': {
      plugins: [
        'typescript',
        'typescript-operations',
        'typescript-graphql-request',
      ],
      config: {
        enumsAsConst: true,
        documentMode: 'string',
        immutableTypes: true,
        useTypeImports: true,
        avoidOptionals: true,
        strictScalars: true,
        nonOptionalTypename: true,
        arrayInputCoercion: false,
        scalars: {
          JSON: 'unknown',
        },
      },
    },
  },
};

export default config;
