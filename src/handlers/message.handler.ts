import TelegramBot from 'node-telegram-bot-api';
import sharp from 'sharp';
import { DatabaseService } from '../services/database.service.js';
import { GeminiService } from '../services/gemini.service.js';
import { VisionService } from '../services/vision.service.js';
import { ConversationService } from '../services/conversation.service.js';
import type { User, Currency, BillEntry } from '../types.js';
import { normalizePaymentMethod } from '../utils/payment.js';
import { getMultiLangMessage } from '../utils/language.js';
import { DEFAULT_CURRENCY, roundAmount } from '../utils/currency.js';
import { notifier } from '../services/notification.service.js';

/**
 * Handles incoming messages (text, photos)
 * Routes to AI detection or saves expenses
 */
export class MessageHandler {
  private gemini: GeminiService;
  private vision: VisionService;
  private conversation: ConversationService;

  constructor(
    private bot: TelegramBot,
    private database: DatabaseService
  ) {
    this.gemini = new GeminiService();
    this.vision = new VisionService();
    this.conversation = new ConversationService();
  }

  /**
   * Handle text message with AI detection
   */
  async handleTextMessage(chatId: number, user: User, text: string): Promise<any> {
    try {
      const chatResult = await this.conversation.chat(text, {
        userName: user.nickname || user.first_name || 'there',
        userCurrency: (user.default_currency as Currency) || DEFAULT_CURRENCY,
      });

      await this.bot.sendMessage(chatId, chatResult.reply);

      // Return detected expense if found
      if (chatResult.expenseDetected?.isExpense) {
        return chatResult.expenseDetected;
      }

      return null;
    } catch (error) {
      console.error('❌ Error processing text message:', error);
      notifier.notify('Text Processing', (error as Error).message, { userId: user.telegram_id, username: user.username, stack: (error as Error).stack });
      await this.bot.sendMessage(chatId, "Sorry, I'm having trouble understanding. Please try again.");
      return null;
    }
  }

