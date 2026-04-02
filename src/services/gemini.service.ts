import 'dotenv/config';
import type { GeminiExtractedData } from '../types.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash-lite';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    message: string;
  };
}

const EXTRACTION_PROMPT = `You are analyzing an expense message. Extract the following data and return ONLY valid JSON.

For each item, extract:
- Date (format: YYYY-MM-DD, or use today's date if not specified)
- Vendor name
- Item name
- Category (Food/Transport/Utilities/Rent/Subscription/Shopping/Entertainment/Healthcare/Other)
- Amount (before tax, number only)
- Currency (THB/JPY/USD/SGD/VND/IDR/MYR/PHP/KRW/CNY/HKD/TWD/INR - detect from keywords:
  • "yen" or "¥" = JPY
  • "baht" or "฿" = THB
  • "rupiah" or "rp" or "idr" = IDR
  • "dong" or "vnd" = VND
  • "ringgit" or "myr" = MYR
  • "peso" or "php" = PHP
  • "won" or "krw" = KRW
  • "yuan" or "cny" = CNY
  • "dollar" or "usd" or "$" = USD
  • "sgd" or "singapore dollar" = SGD
  If not mentioned, use JPY as default)
- Tax rate (0, 0.07, 0.08, 0.10, etc. - if not mentioned, use 0)
- Payment method (cash/credit card/QR/transfer/other - if not mentioned, use "Unknown")
- Brief description

IMPORTANT: Return ONLY the JSON object, no markdown formatting, no explanations. Keep descriptions short (under 20 chars). Do not include any thinking or reasoning text before the JSON.

JSON format:
{
  "date": "YYYY-MM-DD",
  "vendor": "Vendor Name",
  "detectedCurrency": "JPY",
  "items": [
    {
      "item": "Item name",
      "category": "Category",
      "amount": 100,
      "currency": "JPY",
      "taxRate": 0,
      "description": "Brief description"
    }
  ],
  "paymentMethod": "Unknown"
}

Message to parse:`;

/**
 * Try to parse potentially truncated JSON from Gemini.
 * If JSON is cut off, attempt to repair by closing brackets.
 */
function parseGeminiJson(raw: string): any {
  // Clean markdown
  let text = raw
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  // Extract JSON object
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON object found');
  text = text.substring(start);

  // Try parsing as-is first
  try {
    return JSON.parse(text);
  } catch {
    // JSON is likely truncated, try to repair
    console.warn('⚠️ JSON truncated, attempting repair...');
  }

  // Remove any trailing incomplete string value (cut mid-string)
  text = text.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
  text = text.replace(/,\s*"[^"]*":\s*[^,}\]]*$/, '');
  text = text.replace(/,\s*\{[^}]*$/, '');

  // Count and close open brackets
  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escape = false;

  for (const ch of text) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }

  // Close any open brackets/braces
  while (brackets > 0) { text += ']'; brackets--; }
  while (braces > 0) { text += '}'; braces--; }

  return JSON.parse(text);
}

export class GeminiService {
  async extractBillData(message: string): Promise<GeminiExtractedData | null> {
    try {
      const prompt = `${EXTRACTION_PROMPT}\n\n"${message}"`;

      const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          }
        })
      });

      const data = await response.json() as GeminiResponse;

      if (data.error) {
        console.error('❌ Gemini API error:', data.error.message);
        return null;
      }

      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.error('❌ No response from Gemini');
        return null;
      }

      const resultText = data.candidates[0].content.parts[0].text.trim();
      console.log('📝 Gemini raw response:', resultText.substring(0, 500));

      const extracted = parseGeminiJson(resultText) as GeminiExtractedData;

      // Validate required fields
      if (!extracted.vendor || !extracted.items || extracted.items.length === 0) {
        console.error('❌ Invalid extracted data');
        return null;
      }

      return extracted;

    } catch (error) {
      console.error('❌ Failed to extract bill data:', (error as Error).message);
      return null;
    }
  }

  async extractBillFromImage(imageBase64: string): Promise<GeminiExtractedData | null> {
    try {
      const prompt = EXTRACTION_PROMPT;

      const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: imageBase64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          }
        })
      });

      const data = await response.json() as GeminiResponse;

      if (data.error) {
        console.error('❌ Gemini API error:', data.error.message);
        return null;
      }

      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.error('❌ No response from Gemini');
        return null;
      }

      const resultText = data.candidates[0].content.parts[0].text.trim();
      const finishReason = data.candidates[0].finishReason;
      console.log('📝 Gemini raw response:', resultText.substring(0, 500));
      if (finishReason && finishReason !== 'STOP') {
        console.warn(`⚠️ Gemini finish reason: ${finishReason}`);
      }

      const extracted = parseGeminiJson(resultText) as GeminiExtractedData;

      // Validate required fields
      if (!extracted.vendor || !extracted.items || extracted.items.length === 0) {
        console.error('❌ Invalid extracted data from image');
        return null;
      }

      return extracted;

    } catch (error) {
      console.error('❌ Failed to extract bill from image:', (error as Error).message);
      return null;
    }
  }
}
