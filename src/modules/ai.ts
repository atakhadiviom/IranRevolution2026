const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;
const MODEL = 'xiaomi/mimo-v2-flash:free';

export async function extractMemorialData(url: string) {
  try {
    if (!OPENROUTER_API_KEY) {
      console.error('Missing VITE_OPENROUTER_API_KEY in environment variables.');
      throw new Error('API Key missing. Please check your .env file and restart the server.');
    }

    // Step 1: Fetch URL content as Markdown using Jina Reader API
    const readerUrl = `https://r.jina.ai/${url}`;
    console.log(`Fetching content from Jina: ${readerUrl}`);
    
    const response = await fetch(readerUrl, {
      headers: {
        'X-No-Cache': 'true'
      }
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`Jina Reader failed (${response.status}):`, errText);
      throw new Error(`Failed to read the source URL. Jina said: ${response.statusText}`);
    }
    
    let content = await response.text();
    console.log(`Successfully fetched ${content.length} characters from source.`);

    // Truncate content to avoid token limits
    if (content.length > 8000) {
      content = content.substring(0, 8000) + "...";
    }

    // Step 2: Use OpenRouter AI to parse the content
    console.log(`Sending request to OpenRouter using model: ${MODEL}`);
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Iran Revolution Memorial'
      },
      body: JSON.stringify({
        model: MODEL,
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
      console.error('OpenRouter API Error:', aiErr);
      throw new Error(`AI Service Error: ${aiErr.error?.message || aiResponse.statusText}`);
    }

    const data = await aiResponse.json();
    console.log('OpenRouter Response:', data);
    
    const resultText = data.choices[0].message.content.trim();
    
    try {
      // Robust JSON parsing (strip markdown if model ignores instructions)
      const cleanJson = resultText.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', resultText);
      throw new Error('The AI returned an invalid format. Please try again.');
    }
  } catch (error) {
    console.error('AI Extraction Error Detail:', error);
    throw error;
  }
}
