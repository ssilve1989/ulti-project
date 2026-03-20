// biome-ignore lint/style/noCommonJs: renvoate config file
module.exports = {
  $schema: 'https://docs.renovatebot.com/renovate-schema.json',

  // Skip onboarding PR since we're self-hosting
  onboarding: false,
  requireConfig: 'optional',
  // repositories: ['ssilve1989/ulti-project'],

  // Target master branch
  baseBranchPatterns: ['master'],

  // Branch naming to match existing convention (hyphen separator like Dependabot)
  branchPrefix: 'renovate-',

  // Only enable the managers we need right now
  enabledManagers: ['npm', 'github-actions'],

  // Rate limiting for a large monorepo
  prConcurrentLimit: 25,
  prHourlyLimit: 8,

  // Separate major from minor/patch
  separateMajorMinor: true,

  // Match pnpm-workspace.yaml minimumReleaseAge: 7200 (minutes)
  minimumReleaseAge: '5 days',

  // Schedule: weekdays during business hours (ET)
  timezone: 'America/New_York',
  schedule: ['after 9am and before 5pm every weekday'],

  // Package rules for grouping
  packageRules: [
    // --- NPM grouping (migrated from Dependabot groups) ---
    {
      groupName: 'NestJS core',
      matchManagers: ['npm'],
      matchPackageNames: [
        '/^@nestjs\\/common$/',
        '/^@nestjs\\/core$/',
        '/^@nestjs\\/cqrs$/',
        '/^@nestjs\\/microservices$/',
        '/^@nestjs\\/platform-express$/',
        '/^@nestjs\\/schematics$/',
        '/^@nestjs\\/testing$/',
        '/^@nestjs\\/cli$/',
      ],
    },
    {
      groupName: 'Vitest',
      matchManagers: ['npm'],
      matchPackageNames: ['/^@vitest\\//', '/vitest/'],
    },
    {
      groupName: 'Pino',
      matchManagers: ['npm'],
      matchPackageNames: ['/^pino/'],
    },
    {
      groupName: 'Vite',
      matchManagers: ['npm'],
      matchPackageNames: ['/^vite$/', '/^unplugin-swc$/'],
    },
    {
      groupName: 'Commitlint',
      matchManagers: ['npm'],
      matchPackageNames: ['/^@commitlint\\//'],
    },
    {
      groupName: 'Sentry',
      matchManagers: ['npm'],
      matchPackageNames: ['/^@sentry\\//'],
    },
    {
      groupName: 'GraphQL Codegen',
      matchManagers: ['npm'],
      matchPackageNames: ['/^@graphql-codegen\\//', '/^graphql/'],
    },
    // --- GitHub Actions grouping ---
    {
      groupName: 'GitHub Actions',
      matchManagers: ['github-actions'],
      matchPackageNames: ['*'],
    },
    // Use maven versioning for Bazel Maven deps
    {
      matchManagers: ['bazel-module'],
      matchDatasources: ['maven'],
      versioning: 'maven',
    },
    // Assign npm PRs to frontend platform team
    {
      matchManagers: ['npm'],
      assignees: ['ssilve1989', 'zackerydev'],
      reviewers: ['ssilve1989', 'zackerydev'],
    },
    // Assign LangChain PRs to david-trumid
    {
      matchManagers: ['npm'],
      matchPackageNames: ['/^@langchain\\//'],
      assignees: ['david-trumid', 'ssilve1989', 'zackerydev'],
      reviewers: ['david-trumid', 'ssilve1989', 'zackerydev'],
    },
    // Match pnpm-workspace.yaml minimumReleaseAgeExclude for typescript
    {
      matchPackageNames: ['typescript'],
      minimumReleaseAge: '0 seconds',
    },
  ],

  // Ignore paths that shouldn't be scanned
  ignorePaths: ['node_modules/**'],
};
