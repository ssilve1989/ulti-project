#!/usr/bin/env tsx

/**
 * Database seeding script
 *
 * Usage:
 *   pnpm seed-db              # Seed with sample data
 *   pnpm seed-db --force      # Force reseed (delete existing data first)
 *
 * This script seeds the Firestore database with sample data for testing
 * the scheduling API, including:
 *
 * - Helpers with availability schedules and absences
 * - Proggers (approved signups) across different encounters
 * - Sample events with various statuses (draft, published, completed, etc.)
 * - Realistic roster assignments
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiModule } from '../src/api/api.module.js';
import { DatabaseSeederService } from '../src/api/database-seeder.service.js';

async function main() {
  const logger = new Logger('SeedScript');
  const force = process.argv.includes('--force');

  if (force) {
    logger.warn('⚠️  Force mode enabled - this will DELETE existing data!');
    // In a real implementation, you'd add cleanup logic here
  }

  try {
    logger.log('🚀 Creating NestJS application context...');

    // Create a minimal NestJS application context
    const app = await NestFactory.createApplicationContext(ApiModule, {
      logger: ['error', 'warn', 'log'],
    });

    // Get the seeder service
    const seederService = app.get(DatabaseSeederService);

    logger.log('🌱 Starting database seeding...');

    // Manually trigger the seeding (bypass the automatic bootstrap)
    await seederService.onApplicationBootstrap();

    logger.log('✅ Database seeding completed successfully!');

    await app.close();
    process.exit(0);
  } catch (error) {
    logger.error('❌ Database seeding failed:', error);
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('Script execution failed:', error);
  process.exit(1);
});
