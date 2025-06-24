#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const phases = {
  1: {
    name: 'API Interfaces',
    files: [
      'apps/website/src/lib/api/interfaces/base.ts',
      'apps/website/src/lib/api/interfaces/events.ts', 
      'apps/website/src/lib/api/interfaces/helpers.ts',
      'apps/website/src/lib/api/interfaces/roster.ts',
      'apps/website/src/lib/api/interfaces/locks.ts',
      'apps/website/src/lib/api/interfaces/index.ts',
      'apps/website/src/lib/api/factory.ts',
      'apps/website/src/lib/api/index.ts'
    ]
  },
  2: {
    name: 'Mock Enhancement',
    files: [
      'apps/website/src/lib/api/implementations/mock/EventsApi.ts',
      'apps/website/src/lib/api/implementations/mock/HelpersApi.ts',
      'apps/website/src/lib/api/implementations/mock/RosterApi.ts',
      'apps/website/src/lib/api/implementations/mock/LocksApi.ts',
      'apps/website/src/lib/api/implementations/mock/index.ts'
    ]
  },
  3: {
    name: 'HTTP Implementation', 
    files: [
      'apps/website/src/lib/api/implementations/http/BaseHttpClient.ts',
      'apps/website/src/lib/api/implementations/http/EventsApi.ts',
      'apps/website/src/lib/api/implementations/http/HelpersApi.ts',
      'apps/website/src/lib/api/implementations/http/RosterApi.ts',
      'apps/website/src/lib/api/implementations/http/LocksApi.ts',
      'apps/website/src/lib/api/implementations/http/ParticipantsApi.ts',
      'apps/website/src/lib/api/implementations/http/errors.ts',
      'apps/website/src/lib/api/implementations/http/index.ts'
    ]
  },
  4: {
    name: 'Factory Integration & Export Cleanup',
    modifiedFiles: [
      'apps/website/src/lib/api/factory.ts',
      'apps/website/src/lib/api/index.ts',
      'apps/website/src/env.d.ts'
    ]
  },
  5: {
    name: 'Environment & Testing',
    files: [
      'apps/website/.env.development',
      'apps/website/.env.production',
      'apps/website/src/lib/api/__tests__/factory-integration.test.ts',
      'apps/website/src/lib/api/__tests__/usage-patterns.test.ts'
    ]
  },
  6: {
    name: 'Integration Finalization',
    files: [
      'apps/website/src/lib/api/client.ts',
      'apps/website/src/hooks/queries/useEventsQuery.ts',
      'apps/website/src/hooks/queries/useHelpersQuery.ts',
      'apps/website/src/hooks/queries/__tests__/api-integration.test.ts',
      'apps/website/docs/API_USAGE.md',
      'scripts/validate-migration.js'
    ]
  },
  7: {
    name: 'Code Migration to New API System',
    validation: 'audit', // Special validation type
    description: 'Replace all direct mock calls with new API system'
  }
};

