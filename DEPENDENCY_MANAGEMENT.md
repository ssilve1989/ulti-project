# Dependency Management

This project implements dependency age requirements to ensure stability and security by avoiding very recently published packages.

## Dependency Age Requirements

### Minimum Age Policy
All dependencies must be at least **5 days old** before being installed or updated. This policy helps avoid:
- Newly published packages with potential security vulnerabilities
- Packages with critical bugs discovered shortly after release
- Supply chain attacks targeting recently published versions

### Implementation

#### 1. PNPM Configuration (`.pnpmrc`)
The project uses a `.pnpmrc` file with settings that help control dependency freshness:
- `prefer-offline=true` - Prefers cached packages over fresh registry queries
- `save-exact=true` - Uses exact versions to prevent automatic updates
- `strict-peer-dependencies=true` - Ensures version consistency
- Extended cache timeouts to reduce fetching of very fresh packages

#### 2. Dependabot Configuration
The `.github/dependabot.yml` is configured to:
- Update dependencies **monthly** instead of weekly
- Limit concurrent pull requests to 5 (reduced from 10)
- Group related dependencies together for easier review
- Add structured commit messages with proper prefixes

#### 3. Dependency Age Checker Script
A custom script `scripts/check-dependency-age.js` validates package ages:

```bash
# Check age of a specific package
pnpm check-deps-age lodash

# Check age of a package with specific version
pnpm check-deps-age lodash@4.17.21

# Check age of a scoped package
pnpm check-deps-age @nestjs/core
```

The script will:
- ✅ Pass if the package is 5+ days old
- ⚠️ Warn and exit with code 1 if the package is too new
- Show publish date and exact age in days

## Usage Guidelines

### Before Adding New Dependencies
1. Check the package age: `pnpm check-deps-age <package-name>`
2. If the package is too new, wait until it meets the 5-day requirement
3. Consider if the dependency is truly necessary

### Before Updating Dependencies
1. Run `pnpm outdated` to see available updates
2. Check age of updated versions: `pnpm check-deps-age <package>@<new-version>`
3. Only update packages that meet the age requirement

### Automatic Updates via Dependabot
- Dependabot is configured to run monthly
- Updates are grouped by related packages (NestJS, Sentry, etc.)
- Review all dependency updates carefully before merging
- The age checker can be run manually in PR reviews

## Configuration Files

### `.pnpmrc`
Contains pnpm-specific settings for dependency management:
- Registry configuration
- Caching policies
- Peer dependency handling
- Exact version saving

### `package.json` - pnpm section
```json
{
  "pnpm": {
    "updateConfig": {
      "ignoreDependencies": []
    }
  }
}
```

### `.github/dependabot.yml`
Configures automated dependency updates with conservative settings:
- Monthly update schedule
- Limited concurrent PRs
- Dependency grouping
- Structured commit messages

## Benefits

1. **Security**: Avoid supply chain attacks on newly published packages
2. **Stability**: Reduce risk of bugs in fresh releases
3. **Predictability**: Controlled update schedule reduces surprise breaking changes
4. **Quality**: Time for community to identify and report issues
5. **Maintainability**: Grouped updates make review process more efficient

## Emergency Overrides

In rare cases where a critical security fix requires using a package newer than 5 days:

1. Document the security issue requiring the override
2. Get team approval for the exception
3. Add the package to a temporary ignore list if needed
4. Monitor the package closely for any issues

## Monitoring

- Check dependency ages before major releases
- Review Dependabot PRs promptly to avoid accumulating updates
- Use `pnpm audit` regularly for security vulnerabilities
- Monitor package advisories for dependencies in use