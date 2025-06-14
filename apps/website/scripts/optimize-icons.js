#!/usr/bin/env node

import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceDir = join(__dirname, '../public/icons');
const outputDir = join(__dirname, '../dist/icons');

async function ensureDir(dir) {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

async function convertIconsToWebP(sourceDir, outputDir) {
  try {
    const entries = await readdir(sourceDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry.name);
      const outputPath = join(outputDir, entry.name);
      
      if (entry.isDirectory()) {
        await ensureDir(outputPath);
        await convertIconsToWebP(sourcePath, outputPath);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.png') {
        // Copy original PNG
        await copyFile(sourcePath, outputPath);
        
        // Create WebP version in output directory
        const webpPath = join(dirname(outputPath), `${basename(entry.name, '.png')}.webp`);
        
        // Also create WebP version in source directory for runtime use
        const webpSourcePath = join(dirname(sourcePath), `${basename(entry.name, '.png')}.webp`);
        
        await sharp(sourcePath)
          .webp({ 
            quality: 85,
            lossless: false,
            effort: 6 
          })
          .toFile(webpPath);
        
        await sharp(sourcePath)
          .webp({ 
            quality: 85,
            lossless: false,
            effort: 6 
          })
          .toFile(webpSourcePath);
          
        console.log(`✓ Converted ${entry.name} to WebP`);
      } else {
        // Copy other files as-is
        await copyFile(sourcePath, outputPath);
      }
    }
  } catch (error) {
    console.error('Error converting icons:', error);
  }
}

// Only run if this script is being executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🎨 Optimizing FFXIV icons...');
  
  ensureDir(outputDir)
    .then(() => convertIconsToWebP(sourceDir, outputDir))
    .then(() => console.log('✅ Icon optimization complete!'))
    .catch(console.error);
}

export { convertIconsToWebP, ensureDir };
