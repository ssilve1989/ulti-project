# HANDOFF DOCUMENT - Ulti Project

## Project Overview

Discord bot project for managing FFXIV (Final Fantasy XIV) community signups for ultimate raids. Currently syncs data to Firebase and Google Sheets, with a new Astro.build website being added to replace Google Sheets dependency.

## Current Status: ✅ PHASE 2 COMPLETE - Mock Website with Client-Side Pagination

### What's Working

- **Astro Website**: Fully functional at `http://localhost:4324`
- **Landing Page**: Complete with community branding, theme toggle, and all sections
- **Signups Page**: ✅ **Client-side pagination implemented** - no page refreshes!
- **100 Mock Signups**: Expanded from 12 to 100 realistic signups
- **Theme System**: Dark/light mode toggle with proper contrast
- **Mock API**: Realistic data structure matching Firebase schema
- **React Integration**: Working smoothly with `client:load` directive

### Recent Implementation Success

- ✅ Implemented client-side pagination with React component
- ✅ Page size selector (10, 20, 50, 100 items per page)
- ✅ Smooth page transitions without flicker
- ✅ State preservation (filters remain when changing pages)
- ✅ Proper React integration using Astro's client directives
- ✅ Used `:global()` CSS selectors for React component styling

## Technical Architecture

### Current Stack

- **Backend**: NestJS Discord bot with Firebase/Firestore
- **Frontend**: Astro.build with React components
- **Styling**: CSS custom properties (no Tailwind dependency issues)
- **Data**: Mock API currently, ready for real Firebase integration

### File Structure

```
ulti-project/
├── apps/
│   ├── website/                    # Astro website
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── index.astro     # Landing page
│   │   │   │   └── signups.astro   # Signups page with React component
│   │   │   ├── components/
│   │   │   │   └── SignupsTable.tsx # React component for pagination
│   │   │   ├── layouts/
│   │   │   │   └── Layout.astro    # Shared layout with theme toggle
│   │   │   └── lib/
│   │   │       ├── api.ts          # Mock API with pagination support
│   │   │       └── mockData.ts     # 100 realistic signups
│   │   └── package.json
│   └── discord-bot/                # NestJS Discord bot
└── packages/
    └── shared/                     # Shared types between frontend/backend
├── ASTRO_INTEGRATION_PLAN.md       # Detailed technical plan (updated)
└── HANDOFF.md                      # This document
```

### Key Implementation Details

#### Theme System

- CSS custom properties for theming
- Floating toggle button (top-right corner)
- localStorage persistence
- Smooth transitions between themes
- Fixed contrast issues in light mode

#### Mock Data Structure

```typescript
interface Signup {
  id: string;
  discordId: string;
  characterName: string;
  world: string;
  job: string;
  encounter: string;
  partyType: 'Prog' | 'Clear';
  progPoint: string;
  availability: string[];
  createdAt: Date;
  status: 'pending' | 'approved' | 'rejected';
  schedulingStatus?: 'unscheduled' | 'scheduled' | 'completed';
}
```

#### Current Mock Data

- **100 realistic signups** generated programmatically
- All ultimate encounters represented (FRU, TOP, DSR, TEA, UWU, UCOB)
- Mix of Prog/Clear party types
- Realistic prog points for each encounter
- Proper job distribution across Tank/Healer/DPS roles
- Various availability patterns (weekday/weekend combinations)
- Squad assignments (Sex Gods 3000, Space Travelers, or unassigned)

## Development Commands

### Running the Website

```bash
cd apps/website
pnpm run dev --host
# Runs on http://localhost:4321 (or 4324 if port in use)
```

### Alternative Port

```bash
cd apps/website
pnpm run dev --host --port 4324
# Use when default port is occupied
```

### pnpm Workspace Commands (from root)

```bash
# Install dependencies for all packages
pnpm install

# Run specific app
pnpm --filter website dev
pnpm --filter discord-bot dev

# Build all packages
pnpm build
```

## Next Steps (Phase 3: Real API Integration)

### Immediate Tasks

1. **Backend API Development**
   - Create NestJS API endpoints (`/api/signups`, `/api/stats`)
   - Implement Firebase/Firestore queries
   - Add filtering and pagination
   - Cost optimization (avoid direct Firestore calls from frontend)

2. **Frontend Integration**
   - Replace mock API calls with real endpoints
   - Add error handling and loading states
   - Implement real-time updates if needed

