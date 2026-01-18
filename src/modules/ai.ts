import type { MemorialEntry } from './types';

const OPENROUTER_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_OPENROUTER_API_KEY : process.env.VITE_OPENROUTER_API_KEY;
const OPENROUTER_MODEL = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env.VITE_OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free') : (process.env.VITE_OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free');

export interface ExtractedMemorialData extends Partial<MemorialEntry> {
  referenceLabel?: string;
  photo?: string; // Sometimes returned as photo directly
}

export async function extractMemorialData(url: string): Promise<ExtractedMemorialData[]> {
  try {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'sk-or-v1-...') {
      throw new Error('Invalid OpenRouter API Key. Please update your .env file with a real key from openrouter.ai.');
    }

    // Step 1: Fetch URL content as Markdown using Jina Reader API
    const readerUrl = `https://r.jina.ai/${url}`;
    
    const response = await fetch(readerUrl, {
      headers: {
        'X-No-Cache': 'true'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to read the source URL. Jina said: ${response.statusText}`);
    }
    
    let content = await response.text();

    // Truncate content to avoid token limits
    if (content.length > 8000) {
      content = content.substring(0, 8000) + "...";
    }

    // Step 2: Use OpenRouter AI to parse the content
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': (typeof window !== 'undefined') ? window.location.origin : 'https://iranrevolution2026.github.io',
          'X-Title': 'Iran Revolution Memorial'
        },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert data extractor for a human rights memorial website. 
            Extract information about ALL victims of the Iranian revolution mentioned in the provided text.
            If multiple people are mentioned as killed or arrested, extract each one as a separate object in an array.
            
            ETHICAL DATA HANDLING RULES (See CARE_PROTOCOL.md):
            1. DO NOT invent or infer missing names, dates, or causes of death.
            2. If information is uncertain, leave it empty or mark it as uncertain.
            3. Prioritize safety and redaction: avoid extracting home addresses or identifiable info about living relatives.
            4. Treat social media sources as potentially unverified.

            BILINGUAL RULES:
            1. The "name", "city", "location", and "bio" fields MUST be in English. If the source text is in Persian, translate these to English.
            2. The "name_fa", "city_fa", "location_fa", and "bio_fa" fields MUST be in Persian (Farsi). If the source text is in English, translate these to Persian.
            3. Ensure names are spelled correctly in both languages.
            
            Return ONLY a valid JSON array of objects with the following fields:
            - name: Full Name (in English)
            - name_fa: Full Name (in Persian)
            - city: City name (in English)
            - city_fa: City name (in Persian)
            - date: YYYY-MM-DD format
            - location: Specific location or neighborhood (in English)
            - location_fa: Specific location or neighborhood (in Persian)
            - bio: Brief biography (max 200 characters, in English)
            - bio_fa: Brief biography (max 200 characters, in Persian)
            - photo: The URL of the main image attached to the post or specifically for this victim
            - referenceLabel: Source name (e.g. BBC, X Post, IHRDC, Hengaw)
            - coords: { "lat": number, "lon": number } (Most accurate coordinates for the location and city)

            If a field is missing, use an empty string. If coords are unknown, use default Tehran center { "lat": 35.6892, "lon": 51.3890 }.
            Do not include any other text or markdown code blocks. Return ONLY the JSON array.`
          },
          {
            role: 'user',
            content: `Extract data for all victims from this source: ${content}`
          }
        ],
        temperature: 0.1 // Keep it deterministic
      })
    });

    if (!aiResponse.ok) {
      const aiErr = await aiResponse.json().catch(() => ({ error: { message: aiResponse.statusText } }));
      const msg = aiErr.error?.message || aiResponse.statusText;
      
      if (msg.includes('cookie') || aiResponse.status === 401) {
        throw new Error(`AI Auth Error: The selected model is currently unavailable or your API key is invalid. Please try again or check your OpenRouter dashboard.`);
      }
      
      throw new Error(`AI Service Error: ${msg}`);
    }

    const data = await aiResponse.json();
    
    const resultText = data.choices[0].message.content.trim();
    
    try {
      // Robust JSON parsing (strip markdown if model ignores instructions)
      const cleanJson = resultText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (parseError) {
      throw new Error('The AI returned an invalid format. Please try again.');
    }
  } catch (error) {
    console.error('AI Extraction Error Detail:', error);
    throw error;
  }
}

