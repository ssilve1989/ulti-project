# Ulti-Project Handoff Documentation

## Current Status: Workspace Restructure Complete

The repository has been successfully restructured as a **pnpm workspace** with shared types and improved architecture. All file history has been preserved through proper `git mv` operations.

## Repository Structure

```
ulti-project/
├── apps/
│   ├── discord-bot/          # NestJS Discord bot (moved from src/)
│   │   ├── src/             # All Discord bot source code
│   │   ├── package.json     # Bot-specific dependencies
│   │   ├── tsconfig.json    # Bot TypeScript config
│   │   └── ...              # Bot-specific config files
│   └── website/             # Astro.build website (moved from website/)
│       ├── src/             # Website source code
│       ├── package.json     # Website dependencies
│       ├── tsconfig.json    # Website TypeScript config
│       └── astro.config.mjs # Astro configuration
├── packages/
│   └── shared/              # Shared types and utilities
│       ├── src/types/       # Consolidated type definitions
│       ├── package.json     # Shared package config
│       └── tsconfig.json    # Shared TypeScript config
├── package.json             # Workspace root configuration
├── pnpm-workspace.yaml      # pnpm workspace definition
└── tsconfig.json            # Workspace TypeScript config with project references
```

## Key Changes Made

### 1. Workspace Structure

- **Root**: Now workspace-only with `pnpm -r` commands
- **Apps**: Discord bot and website as separate applications
- **Packages**: Shared types package for consistency

### 2. Type Consolidation

- **Before**: Duplicate types between `src/firebase/models/signup.model.ts` and `website/src/lib/types.ts`
- **After**: Single source of truth in `packages/shared/src/types/`

### 3. Shared Types Package (`@ulti-project/shared`)

```typescript
// packages/shared/src/types/encounters.ts
export enum Encounter {
  TOP = 'TOP',
  UWU = 'UWU', 
  UCOB = 'UCOB',
  TEA = 'TEA',
  DSR = 'DSR',
  FRU = 'FRU',
}

export const ENCOUNTER_INFO: Record<Encounter, EncounterInfo> = {
  // Consolidated encounter definitions with friendly names
}

// packages/shared/src/types/signup.ts
export interface SignupDocument {
  // Backend interface (matches Firebase document structure)
}

export interface SignupDisplayData {
  // Frontend interface (normalized for display)
}

// packages/shared/src/types/community.ts
export interface CommunityStats {
  // Community statistics and metadata
}
```

### 4. Git History Preservation

All files were moved using `git mv` to preserve complete history:

```bash
# Example: Check preserved history
git log --follow --oneline apps/discord-bot/firebase/models/signup.model.ts
git log --follow --oneline apps/website/src/pages/signups.astro
```

## Development Commands

### Workspace Level

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run all apps in development mode
pnpm dev

# Run tests across all packages
pnpm test

# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint
```

### Discord Bot (`apps/discord-bot/`)

```bash
cd apps/discord-bot

# Development
pnpm dev

# Build
pnpm build

# Start production
pnpm start

# Tests
pnpm test

# Generate GraphQL types
pnpm graphql:codegen
```

### Website (`apps/website/`)

```bash
cd apps/website

# Development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Type checking
pnpm typecheck
```

### Shared Package (`packages/shared/`)

```bash
cd packages/shared

# Build types
pnpm build

# Watch mode for development
pnpm dev

# Type checking
pnpm typecheck
```

## Type Usage Examples

### Frontend (Website)

```typescript
// apps/website/src/lib/types.ts
export * from '@ulti-project/shared/types';

// apps/website/src/lib/mockData.ts
import { Encounter, ENCOUNTER_INFO, type SignupDisplayData } from '@ulti-project/shared/types';

