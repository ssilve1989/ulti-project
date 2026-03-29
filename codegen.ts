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
        {
          add: {
            content: `
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;
  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }
  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}`,
          },
        },
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