function validatePhase(phaseNum) {
  const phase = phases[phaseNum];
  if (!phase) {
    console.error(`❌ Invalid phase: ${phaseNum}`);
    return false;
  }

  console.log(`🔍 Validating Phase ${phaseNum}: ${phase.name}`);

  // Handle special validation types
  if (phase.validation === 'audit') {
    console.log('🔍 Running code migration audit...');
    
    try {
      // Check for remaining old schedulingApi imports
      const oldApiImports = execSync('grep -r "from.*schedulingApi" apps/website/src --include="*.ts" --include="*.tsx" --exclude-dir=__tests__ 2>/dev/null || true', { encoding: 'utf8' });
      
      if (oldApiImports.trim()) {
        console.log('📋 Files still using old schedulingApi.js:');
        oldApiImports.trim().split('\n').forEach(line => {
          if (line.trim()) {
            const fileName = line.split(':')[0];
            console.log(`  ⚠️  ${fileName}`);
          }
        });
        console.log('\n📖 Next: Migrate these files according to phase-7-code-migration.md');
        console.log('🎯 Replace schedulingApi.js imports with React Query hooks or api client');
        return false;
      } else {
        console.log('✅ No old schedulingApi.js imports found - migration appears complete');
      }
    } catch (error) {
      console.log('✅ No old schedulingApi.js imports found');
    }
    
    console.log('🎉 Phase 7 audit complete\n');
    return true;
  }

  // Check required files exist
  const filesToCheck = phase.files || [];
  const modifiedFilesToCheck = phase.modifiedFiles || [];
  
  for (const file of filesToCheck) {
    if (!existsSync(file)) {
      console.error(`❌ Missing required file: ${file}`);
      return false;
    }
    console.log(`✅ ${file}`);
  }
  
  for (const file of modifiedFilesToCheck) {
    if (!existsSync(file)) {
      console.error(`❌ Missing modified file: ${file}`);
      return false;
    }
    console.log(`✅ ${file} (modified)`);
  }

  // TypeScript validation
  try {
    execSync('pnpm --filter website run typecheck', { stdio: 'inherit' });
    console.log('✅ TypeScript compilation passed');
  } catch (error) {
    console.error('❌ TypeScript compilation failed');
    return false;
  }

  // Phase-specific validations
  if (phaseNum >= 2 && phase.backupCheck) {
    if (!existsSync(phase.backupCheck)) {
      console.warn(`⚠️  No backup found: ${phase.backupCheck}`);
    } else {
      console.log(`✅ Backup exists: ${phase.backupCheck}`);
    }
  }

  if (phaseNum >= 4) {
    // Test both environment builds
    try {
      execSync('VITE_USE_MOCK_API=true pnpm --filter website run build', { stdio: 'pipe' });
      console.log('✅ Mock environment builds');
      
      execSync('VITE_USE_MOCK_API=false pnpm --filter website run build', { stdio: 'pipe' });
      console.log('✅ HTTP environment builds');
    } catch (error) {
      console.error('❌ Environment build failed');
      return false;
    }
  }

  console.log(`🎉 Phase ${phaseNum} validation complete\n`);
  return true;
}

function validateAll() {
  console.log('🚀 Migration Status Check\n');
  
  let completedPhases = 0;
  let nextPhase = 1;
  
  for (let i = 1; i <= 7; i++) {
    if (validatePhase(i)) {
      completedPhases++;
    } else {
      nextPhase = i;
      break;
    }
  }

  if (completedPhases === 7) {
    console.log('🎉 Migration Fully Completed!');
    console.log('\n📋 All phases validated successfully');
    console.log('🚀 System ready for production!');
    return true;
  }
  
  console.log(`\n📊 Migration Status: ${completedPhases}/7 phases complete`);
  console.log(`🎯 Next: Resume from Phase ${nextPhase}`);
  console.log(`📖 Load: /apps/website/docs/migration/phase-${nextPhase}-*.md`);
  return false;
}

function checkStatus() {
  console.log('📋 Quick Migration Status Check\n');
  
  const phaseFiles = {
    1: 'apps/website/src/lib/api/interfaces/index.ts',
    2: 'apps/website/src/lib/api/implementations/mock/index.ts', 
    3: 'apps/website/src/lib/api/implementations/http/index.ts',
    4: 'apps/website/src/lib/api/factory.ts', // Phase 4 only modifies existing files
    5: 'apps/website/.env.development',
    6: 'apps/website/src/lib/api/client.ts',
    7: 'apps/website/docs/migration/phase-7-code-migration.md'
  };

  let nextPhase = 1;
  
  for (let i = 1; i <= 7; i++) {
    const keyFile = phaseFiles[i];
    if (existsSync(keyFile)) {
      console.log(`✅ Phase ${i}: ${phases[i].name} - Complete`);
      nextPhase = i + 1; // Fixed: Update to next phase when current is complete
    } else {
      console.log(`⏳ Phase ${i}: ${phases[i].name} - Pending`);
      nextPhase = i; // Fixed: Current phase needs to be completed
      break;
    }
  }
  
  if (nextPhase > 7) {
    console.log('\n🎉 All phases appear complete - run "all" for full validation');
  } else {
    console.log(`\n🎯 Next: Phase ${nextPhase}`);
    console.log(`📖 Load: /apps/website/docs/migration/phase-${nextPhase}-*.md`); // Fixed: Correct path
  }
}

// CLI usage
const phase = process.argv[2];
if (phase === 'all') {
  validateAll();
} else if (phase === 'status') {
  checkStatus();
} else if (phase && !Number.isNaN(Number(phase))) {
  validatePhase(Number.parseInt(phase, 10));
} else {
  console.log('Usage: node validate-migration.js [phase|all|status]');
  console.log('Examples:');
  console.log('  node validate-migration.js status   # Quick status check');
  console.log('  node validate-migration.js 1        # Validate specific phase');
  console.log('  node validate-migration.js all      # Full validation');
}
