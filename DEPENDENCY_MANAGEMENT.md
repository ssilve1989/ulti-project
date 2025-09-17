# Dependency Management

This project uses pnpm's built-in `minimumReleaseAge` feature to ensure all dependencies are at least 5 days old before installation, helping prevent supply chain attacks and reducing exposure to newly published packages with potential security vulnerabilities.

## Configuration

### PNPM Minimum Release Age
The project is configured as a pnpm workspace (even though it's a single package) to enable the `minimumReleaseAge` feature:

**File: `pnpm-workspace.yaml`**
```yaml
packages:
  - '.'

minimumReleaseAge: 432000000  # 5 days in milliseconds
```

This configuration:
- Requires all packages to be at least 5 days old before installation
- Applies to both dependencies and devDependencies
- Works automatically with all pnpm commands (`install`, `add`, `update`)

### Conservative Dependabot Updates
**File: `.github/dependabot.yml`**
- Monthly update schedule (instead of weekly)
- Limited to 5 concurrent pull requests
- Grouped updates for related packages (NestJS, Sentry, etc.)

### PNPM Configuration
**File: `.pnpmrc`**
- Exact version saving (`save-exact=true`)
- Strict peer dependency handling
- Disabled auto-install of peer dependencies

## Benefits

1. **Supply Chain Protection**: Prevents installation of packages published less than 5 days ago
2. **Community Validation**: Allows time for the community to identify issues in new releases
3. **Predictable Updates**: Monthly schedule reduces surprise breaking changes
4. **Automatic Enforcement**: No manual validation required - pnpm handles it automatically

## Usage

All standard pnpm commands respect the minimum release age:

```bash
# These will only install packages >= 5 days old
pnpm install
pnpm add lodash
pnpm update

# Check current configuration
pnpm config list | grep minimum-release-age
```

## Error Handling

If you try to install a package that's too new, pnpm will show an error:
```
ERROR  Package example@1.0.0 was published less than 5 days ago
```

For emergency security fixes, you can temporarily override by updating the `minimumReleaseAge` value in `pnpm-workspace.yaml`.