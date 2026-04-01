import 'dotenv/config';
import { google } from 'googleapis';

const CLIENT_EMAIL = process.env.GCP_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, '\n');

// Strong labels — highly specific to receipts/invoices
const STRONG_RECEIPT_LABELS = [
  'receipt', 'invoice', 'ticket', 'slip', 'voucher', 'statement',
];

// Weak labels — supportive but not conclusive on their own
const WEAK_RECEIPT_LABELS = [
  'document', 'paper', 'transaction', 'order',
];

// Labels that indicate this is NOT a receipt (reject immediately)
const REJECT_LABELS = [
  'banknote', 'cash', 'money', 'coin', 'currency', 'dollar bill',
  'food', 'selfie', 'person', 'animal', 'pet', 'landscape',
  'sky', 'building', 'car', 'vehicle', 'plant', 'flower',
  'credit card', 'debit card', 'playing card', 'game',
  'calculator', 'scoreboard', 'menu', 'price tag',
  'lottery', 'scratch card', 'boarding pass',
];

// Keywords that appear on receipts — need multiple matches to confirm
const RECEIPT_KEYWORDS = [
  // English
  'total', 'subtotal', 'sub-total', 'tax', 'vat',
  'qty', 'quantity', 'price', 'amount', 'discount',
  'balance', 'net', 'gross', 'item', 'unit',
  'change', 'tendered', 'payment', 'paid',
  // Japanese
  '合計', '小計', '税', '消費税', '領収', '領収証', '領収書',
  '料金', '金額', '支払', 'お釣', '釣銭', '点数', '個',
  '売上', '取引', '明細', '伝票', '請求',
  // Thai
  'รวม', 'ทั้งหมด', 'ภาษี', 'ใบเสร็จ', 'จำนวน', 'ราคา', 'ชำระ',
  // Korean
  '합계', '소계', '세금', '영수증', '결제', '금액',
  // Chinese
  '总计', '小计', '税额', '收据', '发票', '付款', '金额',
];

export class VisionService {
  private vision;

  constructor() {
    if (!CLIENT_EMAIL || !PRIVATE_KEY) {
      console.warn('⚠️ Google Cloud credentials not set — Vision API disabled');
      this.vision = null;
      return;
    }

    const auth = new google.auth.JWT({
      email: CLIENT_EMAIL,
      key: PRIVATE_KEY,
      scopes: ['https://www.googleapis.com/auth/cloud-vision'],
    });

    this.vision = google.vision({ version: 'v1', auth });
  }

  /**
   * Check if an image is a receipt/bill/invoice using Cloud Vision API.
   * Returns true if the image looks like a receipt, false otherwise.
   */
  async isReceipt(imageBase64: string): Promise<boolean> {
    if (!this.vision) {
      console.warn('⚠️ Vision API not configured, skipping receipt validation');
      return true;
    }

    try {
      const response = await this.vision.images.annotate({
        requestBody: {
          requests: [
            {
              image: { content: imageBase64 },
              features: [
                { type: 'LABEL_DETECTION', maxResults: 20 },
                { type: 'TEXT_DETECTION', maxResults: 1 },
              ],
            },
          ],
        },
      });

      const result = response.data.responses?.[0];
      if (!result) {
        console.log('⚠️ No Vision API response');
        return false;
      }

      // Get labels
      const labels = (result.labelAnnotations || [])
        .map((l: { description?: string | null }) => l.description?.toLowerCase() || '');

      console.log(`🏷️ Vision labels: ${labels.join(', ')}`);

      // Check reject labels first — if image is clearly not a receipt, reject immediately
      const hasRejectLabel = labels.some((l: string) =>
        REJECT_LABELS.some((rl) => l.includes(rl))
      );
      if (hasRejectLabel) {
        const matched = labels.filter((l: string) => REJECT_LABELS.some((rl) => l.includes(rl)));
        console.log(`🚫 Rejected by labels: ${matched.join(', ')}`);
        return false;
      }

      // Check strong receipt labels
      const strongMatches = labels.filter((l: string) =>
        STRONG_RECEIPT_LABELS.some((rl) => l.includes(rl))
      );

      // Check weak receipt labels
      const weakMatches = labels.filter((l: string) =>
        WEAK_RECEIPT_LABELS.some((rl) => l.includes(rl))
      );

      console.log(`✅ Strong label matches: ${strongMatches.join(', ') || 'none'}`);
      console.log(`📄 Weak label matches: ${weakMatches.join(', ') || 'none'}`);

      // Check text content
      const fullText = result.textAnnotations?.[0]?.description || '';
      const textLength = fullText.length;

      // Count receipt keyword matches in text
      // Use simple includes for CJK keywords (word boundaries don't work with CJK)
      const keywordMatches = RECEIPT_KEYWORDS.filter((kw) =>
        /^[a-zA-Z\-]/.test(kw)
          ? new RegExp(`\\b${kw}\\b`, 'i').test(fullText)
          : fullText.includes(kw)
      );

      // Count lines that look like "item + price"
      const lines = fullText.split('\n');
      const priceLineCount = lines.filter((line: string) =>
        /\d+[.,]\d{2}\b/.test(line) ||                          // 45.00, 1,500.00
        /[\d,]+\s*(?:[$¥฿₹₩€£₱₫])/.test(line) ||              // 1,500¥
        /(?:[$¥฿₹₩€£₱₫])\s*[\d,]+/.test(line) ||              // ¥1,500 or ¥550
        /[\d,]+\s*円/.test(line) ||                              // 1,500円
        /[\d,]+\s*(?:บาท|원|元|dong|₫)/.test(line) ||           // Asian currency words
        /[\d,]+\s*(?:外|込)/.test(line)                          // Japanese tax markers (¥100外)
      ).length;

      console.log(`📝 Text length: ${textLength}, Keywords: ${keywordMatches.join(', ') || 'none'}, Price lines: ${priceLineCount}`);

      // Decision logic:
      // 1. Strong label match → accept
      if (strongMatches.length >= 1) {
        console.log('📋 Receipt detected: strong label match');
        return true;
      }

      // 2. Weak labels + receipt keywords in text + multiple price lines → accept
      if (weakMatches.length >= 1 && keywordMatches.length >= 2 && priceLineCount >= 2) {
        console.log('📋 Receipt detected: weak labels + keywords + price lines');
        return true;
      }

      // 3. No label match, but text has receipt keywords + price lines → accept
      if (keywordMatches.length >= 2 && priceLineCount >= 2) {
        console.log('📋 Receipt detected: text evidence (keywords + prices)');
        return true;
      }

      console.log('🚫 Not a receipt');
      return false;
    } catch (error) {
      console.error('❌ Vision API error:', error);
      // On error, allow the image through (don't block the user)
      return true;
    }
  }
}