  /**
   * Handle photo message (receipt/bill)
   */
  async handlePhotoMessage(chatId: number, user: User, msg: TelegramBot.Message): Promise<void> {
    console.log(`\n📸 Received photo from user ${user.telegram_id}`);

    try {
      await this.bot.sendMessage(chatId, '📸 Analyzing image...');

      // Download image once
      const photo = msg.photo![msg.photo!.length - 1];
      const fileLink = await this.bot.getFileLink(photo.file_id);
      console.log(`🔗 Photo URL: ${fileLink}`);

      const imageResponse = await fetch(fileLink);
      if (!imageResponse.ok) {
        await this.bot.sendMessage(chatId, '❌ Could not download the image. Please try again.');
        return;
      }
      const rawBuffer = Buffer.from(await imageResponse.arrayBuffer());

      // Compress image — keep enough resolution for text readability on receipts
      const compressedBuffer = await sharp(rawBuffer)
        .resize(1536, 2048, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      const originalKB = Math.round(rawBuffer.length / 1024);
      const compressedKB = Math.round(compressedBuffer.length / 1024);
      console.log(`📦 Image compressed: ${originalKB}KB → ${compressedKB}KB`);

      const imageBase64 = compressedBuffer.toString('base64');

      // Validate with Cloud Vision and get OCR text
      const { isReceipt, ocrText } = await this.vision.validateReceipt(imageBase64);
      if (!isReceipt) {
        await this.bot.sendMessage(chatId, '🚫 This doesn\'t look like a receipt or invoice. Please send a photo of a bill, receipt, or invoice.');
        return;
      }

      // OCR-first: use text extraction if OCR has enough content, else fall back to image
      let extractedData;
      if (ocrText.length >= 20) {
        console.log(`📝 Using OCR text extraction (${ocrText.length} chars)`);
        extractedData = await this.gemini.extractBillFromOcrText(ocrText);
      }
      if (!extractedData) {
        console.log('🖼️ Falling back to image extraction');
        extractedData = await this.gemini.extractBillFromImage(imageBase64);
      }
      console.log('📊 Extracted data:', JSON.stringify(extractedData, null, 2));

      if (!extractedData || !extractedData.items || extractedData.items.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Could not extract expense data from this image. Please try again or enter manually.');
        return;
      }

      // Store extracted data for confirmation
      await this.database.setConversationState(user.id, 'awaiting_confirmation', {
        action: 'image_expense',
        vendor: extractedData.vendor,
        date: extractedData.date,
        items: extractedData.items,
        paymentMethod: extractedData.paymentMethod,
        detectedCurrency: extractedData.detectedCurrency,
      } as any);

      // Show extracted data to user for confirmation
      const itemsList = extractedData.items
        .map((item) => {
          const currency = item.currency || extractedData.detectedCurrency || user.default_currency || DEFAULT_CURRENCY;
          const taxDisplay = item.taxRate && item.taxRate > 0 ? ` (Tax: ${(item.taxRate * 100).toFixed(0)}%)` : '';
          return `• ${item.item}: ${item.amount} ${currency}${taxDisplay}`;
        })
        .join('\n');

      const warnings: string[] = [];
      if ((extractedData as any)._truncated) {
        warnings.push('⚠️ The receipt was too long — some items may be missing.');
      }
      if ((extractedData as any)._totalMismatch) {
        warnings.push('⚠️ Items total doesn\'t match receipt total — some items may be missing. Please check.');
      }
      const warningText = warnings.length > 0 ? '\n\n' + warnings.join('\n') : '';

      await this.bot.sendMessage(
        chatId,
        `📋 I found these expenses:

📅 Date: ${extractedData.date}
🏪 Vendor: ${extractedData.vendor}
💳 Payment: ${extractedData.paymentMethod}

${itemsList}${warningText}

Is this correct?\n\n${getMultiLangMessage('yes_no')}`
      );
    } catch (error) {
      console.error('❌ Error processing photo:', error);
      notifier.notify('Photo Processing', (error as Error).message, { userId: user.telegram_id, username: user.username, stack: (error as Error).stack });
      await this.bot.sendMessage(chatId, 'Sorry, I encountered an error processing the photo. Please try again.');
    }
  }

  /**
   * Save image expense after confirmation
   */
  async saveImageExpense(user: User, data: any): Promise<void> {
    const userCurrency = user.default_currency || DEFAULT_CURRENCY;

    for (const item of data.items) {
      const itemCurrency = (item.currency || data.detectedCurrency || userCurrency) as Currency;
      const amount = roundAmount(item.amount, itemCurrency);
      const taxMultiplier = 1 + (item.taxRate || 0);

      // Contract: amount_in_default_currency is ALWAYS the final tax-inclusive
      // amount in the user's default currency (matches saveExpenseFromData).
      let exchangeRate = 1.0;
      let amountInDefaultCurrency = roundAmount(amount * taxMultiplier, userCurrency as Currency);

      if (itemCurrency !== userCurrency) {
        exchangeRate = await this.database.getExchangeRate(itemCurrency, userCurrency as Currency);
        amountInDefaultCurrency = roundAmount(amount * taxMultiplier * exchangeRate, userCurrency as Currency);
      }

      const billEntry: BillEntry = {
        date: data.date,
        vendor: data.vendor,
        item: item.item,
        category: item.category,
        amount: amount,
        currency: itemCurrency,
        taxRate: item.taxRate || 0,
        paymentMethod: normalizePaymentMethod(data.paymentMethod || 'Unknown'),
        description: '',
        amountInDefaultCurrency,
        exchangeRate,
        source: 'image',
      };

      await this.database.saveExpense(user.id, billEntry);
    }
  }

  /**
   * Detect and handle expense from AI conversation
   */
  async handleExpenseDetection(chatId: number, user: User, detected: any): Promise<void> {
    try {
      // Identify missing information
      const missing: string[] = [];
      if (!detected.amount) missing.push('amount');
      if (!detected.vendor) missing.push('vendor');
      if (!detected.paymentMethod) missing.push('payment method');

      // Handle case where tax mentioned
      const hasTaxMention = detected.hasTaxMention || detected.taxRate !== undefined;

      const detectedCurrency = detected.currency
        ? (detected.currency.toUpperCase() as Currency)
        : (user.default_currency as Currency);

      const stateData = {
        item: detected.item,
        amount: detected.amount,
        currency: detectedCurrency,
        vendor: detected.vendor,
        category: detected.category,
        payment_method: detected.paymentMethod,
        tax_rate: detected.taxRate || 0,
        has_tax: hasTaxMention ? undefined : false, // undefined = need to ask
        missing,
      };

      // If there are missing fields, ask for them first
      if (missing.length > 0) {
        if (!detected.amount) {
          await this.database.setConversationState(user.id, 'awaiting_amount', stateData as any);
          await this.bot.sendMessage(chatId, `How much did you spend on ${detected.item}?`);
        } else if (!detected.vendor) {
          await this.database.setConversationState(user.id, 'awaiting_vendor', stateData as any);
          await this.bot.sendMessage(chatId, `Where did you buy ${detected.item}?`);
        } else {
          await this.database.setConversationState(user.id, 'awaiting_payment', stateData as any);
          await this.bot.sendMessage(chatId, 'How did you pay? (cash, credit card, QR, etc.)');
        }
        return;
      }

      // All basic info available — go straight to confirmation
      const expenseData = {
        item: detected.item,
        amount: detected.amount,
        currency: detectedCurrency,
        vendor: detected.vendor,
        category: detected.category || 'Other',
        payment_method: normalizePaymentMethod(detected.paymentMethod),
        tax_rate: detected.taxRate || 0,
        has_tax: hasTaxMention || false,
        tax_included: true,
      };

      await this.database.setConversationState(user.id, 'awaiting_confirmation', expenseData as any);

      const currency = detectedCurrency || (user.default_currency as Currency) || DEFAULT_CURRENCY;
      const amount = roundAmount(detected.amount, currency);
      const taxInfo = expenseData.tax_rate > 0
        ? `\nTax: ${(expenseData.tax_rate * 100).toFixed(0)}%`
        : '';

      await this.bot.sendMessage(
        chatId,
        `📝 Please confirm:\n\nItem: ${expenseData.item}\nAmount: ${amount} ${currency}${taxInfo}\nVendor: ${expenseData.vendor}\nPayment: ${expenseData.payment_method}\n\nIs this correct? (Yes/No)\n💡 To add/edit tax, reply "tax 10%" or "no tax"`
      );
    } catch (error) {
      console.error('❌ Error handling expense detection:', error);
      notifier.notify('Expense Detection', (error as Error).message, { userId: user.telegram_id, username: user.username, stack: (error as Error).stack });
      await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
    }
  }

  /**
   * Save expense from collected data
   */
  async saveExpenseFromData(user: User, data: any): Promise<void> {
    const currency = (data.currency || user.default_currency || DEFAULT_CURRENCY) as Currency;
    const userCurrency = user.default_currency || DEFAULT_CURRENCY;
    const amount = roundAmount(data.amount, currency);
    const taxRate = data.tax_rate || 0;

    let exchangeRate = 1.0;
    let amountInDefaultCurrency = amount;

    if (currency !== userCurrency) {
      exchangeRate = await this.database.getExchangeRate(currency, userCurrency as Currency);
      const taxMultiplier = 1 + taxRate;
      amountInDefaultCurrency = roundAmount(amount * taxMultiplier * exchangeRate, userCurrency as Currency);
    } else {
      const taxMultiplier = 1 + taxRate;
      amountInDefaultCurrency = roundAmount(amount * taxMultiplier, userCurrency as Currency);
    }

    const billEntry: BillEntry = {
      date: new Date().toISOString().split('T')[0],
      vendor: data.vendor,
      item: data.item,
      category: data.category || 'Other',
      amount,
      currency,
      taxRate,
      paymentMethod: data.payment_method || 'Unknown',
      description: '',
      amountInDefaultCurrency,
      exchangeRate,
      source: 'chat',
    };

    await this.database.saveExpense(user.id, billEntry);
  }

}
