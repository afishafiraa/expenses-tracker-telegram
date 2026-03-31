import 'dotenv/config';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
  error?: {
    message: string;
  };
}

async function testGemini(): Promise<void> {
  console.log('🧪 Testing Gemini API...\n');

  const prompt = 'Parse this expense: "grab 185 to office". Extract vendor, amount, category, and description as JSON.';

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ]
        })
      }
    );

    const data = await response.json() as GeminiResponse;

    if (data.error) {
      console.error('❌ Error:', data.error.message);
      return;
    }

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error('❌ No response from Gemini');
      return;
    }

    const result = data.candidates[0].content.parts[0].text;
    console.log('✅ Gemini Response:\n');
    console.log(result);

  } catch (error) {
    console.error('❌ Failed:', (error as Error).message);
  }
}

testGemini();
