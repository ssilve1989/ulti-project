#!/usr/bin/env node
/**
 * Check dependency age script
 * Verifies that dependencies are at least 5 days old before installation
 * Usage: node scripts/check-dependency-age.js [package-name]
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIN_AGE_DAYS = 5;
const packageJsonPath = join(process.cwd(), 'package.json');

function getPackageInfo(packageName) {
  try {
    const output = execSync(`npm view ${packageName} time --json`, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    return JSON.parse(output);
  } catch (error) {
    console.warn(`Warning: Could not fetch info for ${packageName}: ${error.message}`);
    return null;
  }
}

function getDaysSincePublished(publishDate) {
  const now = new Date();
  const published = new Date(publishDate);
  const diffMs = now - published;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function checkDependencyAge(packageName, version) {
  const packageInfo = getPackageInfo(`${packageName}@${version}`);
  if (!packageInfo) {
    return { package: packageName, version, age: null, warning: 'Could not fetch package info' };
  }

  const publishDate = packageInfo[version] || packageInfo.modified || packageInfo.created;
  if (!publishDate) {
    return { package: packageName, version, age: null, warning: 'Could not determine publish date' };
  }

  const age = getDaysSincePublished(publishDate);
  const tooNew = age < MIN_AGE_DAYS;

  return {
    package: packageName,
    version,
    age,
    publishDate,
    tooNew,
    warning: tooNew ? `Package is only ${age} days old (minimum: ${MIN_AGE_DAYS} days)` : null
  };
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node scripts/check-dependency-age.js [package-name@version]');
    console.log('Example: node scripts/check-dependency-age.js lodash@4.17.21');
    console.log('Or check a specific package: node scripts/check-dependency-age.js lodash');
    process.exit(1);
  }

  const input = args[0];
  let packageName, version;

  if (input.includes('@') && !input.startsWith('@')) {
    [packageName, version] = input.split('@');
  } else if (input.startsWith('@') && input.split('@').length === 3) {
    // Scoped package with version like @nestjs/core@11.1.3
    const parts = input.split('@');
    packageName = `@${parts[1]}`;
    version = parts[2];
  } else {
    packageName = input;
    // Try to get version from package.json
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      version = packageJson.dependencies?.[packageName] || 
                packageJson.devDependencies?.[packageName];
      if (version) {
        version = version.replace(/^[\^~]/, ''); // Remove version prefixes
      }
    } catch (error) {
      console.error('Could not read package.json to determine version');
      process.exit(1);
    }
  }

  if (!version) {
    console.error(`Could not determine version for ${packageName}`);
    process.exit(1);
  }

  console.log(`Checking age of ${packageName}@${version}...`);
  const result = checkDependencyAge(packageName, version);

  console.log('\nResults:');
  console.log(`Package: ${result.package}`);
  console.log(`Version: ${result.version}`);
  if (result.age !== null) {
    console.log(`Age: ${result.age} days`);
    console.log(`Published: ${result.publishDate}`);
  }
  
  if (result.warning) {
    console.log(`⚠️  WARNING: ${result.warning}`);
    if (result.tooNew) {
      console.log(`\nRecommendation: Wait ${MIN_AGE_DAYS - result.age} more days before updating to this version.`);
      process.exit(1);
    }
  } else if (result.age !== null) {
    console.log(`✅ Package age is acceptable (${result.age} days >= ${MIN_AGE_DAYS} days)`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}