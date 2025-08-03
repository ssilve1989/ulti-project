import { registerVersioningStrategy } from 'release-please';

/**
 * Custom versioning strategy that only triggers releases for specific commit types:
 * - feat: minor version bump
 * - fix: patch version bump
 * - refactor: patch version bump
 * - perf: patch version bump
 * - Breaking changes (!): major version bump
 *
 * Excludes: docs, ci, build, chore, style, test
 */
class SelectiveVersioningStrategy {
  constructor(options = {}) {
    this.bumpMinorPreMajor = options.bumpMinorPreMajor || false;
    this.bumpPatchForMinorPreMajor = options.bumpPatchForMinorPreMajor || false;
  }

  static get RELEASABLE_TYPES() {
    return new Set(['feat', 'feature', 'fix', 'refactor', 'perf']);
  }

  /**
   * Determine if a commit should trigger a release
   */
  isReleasableCommit(commit) {
    // Breaking changes are always releasable
    if (
      commit.notes?.some((note) => note.title === 'BREAKING CHANGE') ||
      commit.type?.endsWith('!')
    ) {
      return true;
    }

    // Check if commit type is in our allowed list
    const baseType = commit.type?.replace('!', '') || '';
    return SelectiveVersioningStrategy.RELEASABLE_TYPES.has(baseType);
  }

  /**
   * Determine the type of version bump needed
   */
  getVersionBumpType(commits) {
    const releasableCommits = commits.filter((commit) =>
      this.isReleasableCommit(commit),
    );

    if (releasableCommits.length === 0) {
      return 'none';
    }

    // Check for breaking changes
    const hasBreakingChange = releasableCommits.some(
      (commit) =>
        commit.notes?.some((note) => note.title === 'BREAKING CHANGE') ||
        commit.type?.endsWith('!'),
    );

    if (hasBreakingChange) {
      return 'major';
    }

    // Check for features
    const hasFeature = releasableCommits.some(
      (commit) => commit.type === 'feat' || commit.type === 'feature',
    );

    if (hasFeature) {
      return 'minor';
    }

    // Everything else is a patch (fix, deps, refactor, perf)
    return 'patch';
  }

  /**
   * Bump the version based on commits
   */
  bump(version, commits) {
    const bumpType = this.getVersionBumpType(commits);

    switch (bumpType) {
      case 'major':
        return version
          .toString()
          .split('.')
          .map((v, i) => (i === 0 ? Number.parseInt(v) + 1 : 0))
          .join('.');
      case 'minor': {
        const [major, minor] = version.toString().split('.');
        return `${major}.${Number.parseInt(minor) + 1}.0`;
      }
      case 'patch': {
        const [maj, min, patch] = version.toString().split('.');
        return `${maj}.${min}.${Number.parseInt(patch) + 1}`;
      }
      default:
        return version; // No version bump needed
    }
  }

  /**
   * Determine release type for chaining strategies
   */
  determineReleaseType(version, commits) {
    const bumpType = this.getVersionBumpType(commits);

    if (bumpType === 'none') {
      return undefined;
    }

    // Return the bump type for release-please to handle
    return bumpType;
  }
}

// Register the custom strategy
registerVersioningStrategy(
  'selective',
  (options) => new SelectiveVersioningStrategy(options),
);

export { SelectiveVersioningStrategy };
