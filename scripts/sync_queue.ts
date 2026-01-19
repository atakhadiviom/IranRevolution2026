#!/usr/bin/env node
/**
 * Sync script to copy URLs from localStorage to the queue file
 * 
 * This script reads URLs from a localStorage export or manual input
 * and adds them to public/data/url_queue.json
 * 
 * Usage:
 *   1. Open browser console and run: JSON.parse(localStorage.getItem('url_queue') || '[]')
 *   2. Copy the array of URLs
 *   3. Run this script with the URLs as input, or
 *   4. Or manually edit public/data/url_queue.json
 */

import * as fs from 'fs';
import * as path from 'path';

const queueFile = path.join(process.cwd(), 'public', 'data', 'url_queue.json');

// Get URLs from command line arguments or stdin
const args = process.argv.slice(2);

let urlsToAdd: string[] = [];

if (args.length > 0) {
  // Try to parse as JSON array
  try {
    urlsToAdd = JSON.parse(args.join(' '));
  } catch {
    // If not JSON, treat each argument as a URL
    urlsToAdd = args;
  }
} else {
  console.log('Usage: npm run sync-queue [url1] [url2] ...');
  console.log('   Or: npm run sync-queue \'["url1", "url2"]\'');
  console.log('\nTo get URLs from localStorage, run in browser console:');
  console.log('  JSON.parse(localStorage.getItem("url_queue") || "[]")');
  process.exit(1);
}

// Read existing URLs from file
let existingUrls: string[] = [];
try {
  if (fs.existsSync(queueFile)) {
    const content = fs.readFileSync(queueFile, 'utf-8');
    existingUrls = JSON.parse(content);
  }
} catch (error) {
  console.error('Error reading queue file:', error);
  process.exit(1);
}

// Merge URLs (avoid duplicates)
const allUrls = [...existingUrls];
let addedCount = 0;

for (const url of urlsToAdd) {
  if (typeof url === 'string' && url.trim() && !allUrls.includes(url)) {
    allUrls.push(url);
    addedCount++;
  }
}

// Write back to file
try {
  fs.writeFileSync(queueFile, JSON.stringify(allUrls, null, 2));
  console.log(`✅ Successfully synced ${addedCount} new URL(s) to queue file.`);
  console.log(`📄 Total URLs in queue: ${allUrls.length}`);
  console.log(`📁 File: ${queueFile}`);
} catch (error) {
  console.error('❌ Error writing queue file:', error);
  process.exit(1);
}

