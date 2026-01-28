const OPENROUTER_API_KEY = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env.VITE_OPENROUTER_API_KEY : process.env.VITE_OPENROUTER_API_KEY;
const OPENROUTER_MODEL = (typeof import.meta !== 'undefined' && import.meta.env) ? (import.meta.env.VITE_OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free') : (process.env.VITE_OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free');

/**
 * Extracts the primary image URL from an Instagram post using Jina Reader and OpenRouter.
 */
export async function extractInstagramImage(url: string): Promise<string | null> {
  if (!url || !url.includes('instagram.com')) {
    return null;
  }

  try {
    // Optimization: Use /embed/captioned/ for Instagram to bypass login walls
    const cleanUrl = url.split('?')[0].replace(/\/$/, '');
    const targetUrl = `${cleanUrl}/embed/captioned/`;
    const readerUrl = `https://r.jina.ai/${targetUrl}`;
    
    const response = await fetch(readerUrl, {
      headers: {
        'X-No-Cache': 'true',
        'X-With-Images-Summary': 'true',
        'Accept': 'text/plain'
      }
    });

    if (!response.ok) return null;
    const content = await response.text();
    
    if (!content || content.length < 100 || content.includes('Login • Instagram')) {
      // Fallback: simple regex to find the first image that isn't a profile pic if possible
      const imgRegex = /!\[.*?\]\((https:\/\/[^)]*?)\)/g;
      const matches = [...content.matchAll(imgRegex)];
      for (const match of matches) {
        const imgUrl = match[1];
        if (!imgUrl.includes('profile_pic') && !imgUrl.includes('icon') && !imgUrl.includes('logo')) {
          return imgUrl;
        }
      }
      return null;
    }

    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'sk-or-v1-...') {
      return null;
    }

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
            content: `You are an expert at identifying the main media content from an Instagram post.
            Given the markdown content of an Instagram post, find the URL of the primary image or video thumbnail.
            Ignore profile pictures, icons, or UI elements.
            
            Return ONLY the direct URL of the image. If no image is found, return "NONE".`
          },
          {
            role: 'user',
            content: `Find the main image URL in this content: ${content.substring(0, 5000)}`
          }
        ],
        temperature: 0.1
      })
    });

    if (!aiResponse.ok) return null;

    const data = await aiResponse.json();
    const result = data.choices[0].message.content.trim();

    return (result === 'NONE' || !result.startsWith('http')) ? null : result;
  } catch (error) {
    return null;
  }
}

/**
 * Extracts the primary image URL from a social media post (X, Instagram, or Telegram).
 */
export async function extractSocialImage(url: string): Promise<string | null> {
  if (url.includes('x.com') || url.includes('twitter.com')) {
    return extractXPostImage(url);
  } else if (url.includes('instagram.com')) {
    return extractInstagramImage(url);
  } else if (url.includes('t.me/')) {
    return extractTelegramImage(url);
  }
  return null;
}

/**
 * Extracts the primary image URL from a Telegram post using Jina Reader.
 */
export async function extractTelegramImage(url: string): Promise<string | null> {
  if (!url || !url.includes('t.me/')) {
    return null;
  }

  try {
    const readerUrl = `https://r.jina.ai/${url}`;
    
    const response = await fetch(readerUrl, {
      headers: {
        'X-No-Cache': 'true',
        'X-With-Images-Summary': 'true',
        'Accept': 'text/plain'
      }
    });

    if (!response.ok) return null;
    const content = await response.text();
    
    // Telegram images in Jina Reader usually appear in markdown as ![image](url)
    // We want the first one that looks like a post image
    const imgRegex = /!\[.*?\]\((https:\/\/cdn[0-9]\.cdn-telegram\.org\/[^)]*?)\)/g;
    const matches = [...content.matchAll(imgRegex)];
    if (matches.length > 0) {
      return matches[0][1];
    }

    // Fallback: any image that isn't a UI element
    const genericImgRegex = /!\[.*?\]\((https:\/\/[^)]*?)\)/g;
    const genericMatches = [...content.matchAll(genericImgRegex)];
    for (const match of genericMatches) {
      const imgUrl = match[1];
      if (!imgUrl.includes('logo') && !imgUrl.includes('icon') && !imgUrl.includes('avatar')) {
        return imgUrl;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Extracts the primary image URL from an X (Twitter) post using Jina Reader and OpenRouter.
 */
export async function extractXPostImage(url: string): Promise<string | null> {
  if (!url || (!url.includes('x.com') && !url.includes('twitter.com'))) {
    return null;
  }

  try {
    // Step 1: Fetch URL content as Markdown using Jina Reader API
    const readerUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(readerUrl, {
      headers: {
        'X-No-Cache': 'true',
        'X-With-Images-Summary': 'true',
        'Accept': 'text/plain'
      }
    });

    if (!response.ok) {
      return null;
    }

    const content = await response.text();
    
    if (!content || content.length < 100) {
      return null;
    }

    // Step 2: Use OpenRouter to identify the main image of the post (not the profile picture)
    // We want the image that likely represents the person or the event.
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'sk-or-v1-...') {
      // Fallback: simple regex to find the first image that isn't a profile pic if possible
      const imgRegex = /!\[.*?\]\((https:\/\/pbs\.twimg\.com\/media\/.*?)\)/g;
      const matches = [...content.matchAll(imgRegex)];
      if (matches.length > 0) {
        // Return the first media image
        return matches[0][1];
      }
      return null;
    }

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
            content: `You are an expert at identifying the main media content from a social media post.
            Given the markdown content of an X (Twitter) post, find the URL of the primary image attached to the post.
            Ignore profile pictures, icons, or UI elements. Look for images in the "media" or "pbs.twimg.com/media/" category.
            
            Return ONLY the direct URL of the image. If no image is found, return "NONE".`
          },
          {
            role: 'user',
            content: `Find the main image URL in this content: ${content.substring(0, 5000)}`
          }
        ],
        temperature: 0.1
      })
    });

    if (!aiResponse.ok) return null;

    const data = await aiResponse.json();
    const result = data.choices[0].message.content.trim();

    if (result === 'NONE' || !result.startsWith('http')) {
      // Fallback to regex if AI fails or returns nothing
      const imgRegex = /!\[.*?\]\((https:\/\/pbs\.twimg\.com\/media\/.*?)\)/;
      const match = content.match(imgRegex);
      return match ? match[1] : null;
    }

    return result;
  } catch (error) {
    return null;
  }
}
