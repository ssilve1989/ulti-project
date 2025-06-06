# HANDOFF DOCUMENT - Ulti Project

## Project Overview

Discord bot project for managing FFXIV (Final Fantasy XIV) community signups for ultimate raids. Currently syncs data to Firebase and Google Sheets, with a new Astro.build website being added to replace Google Sheets dependency.

## Current Status: ✅ PHASE 2 COMPLETE - Mock Website Running

### What's Working

- **Astro Website**: Fully functional at `http://localhost:4323`
- **Landing Page**: Complete with community branding, theme toggle, and all sections
- **Signups Page**: Functional with 12 mock signups and filtering
- **Theme System**: Dark/light mode toggle with proper contrast
- **Mock API**: Realistic data structure matching Firebase schema

### Recent Fixes Applied

- ✅ Fixed Layout component issues by removing dependency
- ✅ Implemented self-contained pages with inline CSS
- ✅ Added complete theme toggle system with localStorage persistence
- ✅ Fixed light mode contrast issues (especially warning section)
- ✅ Used proper `.js` extensions for ESM imports

## Technical Architecture

### Current Stack

- **Backend**: NestJS Discord bot with Firebase/Firestore
- **Frontend**: Astro.build with React components
- **Styling**: CSS custom properties (no Tailwind dependency issues)
- **Data**: Mock API currently, ready for real Firebase integration

### File Structure

```
ulti-project/
├── website/                    # Astro website
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index.astro     # Landing page (self-contained)
│   │   │   └── signups.astro   # Signups page (self-contained)
│   │   ├── lib/
│   │   │   ├── types.ts        # TypeScript interfaces
│   │   │   └── mockData.ts     # Mock signup data
│   │   └── api/
│   │       └── signups.ts      # Mock API endpoint
│   └── package.json
├── ASTRO_INTEGRATION_PLAN.md   # Detailed technical plan
└── HANDOFF.md                  # This document
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

- 12 realistic signups focused on "FRU" (Futures Rewritten Ultimate)
- Mix of Prog/Clear party types
- Realistic prog points (P2 Light Rampant, P5 Fulgent Blade 1, etc.)
- Various jobs and availability patterns

## Development Commands

### Running the Website

```bash
cd website
pnpm run dev --host
# Runs on http://localhost:4323 (ports 4321/4322 often in use)
```

### Project Root Commands

```bash
# From ulti-project root - these don't work yet
pnpm dev  # ❌ Command not found (needs workspace setup)
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

1. **No Layout Component**: Removed to avoid Astro import issues, using self-contained pages
2. **CSS Custom Properties**: Chosen over Tailwind for better theme control
3. **Mock-First Approach**: Allows frontend development without backend changes
4. **ESM Imports**: Using `.js` extensions for proper modern JavaScript practices

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

**Last Updated**: Current session - Website fully functional with theme system
**Next Priority**: Phase 3 - Real API integration when ready
**Status**: ✅ Ready for community feedback and Phase 3 planning
