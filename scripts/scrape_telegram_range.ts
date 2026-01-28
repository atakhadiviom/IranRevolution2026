/* eslint-disable no-console */
import { extractMemorialData } from '../src/modules/ai';
import { submitMemorial, fetchMemorials } from '../src/modules/dataService';
import { extractSocialImage } from '../src/modules/imageExtractor';
import type { MemorialEntry } from '../src/modules/types';

/**
 * Script to scrape a range of Telegram messages from a specific channel.
 * Usage: npx tsx --env-file=.env scripts/scrape_telegram_range.ts <channel> <startId> <endId>
 */

async function scrapeRange() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.log('Usage: npx tsx --env-file=.env scripts/scrape_telegram_range.ts <channel> <startId> <endId>');
    console.log('Example: npx tsx --env-file=.env scripts/scrape_telegram_range.ts RememberTheirNames 1 1580');
    return;
  }

  const channel = args[0];
  const startId = parseInt(args[1]);
  const endId = parseInt(args[2]);

  console.log(`--- Starting Telegram Scrape: @${channel} from ${startId} to ${endId} ---`);

  // Get already existing memorials to avoid duplicates if possible
  const existingMemorials = await fetchMemorials(true);
  const existingUrls = new Set(
    existingMemorials.flatMap(m => {
      const refs = m.references?.map(r => r.url) || [];
      if (m.media?.telegramPost) {
        refs.push(m.media.telegramPost);
      }
      return refs;
    }).filter(Boolean) as string[]
  );

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  let consecutiveEmpty = 0;
  const MAX_CONSECUTIVE_EMPTY = 50;
  const step = startId <= endId ? 1 : -1;

  // Loop that handles both ascending and descending order
  for (let id = startId; (step === 1 ? id <= endId : id >= endId); id += step) {
    const url = `https://t.me/${channel}/${id}`;
    
    if (existingUrls.has(url)) {
      console.log(`Skipping (already in database): ${url}`);
      skipCount++;
      consecutiveEmpty = 0; // Reset counter on found/existing
      continue;
    }

    try {
      console.log(`Processing: ${url}`);
      
      // Extract data using AI
      const victims = await extractMemorialData(url);
      
      if (!victims || victims.length === 0) {
        console.log(`Skipping (no victims found or empty post): ${url}`);
        consecutiveEmpty++;
        if (consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
           console.log(`Reached limit of ${MAX_CONSECUTIVE_EMPTY} consecutive empty posts. Stopping early.`);
           break;
        }
        continue;
      }
      
      // Reset counter if we found victims
      consecutiveEmpty = 0;

      for (const data of victims) {
        if (!data || !data.name || data.name === 'Full Name' || data.name === '') {
          console.log(`Skipping victim (invalid name) in: ${url}`);
          continue;
        }

        // Ensure we have an image
        if (!data.photo) {
          data.photo = await extractSocialImage(url) || '';
        }

        // Prepare memorial entry
        const entry: Partial<MemorialEntry> = {
          ...data,
          verified: false, // Default for new entries; submitMemorial handles existing verification status
          media: {
            ...(data.media || {}),
            photo: data.photo || data.media?.photo || '',
            telegramPost: url // Add the Telegram URL as an embeddable post
          },
          references: [
            ...(data.references || []),
            { label: 'Telegram', url: url }
          ]
        };

        // Submit to database (handles both new entry and merging as reference)
        const result = await submitMemorial(entry);
        
        if (result.success) {
          if (result.merged) {
            console.log(`Match found for "${data.name}". Added Telegram as reference.`);
          } else {
            console.log(`Successfully added new entry (unverified): ${data.name}`);
          }
          successCount++;
        } else {
          if (result.error?.includes('already exist')) {
            console.log(`Reference already exists for ${data.name}.`);
            skipCount++;
          } else {
            console.error(`Failed to submit ${data.name}: ${result.error}`);
            errorCount++;
          }
        }
      }

    } catch (error) {
      const err = error as { message?: string };
      if (err.message === 'ai.error.blocked') {
        console.log(`Skipping (content blocked or empty): ${url}`);
        skipCount++;
      } else {
        console.error(`Error processing ${url}:`, err.message || error);
        errorCount++;
      }
    }
    
    // Small delay to be respectful and avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('--- Scrape Finished ---');
  console.log(`Added/Merged: ${successCount}`);
  console.log(`Skipped: ${skipCount}`);
  console.log(`Errors: ${errorCount}`);
}

scrapeRange().catch(console.error);
