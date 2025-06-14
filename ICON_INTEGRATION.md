# FFXIV Icon Integration

## Overview

The Ulti Project website now uses authentic FFXIV job and role icons throughout the roster management interface. This replaces the previous emoji-based system with high-quality game assets.

## Implementation

### Static Asset Structure

Icons are located in `/apps/website/public/icons/` with the following structure:

```
/public/icons/
├── 00_ROLE/
│   ├── TankRole.png
│   ├── HealerRole.png
│   └── DPSRole.png
├── 01_TANK/Job/
│   ├── Paladin.png
│   ├── Warrior.png
│   ├── DarkKnight.png
│   └── Gunbreaker.png
├── 02_HEALER/Job/
│   ├── WhiteMage.png
│   ├── Scholar.png
│   ├── Astrologian.png
│   └── Sage.png
└── 03_DPS/Job/
    ├── Monk.png
    ├── Dragoon.png
    ├── Ninja.png
    ├── Samurai.png
    ├── Reaper.png
    ├── Bard.png
    ├── Machinist.png
    ├── Dancer.png
    ├── BlackMage.png
    ├── Summoner.png
    ├── RedMage.png
    ├── Pictomancer.png
    └── Viper.png
```

### Utility Module

Created `/apps/website/src/lib/utils/iconUtils.ts` which provides:

- `getRoleIconPath(role: Role): string` - Returns path to role icons
- `getJobIconPath(job: Job): string` - Returns path to job icons with fallback to role icons
- `getJobRole(job: Job): Role` - Maps jobs to their roles

### Component Updates

#### RosterBuilder Component

- **Empty Slots**: Display appropriate role icon (Tank/Healer/DPS)
- **Filled Slots**: Display job icon alongside participant information
- **Job Selection Modal**: Show job icons when selecting from multiple available jobs
- **Fallback Support**: Gracefully falls back to emoji if image fails to load

#### ParticipantPool Component

- **Progger Cards**: Show job icon next to job name
- **Helper Cards**: Show job icons for each available job (up to 3 displayed)
- **Compact Display**: Icons are sized appropriately for the card layout

## Features

### Role Icons for Empty Slots

Empty roster slots display the appropriate role icon to clearly indicate what type of player is needed:

- Tank slots show the tank role icon
- Healer slots show the healer role icon  
- DPS slots show the DPS role icon

### Job Icons for Filled Slots

When a participant is assigned to a slot, their specific job icon is displayed alongside their name, making it easy to see the party composition at a glance.

### Job Selection Enhancement

The job selection modal now shows icons for each available job, making it easier for team leaders to quickly identify and select the desired job.

### Participant Pool Enhancement

The participant pool shows job icons for both proggers and helpers, making it easier to identify available players and their capabilities.

### Error Handling

All icon displays include proper error handling:

- Failed image loads are gracefully hidden
- Fallback role icons are used when specific job icons aren't available
- Console warnings are logged for missing icon mappings

## Technical Details

### Build Integration

- Icons are automatically copied to the build output during `pnpm build`
- No additional build configuration required
- Icons are served as static assets from `/icons/` path

### Performance Considerations

- Icons are small PNG files optimized for web use
- Lazy loading through browser's native image loading
- No JavaScript bundle size impact (static assets)

### Browser Compatibility

- Uses standard HTML `<img>` elements
- Fallback system ensures functionality even if icons fail to load
- Accessible with proper `alt` attributes

## Usage Examples

```tsx
// Get role icon path
const tankIconPath = getRoleIconPath(Role.Tank);

// Get job icon path
const paladinIconPath = getJobIconPath('Paladin');

// Display role icon
<img src={getRoleIconPath(slot.role)} alt={`${slot.role} role`} className="w-5 h-5" />

// Display job icon
<img src={getJobIconPath(participant.job)} alt={`${participant.job} job`} className="w-6 h-6" />
```

## Benefits

1. **Visual Clarity**: Icons provide immediate visual recognition of roles and jobs
2. **Professional Appearance**: Uses authentic game assets for a polished look
3. **User Experience**: Faster recognition compared to text-only displays
4. **Accessibility**: Includes proper alt text for screen readers
5. **Maintainable**: Centralized utility functions for consistent usage
6. **Extensible**: Easy to add new jobs or modify existing mappings

## Future Enhancements

- Consider adding class icons (beyond jobs)
- Implement icon preloading for better performance
- Add hover tooltips with job descriptions
- Consider dark mode variants of icons
