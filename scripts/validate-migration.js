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
      'apps/website/src/lib/api/factory.ts',
      'apps/website/src/lib/api/interfaces/index.ts'
    ]
  },
  2: {
    name: 'Mock Enhancement',
    files: [
      'apps/website/src/lib/api/implementations/mock/index.ts'
    ],
    backupCheck: 'apps/website/src/lib/mock/events.ts.backup'
  },
  3: {
    name: 'HTTP Implementation', 
    files: [
      'apps/website/src/lib/api/implementations/http/index.ts'
    ]
  },
  4: {
    name: 'Client Integration',
    files: [
      'apps/website/src/lib/api/client.ts'
    ]
  },
  5: {
    name: 'Environment & Testing',
    files: [
      'apps/website/.env.development',
      'apps/website/src/lib/api/__tests__/integration.test.ts'
    ]
  },
  6: {
    name: 'Finalization',
    files: [
      'scripts/migration-complete.js'
    ]
  }
};

function validatePhase(phaseNum) {
  const phase = phases[phaseNum];
  if (!phase) {
    console.error(`❌ Invalid phase: ${phaseNum}`);
    return false;
  }

  console.log(`🔍 Validating Phase ${phaseNum}: ${phase.name}`);

  // Check required files exist
  for (const file of phase.files) {
    if (!existsSync(file)) {
      console.error(`❌ Missing required file: ${file}`);
      return false;
    }
    console.log(`✅ ${file}`);
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
  
  for (let i = 1; i <= 6; i++) {
    if (validatePhase(i)) {
      completedPhases++;
    } else {
      nextPhase = i;
      break;
    }
  }

  if (completedPhases === 6) {
    console.log('🎉 Migration Fully Completed!');
    console.log('\n📋 All phases validated successfully');
    console.log('🚀 System ready for production!');
    return true;
  } else {
    console.log(`\n📊 Migration Status: ${completedPhases}/6 phases complete`);
    console.log(`🎯 Next: Resume from Phase ${nextPhase}`);
    console.log(`� Load: /docs/migration/phase-${nextPhase}-*.md`);
    return false;
  }
}

function checkStatus() {
  console.log('📋 Quick Migration Status Check\n');
  
  const phaseFiles = {
    1: 'apps/website/src/lib/api/interfaces/index.ts',
    2: 'apps/website/src/lib/api/implementations/mock/index.ts', 
    3: 'apps/website/src/lib/api/implementations/http/index.ts',
    4: 'apps/website/src/lib/api/client.ts',
    5: 'apps/website/.env.development',
    6: 'scripts/migration-complete.js'
  };

  let nextPhase = 1;
  
  for (let i = 1; i <= 6; i++) {
    const keyFile = phaseFiles[i];
    if (existsSync(keyFile)) {
      console.log(`✅ Phase ${i}: ${phases[i].name} - Complete`);
    } else {
      console.log(`⏳ Phase ${i}: ${phases[i].name} - Pending`);
      if (nextPhase === i) nextPhase = i;
      break;
    }
  }
  
  if (nextPhase > 6) {
    console.log('\n🎉 All phases appear complete - run "all" for full validation');
  } else {
    console.log(`\n🎯 Next: Phase ${nextPhase}`);
    console.log(`📖 Load: /docs/migration/phase-${nextPhase}-*.md`);
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