/**
 * Fixes translations for memorial data.
 * It ensures English fields are in English and Persian fields are in Persian.
 */
export async function translateMemorialData(data: { name: string; city: string; location: string; bio: string; name_fa?: string; city_fa?: string; location_fa?: string; bio_fa?: string }) {
  try {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'sk-or-v1-...') {
      throw new Error('Invalid OpenRouter API Key.');
    }

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Iran Revolution Memorial'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert bilingual translator for an Iranian human rights memorial.
            Your task is to ensure all data is correctly available in both English and Persian (Farsi).
            
            RULES:
            1. Fields ending in "_fa" MUST be in Persian (Farsi).
            2. Fields NOT ending in "_fa" MUST be in English.
            3. If a field is provided in the wrong language, translate it to the correct one.
            4. If a field is missing, generate the translation from its counterpart (e.g., if name_fa is missing, translate name to Persian).
            5. Maintain a respectful, memorial-appropriate tone.
            
            Return ONLY a valid JSON object with these fields:
            - name: English name
            - name_fa: Persian name
            - city: English city
            - city_fa: Persian city
            - location: English location
            - location_fa: Persian location
            - bio: English bio
            - bio_fa: Persian bio

            Do not include any other text or markdown code blocks.`
          },
          {
            role: 'user',
            content: `Fix and complete the translations for this data: ${JSON.stringify(data)}`
          }
        ],
        temperature: 0.1
      })
    });

    if (!aiResponse.ok) throw new Error('AI Translation Service Error');

    const result = await aiResponse.json();
    const resultText = result.choices[0].message.content.trim();
    const cleanJson = resultText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error('AI Translation Error:', error);
    return null;
  }
}

/**
 * Geocodes a location name using AI.
 * Returns { lat, lon } or null.
 */
export async function geocodeLocation(city: string, location: string) {
  try {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'sk-or-v1-...') {
      throw new Error('Invalid OpenRouter API Key.');
    }

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Iran Revolution Memorial'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert geocoding assistant for Iran.
            Given a city name and a specific location/neighborhood in Iran, find the most accurate Latitude and Longitude.
            
            Return ONLY a valid JSON object:
            {
              "lat": number,
              "lon": number
            }

            If you cannot find the exact location, return the coordinates for the center of the city.
            Do not include any other text or markdown code blocks.`
          },
          {
            role: 'user',
            content: `Find coordinates for: ${location}, ${city}, Iran`
          }
        ],
        temperature: 0.1
      })
    });

    if (!aiResponse.ok) throw new Error('AI Geocoding Service Error');

    const result = await aiResponse.json();
    const resultText = result.choices[0].message.content.trim();
    const cleanJson = resultText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson) as { lat: number; lon: number };
  } catch (error) {
    console.error('AI Geocoding Error:', error);
    return null;
  }
}

/**
 * Reverse geocodes coordinates to a location name using AI.
 * Returns { location, city } or null.
 */
export async function reverseGeocode(lat: number, lon: number) {
  try {
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'sk-or-v1-...') {
      throw new Error('Invalid OpenRouter API Key.');
    }

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Iran Revolution Memorial'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert reverse geocoding assistant for Iran.
            Given Latitude and Longitude coordinates, identify the specific neighborhood/location and city in Iran.
            
            Return ONLY a valid JSON object:
            {
              "location": "neighborhood or street name",
              "city": "city name"
            }

            Do not include any other text or markdown code blocks.`
          },
          {
            role: 'user',
            content: `What is the location for coordinates: ${lat}, ${lon}?`
          }
        ],
        temperature: 0.1
      })
    });

    if (!aiResponse.ok) throw new Error('AI Reverse Geocoding Service Error');

    const result = await aiResponse.json();
    const resultText = result.choices[0].message.content.trim();
    const cleanJson = resultText.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson) as { location: string; city: string };
  } catch (error) {
    console.error('AI Reverse Geocoding Error:', error);
    return null;
  }
}
