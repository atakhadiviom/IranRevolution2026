const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const OPENROUTER_MODEL = import.meta.env.VITE_OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';

export async function extractMemorialData(url: string) {
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
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Iran Revolution Memorial'
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert data extractor for a human rights memorial website. 
            Extract information about a victim of the Iranian revolution from the provided text.
            
            Return ONLY a valid JSON object with the following fields:
            - name: Full Name
            - city: City name
            - date: YYYY-MM-DD format
            - location: Specific location or neighborhood
            - bio: Brief biography (max 200 characters)
            - photo: The URL of the main image attached to the post (look for pbs.twimg.com/media/ URLs)
            - referenceLabel: Source name (e.g. BBC, X Post, IHRDC)

            If a field is missing, use an empty string. Do not include any other text or markdown code blocks.`
          },
          {
            role: 'user',
            content: `Extract data from this source: ${content}`
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
      return JSON.parse(cleanJson);
    } catch (parseError) {
      throw new Error('The AI returned an invalid format. Please try again.');
    }
  } catch (error) {
    console.error('AI Extraction Error Detail:', error);
    throw error;
  }
}
