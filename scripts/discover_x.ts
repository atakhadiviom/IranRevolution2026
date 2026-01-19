
/* eslint-disable no-console */
import { extractMemorialData } from '../src/modules/ai';
import { submitMemorial, fetchMemorials } from '../src/modules/dataService';
import { extractXPostImage } from '../src/modules/imageExtractor';
import type { MemorialEntry } from '../src/modules/types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Script to automatically discover potential memorial posts on X (Twitter)
 * and add them to the Supabase database for review.
 */

const HISTORY_FILE = path.join(process.cwd(), 'scripts', 'discovery_history.json');

function loadHistory(): Set<string> {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return new Set(JSON.parse(data));
    }
  } catch (error) {
    console.error('Error loading history:', error);
  }
  return new Set();
}

function saveHistory(history: Set<string>) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([...history], null, 2));
  } catch (error) {
    console.error('Error saving history:', error);
  }
}

const TARGETS = [
  'https://x.com/maroofian_n',
  'https://hengaw.net/fa/news/2026/01/article-138-1',
  'https://x.com/IranRights_org',
  'https://x.com/indypersian',
  'https://x.com/IranIntl_En',
  'https://x.com/HyrcaniHRM',
  'https://x.com/allahbakhshii',
  'https://x.com/Tavaana',
  'https://x.com/HoHossein',
  'https://x.com/LoabatK',
  'https://x.com/isamanyasin',
  'https://x.com/longlosthills',
  'https://x.com/iranwire',
  'https://x.com/HengawO',
  'https://x.com/1500tasvir',
  'https://x.com/AmnestyIran',
  'https://x.com/ICHRI',
  'https://x.com/FSeifikaran',
  'https://x.com/dadban4',
  'https://x.com/allahbakhshii',
  'https://x.com/Daikatuo',
  'https://x.com/pouriazeraati',
  'https://x.com/search?q=%D8%AC%D8%A7%D9%86%D8%A8%D8%A7%D8%AE%D8%AA%D9%87%20%D8%A7%DB%8C%D8%B1%D8%A7%D9%86&f=live', // "جانباخته ایران" (Died Iran)
  'https://x.com/search?q=%DA%A9%D8%B4%D8%AA%D9%87%20%D8%B4%D8%AF&f=live', // "کشته شد" (Was killed)
];

async function getXStatusUrls(targetUrl: string): Promise<string[]> {
  try {
    console.log(`Searching target: ${targetUrl}`);
    const readerUrl = `https://r.jina.ai/${targetUrl}`;
    const response = await fetch(readerUrl, {
      headers: { 'X-No-Cache': 'true' }
    });

    if (!response.ok) {
      console.error(`Failed to fetch ${targetUrl}: ${response.statusText}`);
      return [];
    }

    const content = await response.text();
    // Regex for X/Twitter status URLs
    const statusRegex = /https:\/\/(x|twitter)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/g;
    const matches = content.match(statusRegex) || [];
    
    // De-duplicate and normalize to x.com
    return [...new Set(matches.map(url => url.replace('twitter.com', 'x.com')))];
  } catch (error) {
    console.error(`Error searching ${targetUrl}:`, error);
    return [];
  }
}

async function runDiscovery() {
  console.log('--- Starting X Discovery Process ---');
  
  // 1. Load history of processed URLs
  const history = loadHistory();
  console.log(`Loaded ${history.size} previously processed URLs.`);

  // 2. Get already existing memorials to avoid duplicates
  const existingMemorials = await fetchMemorials(true);
  const existingUrls = new Set(
    existingMemorials.flatMap(m => [
      m.media?.xPost,
      ...(m.references?.map(r => r.url) || [])
    ]).filter(Boolean) as string[]
  );

  console.log(`Found ${existingMemorials.length} existing entries in database.`);

  // 3. Collect status URLs from all targets
  const allUrls = new Set<string>();
  for (const target of TARGETS) {
    // Check if the target ITSELF is a direct article link (not a search/profile page)
    if (target.includes('/status/') || target.includes('/news/') || target.includes('/article/')) {
      if (!existingUrls.has(target) && !history.has(target)) {
        allUrls.add(target);
      }
      continue;
    }

    const urls = await getXStatusUrls(target);
    urls.forEach(url => {
      if (!existingUrls.has(url) && !history.has(url)) {
        allUrls.add(url);
      }
    });
  }

  console.log(`Found ${allUrls.size} new potential status URLs.`);

  // 4. Process each new URL
  let successCount = 0;
  let skipCount = 0;

  for (const url of allUrls) {
    // Mark as processed in history
    history.add(url);

    try {
      console.log(`Processing: ${url}`);
      
      // Extract data using AI (now returns an array of victims)
      const victims = await extractMemorialData(url);
      
      if (!victims || victims.length === 0) {
        console.log(`Skipping (no victims found): ${url}`);
        skipCount++;
        continue;
      }

      for (const data of victims) {
        if (!data || !data.name || data.name === 'Full Name' || data.name === '') {
          console.log(`Skipping victim (invalid name) in: ${url}`);
          continue;
        }

        // Ensure we have an image
        if (!data.photo) {
          data.photo = await extractXPostImage(url) || '';
        }

        // Prepare memorial entry
        const isXUrl = url.includes('x.com') || url.includes('twitter.com');
        const entry: Partial<MemorialEntry> = {
          ...data,
          verified: false, // New entries from discovery are always unverified
          media: {
            xPost: isXUrl ? url : undefined,
            photo: data.photo
          },
          references: [
            { label: data.referenceLabel || (isXUrl ? 'X Post' : 'Reference'), url: url }
          ]
        };

        // Submit to database
        const result = await submitMemorial(entry);
        
        if (result.success) {
          console.log(`Successfully added/merged: ${data.name}`);
          successCount++;
        } else {
          console.error(`Failed to submit ${data.name}: ${result.error}`);
        }
      }

    } catch (error) {
      console.error(`Error processing ${url}:`, error);
    }
    
    // Add a small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Save history for next run
  saveHistory(history);

  console.log('--- Discovery Finished ---');
  console.log(`Added/Merged: ${successCount}`);
  console.log(`Skipped: ${skipCount}`);
}

// Check if run directly
runDiscovery().catch(console.error);
