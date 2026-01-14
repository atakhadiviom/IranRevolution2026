const OPENROUTER_API_KEY = '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';
const MODEL = 'xiaomi/mimo-v2-flash:free';

export async function extractMemorialData(url: string) {
  try {
    // Step 1: Fetch URL content as Markdown using Jina Reader API
    // Adding X-No-Cache to get fresh content and handling potential Jina limits
    const readerUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(readerUrl, {
      headers: {
        'Accept': 'text/event-stream', // Some readers prefer this for cleaner output
        'X-No-Cache': 'true'
      }
    });
    
    if (!response.ok) throw new Error(`Jina Reader failed: ${response.statusText}`);
    let content = await response.text();

    // Truncate content to avoid token limits on free models (approx 4000 chars)
    if (content.length > 10000) {
      content = content.substring(0, 10000) + "... [truncated]";
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
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert data extractor for a human rights memorial website. 
            Extract information about a victim of the Iranian revolution from the provided text.
            
            CRITICAL INSTRUCTIONS:
            - Return ONLY a valid JSON object.
            - No markdown formatting (no \`\`\`json blocks).
            - No conversational text before or after the JSON.
            - Use the exact schema below.
            
            SCHEMA:
            {
              "name": "Full Name",
              "city": "City name",
              "date": "YYYY-MM-DD",
              "location": "Specific location or neighborhood",
              "bio": "Brief biography (max 200 characters)",
              "referenceLabel": "Source name (e.g. BBC, X Post, IHRDC)"
            }
            
            If a field is unknown, use an empty string.`
          },
          {
            role: 'user',
            content: `Source Content:\n${content}`
          }
        ],
        temperature: 0.1, // Keep it deterministic
        response_format: { type: "json_object" } // Tell OpenRouter to expect JSON
      })
    });

    if (!aiResponse.ok) {
      const errorData = await aiResponse.json().catch(() => ({}));
      throw new Error(`OpenRouter Error: ${aiResponse.status} ${JSON.stringify(errorData)}`);
    }

    const data = await aiResponse.json();
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Empty response from AI');
    }

    const resultText = data.choices[0].message.content;
    console.log('AI Raw Output:', resultText);
    
    // Step 3: Robust JSON Parsing
    try {
      // Find the first '{' and last '}' to handle cases where AI adds text around JSON
      const start = resultText.indexOf('{');
      const end = resultText.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON object found in response');
      
      const jsonStr = resultText.substring(start, end + 1);
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse AI JSON. Content was:', resultText);
      throw new Error('Invalid AI response format');
    }
  } catch (error) {
    console.error('AI Extraction Error Detail:', error);
    throw error;
  }
}