export const mockEncounters = Object.values(ENCOUNTER_INFO);
export const mockSignups: SignupDisplayData[] = [
  {
    encounter: Encounter.FRU,
    // ... other properties
  }
];
```

### Backend (Discord Bot)

```typescript
// apps/discord-bot/src/firebase/models/signup.model.ts
import { SignupDocument, Encounter } from '@ulti-project/shared/types';

// Use shared types in Firebase collections
export class SignupCollection {
  async create(signup: SignupDocument) {
    // Implementation using shared types
  }
}
```

## Current Website Status

The website is fully functional with:

- **12 mock signups** across multiple encounters (FRU, TOP, DSR)
- **Complete filtering system** (encounter, party type, role, search)
- **Responsive design** with Tailwind CSS
- **Type-safe development** using shared types

### Running the Website

```bash
cd apps/website
pnpm dev --host --port 4323
```

Access at: <http://localhost:4323>

## Benefits Achieved

### 1. Type Consistency

- **Single source of truth** for all type definitions
- **No more type drift** between frontend and backend
- **Compile-time safety** across the entire codebase

### 2. Better Developer Experience

- **Faster builds** with TypeScript project references
- **Easier dependency management** with workspace structure
- **Consistent tooling** across all packages

### 3. Scalability

- **Easy to add new packages** (e.g., mobile app, admin dashboard)
- **Shared utilities** can be added to the shared package
- **Independent versioning** for each app

### 4. Maintainability

- **Clear separation of concerns** between apps and shared code
- **Easier testing** with isolated packages
- **Better CI/CD** with workspace-aware commands

## Next Steps (Phase 3: Real API Integration)

The next developer should focus on replacing mock data with real API integration:

### 1. Backend API Endpoints

```typescript
// apps/discord-bot/src/website/website.controller.ts
@Controller('api/website')
export class WebsiteController {
  @Get('signups')
  async getSignups(@Query() filters: SignupFilters) {
    // Return real data from Firebase
  }

  @Get('stats')
  async getStats() {
    // Return community statistics
  }
}
```

### 2. Frontend API Integration

```typescript
// apps/website/src/lib/api.ts
const USE_MOCK_DATA = process.env.NODE_ENV === 'development' && process.env.USE_MOCK === 'true';

export async function getSignups(filters: SignupFilters = {}) {
  if (USE_MOCK_DATA) {
    return getMockSignups(filters);
  }
  
  // Real API calls to Discord bot backend
  const response = await fetch(`${API_BASE_URL}/api/website/signups`);
  return response.json();
}
```

### 3. Environment Configuration

```bash
# apps/website/.env.local
API_BASE_URL=http://localhost:3000
USE_MOCK=false
```

## Migration Notes

### From Previous Structure

- All Discord bot code moved from `src/` to `apps/discord-bot/src/`
- Website code moved from `website/` to `apps/website/`
- Shared types extracted to `packages/shared/src/types/`

### Breaking Changes

- Import paths changed for shared types
- Build commands now use workspace structure
- TypeScript configuration uses project references

### Compatibility

- All existing functionality preserved
- Firebase integration unchanged
- Discord bot commands work identically
- Website features fully functional

## Troubleshooting

### Type Errors

If you see type errors related to `@ulti-project/shared`:

```bash
# Build the shared package first
cd packages/shared && pnpm build

# Or build all packages
pnpm build
```

### Dependency Issues

```bash
# Clean install
rm -rf node_modules
pnpm install
```

### Development Server Issues

```bash
# Make sure you're in the right directory
cd apps/website  # for website
cd apps/discord-bot  # for Discord bot

# Check if dependencies are installed
pnpm install
```

## Documentation Links

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Astro.build Documentation](https://docs.astro.build/)
- [NestJS Documentation](https://docs.nestjs.com/)

---

**Status**: ✅ Workspace Restructure Complete  
**Next Phase**: Real API Integration  
**Estimated Effort**: 1-2 weeks for full API integration

The repository is now ready for the next developer to implement real API integration using the shared types and improved architecture.
