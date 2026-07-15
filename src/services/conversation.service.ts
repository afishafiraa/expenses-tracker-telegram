import 'dotenv/config';
import type { Currency } from '../types.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash-lite';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const API_TIMEOUT_MS = 30000;

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = API_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

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

interface ExpenseDetectionResult {
  isExpense: boolean;
  item?: string;
  amount?: number;
  currency?: Currency;
  vendor?: string;
  category?: string;
  paymentMethod?: string;
  taxRate?: number;
  hasTaxMention?: boolean;
  confidence: 'high' | 'medium' | 'low';
}

interface ConversationContext {
  userName: string;
  userCurrency: Currency;
  conversationHistory?: string[];
}

export class ConversationService {
  /**
   * Chat naturally with user and detect if message contains expense info
   */
  async chat(
    message: string,
    context: ConversationContext
  ): Promise<{ reply: string; expenseDetected?: ExpenseDetectionResult }> {
    try {
      const prompt = this.buildConversationPrompt(message, context);

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
            temperature: 0.7,
            maxOutputTokens: 512,
            responseMimeType: 'application/json',
            responseJsonSchema: {
              type: 'object',
              properties: {
                reply: { type: 'string', description: 'Friendly response to the user' },
                expenseDetected: {
                  type: 'object',
                  properties: {
                    isExpense: { type: 'boolean' },
                    item: { type: 'string' },
                    amount: { type: 'number' },
                    currency: { type: 'string' },
                    vendor: { type: 'string' },
                    category: { type: 'string' },
                    paymentMethod: { type: 'string' },
                    taxRate: { type: 'number' },
                    hasTaxMention: { type: 'boolean' },
                    confidence: { type: 'string', description: 'high, medium, or low' },
                  },
                  required: ['isExpense', 'confidence'],
                },
              },
              required: ['reply', 'expenseDetected'],
            },
          }
        })
      });

      const data = await response.json() as GeminiResponse;

      if (data.error) {
        console.error('❌ Gemini API error:', data.error.message);
        return {
          reply: "Sorry, I'm having trouble thinking right now. Could you try again?"
        };
      }

      if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
        console.error('❌ No response from Gemini');
        return {
          reply: "Hmm, I didn't quite catch that. Could you say that again?"
        };
      }

      const resultText = data.candidates[0].content.parts[0].text.trim();
      console.log('💬 Conversation raw response:', resultText.substring(0, 300));

      let parsed: any;
      try {
        parsed = JSON.parse(resultText);
      } catch {
        console.warn('⚠️ Conversation response was not JSON, using as plain text');
        return { reply: resultText };
      }

      return {
        reply: parsed.reply || resultText,
        expenseDetected: parsed.expenseDetected || undefined,
      };

    } catch (error) {
      console.error('❌ Failed to chat:', (error as Error).message);
      return {
        reply: "I'm having trouble understanding. Could you try rephrasing?"
      };
    }
  }

  private buildConversationPrompt(message: string, context: ConversationContext): string {
    return `You are BillNot, a smart and friendly expense-tracking AI assistant. You talk to ${context.userName}. Default currency: ${context.userCurrency}.

PERSONALITY: You are helpful, concise, and proactive. You guide users naturally. You feel like chatting with a smart friend who helps track money.

BEHAVIOR:
- If the user sends a greeting, test message, or unclear text: reply warmly and tell them what you can do. Example: "Hey ${context.userName}! I'm your expense tracker. You can: 📝 Tell me what you bought (e.g. 'coffee 500 yen at Starbucks'), 📸 Send a receipt photo, or use /help for all commands."
- If the user mentions buying/spending/paying something: extract the expense details and confirm naturally. Include what you detected in your reply. Example: "Got it! Tissue for 330 JPY. Let me save that for you."
- If the message is casual chat (not expense-related): reply briefly and friendly, then gently remind you're here for expense tracking.
- NEVER reply with just "How can I help you?" — always give specific examples of what the user can do.

EXPENSE DETECTION: Extract item, amount, currency, vendor, category, paymentMethod if mentioned.
Currency: ¥/yen/円=JPY, ฿/baht=THB, Rp/rupiah=IDR, ₫/dong=VND, RM/ringgit=MYR, ₱/peso=PHP, ₩/won=KRW, 元/yuan=CNY, $/dollar=USD, S$/sgd=SGD. No match→${context.userCurrency}.
Tax: "with tax"/"税込"/"dengan pajak"→hasTaxMention:true. "tax 8%"→taxRate:0.08. No tax mention→taxRate:0, hasTaxMention:false.
Categories: Food/Transport/Utilities/Rent/Subscription/Shopping/Entertainment/Healthcare/Other.

User message: "${message}"`;
  }
}
