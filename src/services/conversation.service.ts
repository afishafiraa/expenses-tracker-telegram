import 'dotenv/config';
import type { Currency } from '../types.js';

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
            temperature: 0.7,
            maxOutputTokens: 1024,
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

      // Parse response - try JSON first, fallback to plain text
      let parsed: any;
      try {
        let jsonText = resultText
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .trim();

        // Extract JSON object
        const start = jsonText.indexOf('{');
        const end = jsonText.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          jsonText = jsonText.substring(start, end + 1);
        }

        parsed = JSON.parse(jsonText);
      } catch {
        // Gemini returned plain text instead of JSON, use it as reply
        console.warn('⚠️ Conversation response was not JSON, using as plain text');
        return {
          reply: resultText,
        };
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
    return `You are a friendly AI assistant named BillNot that helps track expenses.

User context:
- Name: ${context.userName}
- Default currency: ${context.userCurrency}

Your task:
1. Respond naturally and helpfully to the user's message
2. Detect if they're mentioning an expense (buying something, spending money)
3. If it's an expense, extract available details

IMPORTANT: Currency detection is CRITICAL. Check these keywords carefully:
• "yen" or "¥" → return currency: "JPY"
• "baht" or "฿" → return currency: "THB"
• "rupiah" or "rp" or "idr" → return currency: "IDR"
• "dong" or "vnd" → return currency: "VND"
• "ringgit" or "myr" → return currency: "MYR"
• "peso" or "php" → return currency: "PHP"
• "won" or "krw" → return currency: "KRW"
• "yuan" or "cny" → return currency: "CNY"
• "dollar" or "usd" or "$" → return currency: "USD"
• "sgd" → return currency: "SGD"

If NO currency keyword found in message, use: "${context.userCurrency}"

IMPORTANT: Detect tax mentions carefully!
- If user says "with tax", "plus tax", "including tax", "税込", "dengan pajak", etc. → set hasTaxMention: true
- If user specifies rate like "tax 8%", "8% tax" → set taxRate: 0.08 (as decimal)
- If just "with tax" but no rate → hasTaxMention: true, taxRate: undefined

Return JSON format:
{
  "reply": "Your friendly response to the user",
  "expenseDetected": {
    "isExpense": true/false,
    "item": "item name (if mentioned)",
    "amount": number (if mentioned),
    "currency": "MUST be one of: JPY/THB/USD/IDR/VND/MYR/PHP/KRW/CNY/SGD/HKD/TWD/INR (REQUIRED - detect from message or use ${context.userCurrency})",
    "vendor": "store/vendor name (if mentioned)",
    "category": "Food/Transport/Shopping/etc (if can infer)",
    "paymentMethod": "Cash/Credit/etc (if mentioned)",
    "taxRate": 0.08 (if user mentions tax rate like "8%" - convert to decimal, otherwise undefined),
    "hasTaxMention": true/false (true if user mentions "with tax", "plus tax", etc. even without rate),
    "confidence": "high/medium/low"
  }
}

Examples:

User: "taiyaki 110 yen"
Response: {"reply":"Taiyaki! 🍡 Let me track that.","expenseDetected":{"isExpense":true,"item":"taiyaki","amount":110,"currency":"JPY","category":"Food","confidence":"high"}}

User: "bought bread with tax 8%"
Response: {"reply":"Got it! How much was the bread?","expenseDetected":{"isExpense":true,"item":"bread","category":"Food","hasTaxMention":true,"taxRate":0.08,"confidence":"high"}}

User: "hi!"
Response: {"reply":"Hey ${context.userName}! 👋 What can I help you track?","expenseDetected":{"isExpense":false,"confidence":"high"}}

IMPORTANT:
- Be friendly and conversational
- Use the user's name occasionally
- If they mention buying/spending, help them track it
- Return ONLY the JSON object, no markdown formatting

User message: "${message}"

Response:`;
  }
}