3. **Deployment**
   - Deploy website (Vercel/Netlify recommended)
   - Configure environment variables
   - Set up CI/CD pipeline

### Future Enhancements

1. **Scheduling System**
   - Coordinator dashboard
   - Optimistic locking for concurrency
   - Calendar integration
   - Automated notifications

2. **Advanced Features**
   - User authentication
   - Real-time signup updates
   - Advanced filtering/search
   - Mobile responsiveness improvements

## Cost Considerations

- **Current**: <$5/month (Fly.io + free-tier Firestore)
- **Projected**: <$7/month with website hosting
- **Savings**: ~$15/month by removing Google Sheets API dependency

## Known Issues & Limitations

### Resolved Issues

- ✅ Layout component import errors
- ✅ Light mode contrast problems
- ✅ File extension issues with ESM imports
- ✅ Theme toggle functionality

### Current Limitations

- Mock data only (by design for Phase 2)
- No real-time updates
- Basic responsive design
- No user authentication

## Development Notes

### Important Technical Decisions

1. **React Integration**: Used external React components with `client:load` directive for interactivity
2. **Client-Side Pagination**: Better UX than server-side URL params (no page refreshes)
3. **CSS Custom Properties**: Chosen over Tailwind for better theme control
4. **Mock-First Approach**: Allows frontend development without backend changes
5. **Unified Component**: Single React component manages all state (filters + pagination)

### Key Learnings: Astro + React Integration

1. **Client Directives are Required**: React components need `client:*` directives to be interactive

   ```astro
   <SignupsTable client:load />  <!-- ✅ Interactive -->
   <SignupsTable />              <!-- ❌ Static HTML only -->
   ```

2. **Import Paths**: Don't use `.tsx` extension in imports

   ```typescript
   import { SignupsTable } from '../components/SignupsTable';     // ✅ Correct
   import { SignupsTable } from '../components/SignupsTable.tsx'; // ❌ Wrong
   ```

3. **Styling React from Astro**: Use `:global()` selectors

   ```css
   :global(.pagination-button) {  /* ✅ Works */
   .pagination-button {           /* ❌ Won't apply to React component */
   ```

### Code Quality Standards

- TypeScript strict mode enabled
- Functional programming preferred
- Modern ES6+ practices
- Composition over configuration
- Clean up unused variables
- Prefer `as const` over `enum`
- **NEVER change colors of pre-existing components/styles unless explicitly requested**
- **Squad and Status columns are FUTURE FEATURES - keep them hidden from signups table**

## Community Context

### Sausfest Community

- FFXIV community on Aether Data Center
- Focus on endgame content (Ultimate raids)
- Current content: FRU (Futures Rewritten Ultimate)
- Active squads: Sex Gods 3000, Space Travelers

### Prog Requirements

- **Prog Parties**: P2 Light Rampant minimum
- **Clear-Ready**: P5 Fulgent Blade 1 (Exalines 1) minimum
- **Proof Requirement**: Screenshots/logs must be <4 weeks old

## Migration Guide Integration

This handoff document should be read alongside `ASTRO_INTEGRATION_PLAN.md` which contains:

- Detailed technical architecture
- Cost analysis and projections
- Step-by-step implementation phases
- Database schema considerations
- Future scheduling system design

## Session Continuity

### For Next Session

1. Read this HANDOFF.md first
2. Review ASTRO_INTEGRATION_PLAN.md for technical details
3. Test current website: `cd website && pnpm run dev --host`
4. Verify all functionality before making changes
5. Update this document with any new developments

### Update Protocol

- Always update HANDOFF.md when making significant changes
- Keep both HANDOFF.md and ASTRO_INTEGRATION_PLAN.md in sync
- Document any new issues or resolutions
- Update status sections with current progress

---

**Last Updated**: Current session - Client-side pagination successfully implemented
**Major Achievement**: ✅ Smooth, flicker-free pagination with React integration
**Next Priority**: Phase 3 - Real API integration when ready
**Status**: ✅ Ready for community feedback and Phase 3 planning

### Recent Session Summary

Successfully implemented client-side pagination by:

1. Creating a unified React component (`SignupsTable.tsx`)
2. Using Astro's `client:load` directive for proper hydration
3. Implementing page size selector and smooth transitions
4. Expanding mock data from 12 to 100 signups
5. Updating documentation with learnings and best practices

The website now provides an excellent user experience with instant page changes, preserved filter state, and no page refreshes.
