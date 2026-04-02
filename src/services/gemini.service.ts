import 'dotenv/config';
import type { GeminiExtractedData } from '../types.js';
import { notifier } from './notification.service.js';

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

// Prompt for text messages (chat-based expense detection)
const TEXT_EXTRACTION_PROMPT = `Extract expense data from this message. Return ONLY valid JSON, no markdown.

Detect currency: ¥/円/"yen"=JPY, ฿/บาท/"baht"=THB, Rp/"rupiah"=IDR, ₫/"dong"=VND, RM/"ringgit"=MYR, ₱/"peso"=PHP, ₩/원/"won"=KRW, 元/"yuan"=CNY, $/"dollar"=USD, S$/"sgd"=SGD. Default: JPY.
Categories: Food/Transport/Utilities/Rent/Subscription/Shopping/Entertainment/Healthcare/Other.

{"date":"YYYY-MM-DD","vendor":"Name","detectedCurrency":"JPY","items":[{"item":"name","category":"Cat","amount":100,"currency":"JPY","taxRate":0,"description":"short"}],"paymentMethod":"Unknown"}

Message:`;

// Prompt for receipt images (OCR-focused, precise extraction)
const IMAGE_EXTRACTION_PROMPT = `You are reading a receipt/invoice photo. Extract ALL items precisely.

CRITICAL RULES:
1. Read each line carefully. Match each item name to its price on the SAME line.
2. Do NOT mix up item names with prices from different lines.
3. The amount for each item is the number right before the currency symbol (¥, 円, 外, 込) on that line.
4. Look for the subtotal (小計) and total (合計). Include "receiptTotal" in your response.
5. Tax detection (by country):
   - Japan: "消費税10%", "10%税額", "税率10%"→0.10, "8%"→0.08. "外"=tax-excluded, "込"=tax-included
   - Thailand: "VAT 7%", "ภาษีมูลค่าเพิ่ม 7%"→0.07
   - Indonesia: "PPN 11%", "PPN 12%", "pajak"→0.11 or 0.12
   - Singapore: "GST 9%"→0.09
   - Philippines: "VAT 12%"→0.12
   - Vietnam: "VAT 10%", "thuế GTGT"→0.10
   - Malaysia: "SST 6%", "SST 8%"→0.06 or 0.08
   - Korea: "부가세 10%", "VAT 10%"→0.10
   - China: "增值税", tax rates vary (13%, 9%, 6%)
   - General: "Tax X%", "VAT X%" → use that rate. No tax info → taxRate: 0
6. Payment detection (multi-language):
   - Credit card: "クレジット","VISA","Mastercard","カード","ビザ","บัตรเครดิต","kartu kredit","credit card","信用卡","신용카드"
   - Cash: "現金","เงินสด","tunai","cash","现金","현금"
   - QR/e-wallet: "PayPay","QR","PromptPay","GoPay","OVO","DANA","GrabPay","ShopeePay","GCash","Touch 'n Go","支付宝","微信支付"
   - Transfer: "transfer","โอน","转账"
   - If not found → "Unknown"
7. Keep descriptions under 20 chars.
8. Currency: ¥/円=JPY, ฿/บาท=THB, $=USD, ₩/원=KRW, RM/ringgit=MYR, Rp/rupiah=IDR, S$/SGD=SGD, ₫/dong/VND=VND, ₱/peso=PHP, ¥/元/yuan=CNY. Default: JPY.
9. Categories: Food/Transport/Utilities/Rent/Subscription/Shopping/Entertainment/Healthcare/Other.

Return ONLY this JSON (no markdown, no explanation):
{"date":"YYYY-MM-DD","vendor":"Name","detectedCurrency":"JPY","receiptTotal":0,"items":[{"item":"name","category":"Cat","amount":100,"currency":"JPY","taxRate":0,"description":"short"}],"paymentMethod":"Unknown"}`;

/**
 * Try to parse potentially truncated JSON from Gemini.
 * If JSON is cut off, attempt to repair by closing brackets.
 */
function parseGeminiJson(raw: string): { data: any; wasTruncated: boolean } {
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
    return { data: JSON.parse(text), wasTruncated: false };
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

  return { data: JSON.parse(text), wasTruncated: true };
}

export class GeminiService {
  async extractBillData(message: string): Promise<GeminiExtractedData | null> {
    try {
      const prompt = `${TEXT_EXTRACTION_PROMPT}\n\n"${message}"`;

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
        notifier.notify('Gemini API', data.error.message);
        return null;
      }

      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.error('❌ No response from Gemini');
        notifier.notify('Gemini API', 'No response from Gemini (text extraction)');
        return null;
      }

      const resultText = data.candidates[0].content.parts[0].text.trim();
      console.log('📝 Gemini raw response:', resultText.substring(0, 500));

      const { data: extracted } = parseGeminiJson(resultText);

      // Validate required fields
      if (!extracted.vendor || !extracted.items || extracted.items.length === 0) {
        console.error('❌ Invalid extracted data');
        return null;
      }

      return extracted as GeminiExtractedData;

    } catch (error) {
      console.error('❌ Failed to extract bill data:', (error as Error).message);
      notifier.notify('Gemini Text', (error as Error).message, { stack: (error as Error).stack });
      return null;
    }
  }

  async extractBillFromImage(imageBase64: string): Promise<GeminiExtractedData | null> {
    try {
      const prompt = IMAGE_EXTRACTION_PROMPT;

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
        notifier.notify('Gemini API', data.error.message);
        return null;
      }

      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.error('❌ No response from Gemini');
        notifier.notify('Gemini API', 'No response from Gemini (image extraction)');
        return null;
      }

      const resultText = data.candidates[0].content.parts[0].text.trim();
      const finishReason = data.candidates[0].finishReason;
      console.log('📝 Gemini raw response:', resultText.substring(0, 500));
      if (finishReason && finishReason !== 'STOP') {
        console.warn(`⚠️ Gemini finish reason: ${finishReason}`);
      }

      const { data: extracted, wasTruncated } = parseGeminiJson(resultText);

      if (wasTruncated) {
        console.warn('⚠️ Response was truncated — some items may be missing');
      }

      // Validate required fields
      if (!extracted.vendor || !extracted.items || extracted.items.length === 0) {
        console.error('❌ Invalid extracted data from image');
        return null;
      }

      // Validate items total vs receipt total
      if (extracted.receiptTotal && extracted.receiptTotal > 0) {
        const itemsSum = extracted.items.reduce((sum: number, item: any) => {
          const tax = item.taxRate || 0;
          return sum + Math.round(item.amount * (1 + tax));
        }, 0);
        const diff = Math.abs(itemsSum - extracted.receiptTotal);
        const tolerance = extracted.receiptTotal * 0.05; // 5% tolerance for rounding
        if (diff > tolerance) {
          console.warn(`⚠️ Total mismatch: items sum=${itemsSum}, receipt total=${extracted.receiptTotal}, diff=${diff}`);
        } else {
          console.log(`✅ Total validated: items sum=${itemsSum} ≈ receipt total=${extracted.receiptTotal}`);
        }
      }

      // Mark if truncated so the handler can warn the user
      const result = extracted as GeminiExtractedData;
      if (wasTruncated) {
        (result as any)._truncated = true;
      }

      // Clean up
      delete (extracted as any).receiptTotal;

      return result;

    } catch (error) {
      console.error('❌ Failed to extract bill from image:', (error as Error).message);
      notifier.notify('Gemini Image', (error as Error).message, { stack: (error as Error).stack });
      return null;
    }
  }
}
