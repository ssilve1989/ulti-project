#!/usr/bin/env node

/**
 * Optional script to remove PNG files from production builds
 * Only use this if you're confident about WebP browser support
 * and have updated the fallback logic accordingly
 */

import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const DIST_ICONS_DIR = './dist/icons';

async function removePngFiles(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await removePngFiles(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
        // Check if corresponding WebP exists
        const webpPath = fullPath.replace(/\.png$/i, '.webp');
        try {
          await stat(webpPath);
          // WebP exists, safe to remove PNG
          await unlink(fullPath);
          console.log(`🗑️  Removed ${fullPath} (WebP version available)`);
        } catch {
          console.log(`⚠️  Kept ${fullPath} (no WebP fallback found)`);
        }
      }
    }
  } catch (error) {
    console.error('Error removing PNG files:', error);
  }
}

// Only run if this script is being executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🧹 Cleaning up PNG files from production build...');
  console.log('⚠️  WARNING: This will remove PNG fallbacks!');

  removePngFiles(DIST_ICONS_DIR)
    .then(() => console.log('✅ PNG cleanup complete!'))
    .catch(console.error);
}

export { removePngFiles };
