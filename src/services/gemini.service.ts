import 'dotenv/config';
import type { GeminiExtractedData } from '../types.js';
import { notifier } from './notification.service.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash-lite';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const API_TIMEOUT_MS = 30000;

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

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

const TEXT_EXTRACTION_PROMPT = `Extract expense data from this message.

Currency: ¥/円=JPY, ฿/บาท=THB, Rp=IDR, ₫=VND, RM=MYR, ₱=PHP, ₩/원=KRW, 元=CNY, $=USD, S$=SGD. Default: JPY.
Categories: Food/Transport/Utilities/Rent/Subscription/Shopping/Entertainment/Healthcare/Other.

Message:`;

const OCR_EXTRACTION_PROMPT = `Extract expense items from this receipt OCR text. Return ONLY valid JSON.

Rules:
1. Each item has a name and price. Ignore subtotals, totals, tax lines, change lines.
2. If discounts exist (割引, 値引, discount, クーポン, coupon, ポイント利用, OFF, セール, promo, ส่วนลด, giảm giá), subtract from the relevant item. Do NOT list discounts as items. Items free after discount: amount=0.
3. Include "receiptTotal" (合計/total line value, 0 if not found).
4. Tax: detect rate from text (消費税10%→0.10, VAT 7%→0.07, PPN 11%→0.11, GST 9%→0.09, 부가세10%→0.10, etc). "外"=excluded, "込"=included. No tax info→0.
5. Payment: クレジット/VISA/Mastercard/カード→Card, 現金/เงินสด/tunai→Cash, PayPay/PromptPay/GoPay/OVO/DANA/GrabPay→QR, Not found→Unknown.
6. Currency: ¥/円=JPY, ฿/บาท=THB, $=USD, ₩/원=KRW, RM=MYR, Rp=IDR, S$=SGD, ₫=VND, ₱=PHP, 元=CNY. Default: JPY.
7. Categories: Food/Transport/Utilities/Rent/Subscription/Shopping/Entertainment/Healthcare/Other.

OCR text:`;

const IMAGE_EXTRACTION_PROMPT = `You are reading a receipt/invoice photo. Extract ALL items precisely.

CRITICAL RULES:
1. Read each line carefully. Match each item name to its price on the SAME line.
2. Do NOT mix up item names with prices from different lines.
3. The amount for each item is the number right before the currency symbol (¥, 円, 外, 込) on that line.
4. Include "receiptTotal" from the total (合計/total) line. Do NOT include subtotals, totals, tax lines, change lines, or payment lines as items — only actual purchased items.
5. DISCOUNT HANDLING (CRITICAL — handle in this single pass):
   - If discounts exist (割引, 値引, discount, クーポン, coupon, ポイント利用, ポイント値引, OFF, セール, promo, promosi, ส่วนลด, giảm giá), apply them to the relevant item(s) by reducing that item's amount. If the discount applies to the whole receipt, distribute proportionally.
   - NEVER include discount lines as separate items. The final item amounts should reflect what was actually paid after discounts.
   - Items that become free (amount = 0) after discount should still be included with amount: 0.
6. Tax detection:
   - Japan: "消費税10%", "10%税額"→0.10, "8%"→0.08. "外"=tax-excluded, "込"=tax-included
   - Thailand: "VAT 7%"→0.07 | Indonesia: "PPN 11%"/"PPN 12%"→0.11/0.12
   - Singapore: "GST 9%"→0.09 | Philippines: "VAT 12%"→0.12
   - Vietnam: "VAT 10%"→0.10 | Malaysia: "SST 6%"/"SST 8%"→0.06/0.08
   - Korea: "부가세 10%"→0.10 | China: "增值税" (13%/9%/6%)
   - General: "Tax X%" → use that rate. No tax info → taxRate: 0
7. Payment detection: Credit card (クレジット/VISA/Mastercard/カード/บัตรเครดิต/kartu kredit/신용카드), Cash (現金/เงินสด/tunai/现金/현금), QR/e-wallet (PayPay/PromptPay/GoPay/OVO/DANA/GrabPay/ShopeePay/GCash/支付宝/微信支付), Transfer (โอน/转账). Not found → "Unknown"
8. Currency: ¥/円=JPY, ฿/บาท=THB, $=USD, ₩/원=KRW, RM=MYR, Rp=IDR, S$=SGD, ₫=VND, ₱=PHP, 元=CNY. Default: JPY.
9. Categories: Food/Transport/Utilities/Rent/Subscription/Shopping/Entertainment/Healthcare/Other.

Extract ALL items precisely.`;

const EXPENSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    date: { type: 'string' },
    vendor: { type: 'string' },
    detectedCurrency: { type: 'string' },
    receiptTotal: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          category: { type: 'string' },
          amount: { type: 'number' },
          currency: { type: 'string' },
          taxRate: { type: 'number' },
        },
        required: ['item', 'category', 'amount', 'currency', 'taxRate'],
      },
    },
    paymentMethod: { type: 'string' },
  },
  required: ['date', 'vendor', 'detectedCurrency', 'items', 'paymentMethod'],
};

function parseGeminiJson(raw: string): { data: any; wasTruncated: boolean } {
  let text = raw
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON object found');
  text = text.substring(start);

  try {
    return { data: JSON.parse(text), wasTruncated: false };
  } catch {
    console.warn('⚠️ JSON truncated, attempting repair...');
  }

  text = text.replace(/,\s*"[^"]*":\s*"[^"]*$/, '');
  text = text.replace(/,\s*"[^"]*":\s*[^,}\]]*$/, '');
  text = text.replace(/,\s*\{[^}]*$/, '');

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

  while (brackets > 0) { text += ']'; brackets--; }
  while (braces > 0) { text += '}'; braces--; }

  return { data: JSON.parse(text), wasTruncated: true };
}

const NON_ITEM_EXACT = ['小計', '合計', '消費税', 'subtotal', 'total', 'tax', 'change', 'お釣', '釣銭', '支払', 'payment', 'お預り', '預り', 'お買上', '買上', '点数', '合計点数'];

const NON_ITEM_PATTERNS = [
  /^\d+\s*p\s*\d+$/i,
  /^\d+\s*(点|件|個|品)$/,
  /^合計\d/,
  /^[x×]\s*\d+$/i,
  /^(小計|合計|税込|税抜|内税|外税)/,
  /^\d+円$/,
];

function isNonItemLine(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (NON_ITEM_EXACT.some(kw => lower === kw.toLowerCase() || lower === kw)) return true;
  if (NON_ITEM_PATTERNS.some(pat => pat.test(name.trim()))) return true;
  if (name.trim().length <= 2 && /^\d+$/.test(name.trim())) return true;
  return false;
}

export class GeminiService {
  async extractBillData(message: string): Promise<GeminiExtractedData | null> {
    try {
      const prompt = `${TEXT_EXTRACTION_PROMPT}\n\n"${message}"`;

      const response = await fetchWithTimeout(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
            responseJsonSchema: EXPENSE_JSON_SCHEMA,
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

      const extracted = JSON.parse(resultText);

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
      const response = await fetchWithTimeout(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: IMAGE_EXTRACTION_PROMPT },
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
            temperature: 0,
            maxOutputTokens: 16384,
            responseMimeType: 'application/json',
            responseJsonSchema: EXPENSE_JSON_SCHEMA,
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

      let extracted: any;
      let wasTruncated = false;
      try {
        extracted = JSON.parse(resultText);
      } catch {
        const parsed = parseGeminiJson(resultText);
        extracted = parsed.data;
        wasTruncated = parsed.wasTruncated;
      }

      if (wasTruncated) {
        console.warn('⚠️ Response was truncated — some items may be missing');
      }

      if (!extracted.vendor || !extracted.items || extracted.items.length === 0) {
        console.error('❌ Invalid extracted data from image');
        return null;
      }

      return this.postProcess(extracted, wasTruncated, finishReason);

    } catch (error) {
      console.error('❌ Failed to extract bill from image:', (error as Error).message);
      notifier.notify('Gemini Image', (error as Error).message, { stack: (error as Error).stack });
      return null;
    }
  }

  async extractBillFromOcrText(ocrText: string): Promise<GeminiExtractedData | null> {
    try {
      const prompt = `${OCR_EXTRACTION_PROMPT}\n\n${ocrText}`;

      const response = await fetchWithTimeout(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY!,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            responseJsonSchema: EXPENSE_JSON_SCHEMA,
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
      console.log('📝 Gemini OCR extraction response:', resultText.substring(0, 500));

      let extracted: any;
      let wasTruncated = false;
      try {
        extracted = JSON.parse(resultText);
      } catch {
        const parsed = parseGeminiJson(resultText);
        extracted = parsed.data;
        wasTruncated = parsed.wasTruncated;
      }

      if (!extracted.vendor || !extracted.items || extracted.items.length === 0) {
        console.error('❌ Invalid extracted data from OCR text');
        return null;
      }

      return this.postProcess(extracted, wasTruncated, finishReason);

    } catch (error) {
      console.error('❌ Failed to extract bill from OCR text:', (error as Error).message);
      return null;
    }
  }

  private postProcess(extracted: any, wasTruncated: boolean, finishReason?: string): GeminiExtractedData {
    // Fix obviously wrong dates (e.g. 2016 instead of 2026 from faded receipts)
    if (extracted.date) {
      const dateMatch = extracted.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateMatch) {
        const year = parseInt(dateMatch[1]);
        const now = new Date();
        const currentYear = now.getFullYear();
        // If year is more than 1 year in the past or in the future, use current year
        if (year < currentYear - 1 || year > currentYear + 1) {
          const correctedDate = `${currentYear}-${dateMatch[2]}-${dateMatch[3]}`;
          console.warn(`⚠️ Date corrected: ${extracted.date} → ${correctedDate} (year out of range)`);
          extracted.date = correctedDate;
        }
      }
    }

    extracted.items = extracted.items.filter((item: any) => {
      if (isNonItemLine(item.item || '')) {
        console.log(`🚫 Filtered non-item: "${item.item}" (${item.amount})`);
        return false;
      }
      if (item.amount < 0) {
        console.log(`🚫 Filtered negative amount: "${item.item}" (${item.amount})`);
        return false;
      }
      // Filter items with 0 amount that look like garbage (not real free items)
      if (item.amount === 0 && (!item.item || item.item.trim().length < 3 || /^\d/.test(item.item.trim()))) {
        console.log(`🚫 Filtered zero-amount garbage: "${item.item}"`);
        return false;
      }
      return true;
    });

    let totalMismatch = false;
    if (extracted.receiptTotal && extracted.receiptTotal > 0) {
      const itemsSum = extracted.items.reduce((sum: number, item: any) => {
        const tax = item.taxRate || 0;
        return sum + Math.round(item.amount * (1 + tax));
      }, 0);
      const diff = Math.abs(itemsSum - extracted.receiptTotal);
      const tolerance = extracted.receiptTotal * 0.05;
      if (diff > tolerance) {
        console.warn(`⚠️ Total mismatch: items sum=${itemsSum}, receipt total=${extracted.receiptTotal}, diff=${diff}`);
        totalMismatch = true;
      } else {
        console.log(`✅ Total validated: items sum=${itemsSum} ≈ receipt total=${extracted.receiptTotal}`);
      }
    }

    const result = extracted as GeminiExtractedData;
    if (wasTruncated || finishReason === 'MAX_TOKENS') {
      (result as any)._truncated = true;
    }
    if (totalMismatch) {
      (result as any)._totalMismatch = true;
    }

    delete (extracted as any).receiptTotal;

    return result;
  }
}
