import TelegramBot from 'node-telegram-bot-api';
import { GeminiService } from '../services/gemini.service.js';
import { DatabaseService } from '../services/database.service.js';
import { ExportService } from '../services/export.service.js';
import { ConversationService } from '../services/conversation.service.js';
import type { BillEntry, User, ConversationState, Currency } from '../types.js';
import {
  COUNTRY_CURRENCY_MAP,
  COUNTRY_TIMEZONE_MAP,
} from '../types.js';
import { normalizePaymentMethod } from '../utils/payment.js';
import { extractVendorName } from '../utils/vendor.js';
import {
  normalizeYesNo,
  normalizeTaxTiming,
  isCancelIntent,
  getMultiLangMessage,
} from '../utils/language.js';

const DEFAULT_CURRENCY: Currency = 'JPY';
const DEFAULT_TIMEZONE = 'Asia/Tokyo';

const CATEGORY_EMOJIS: Record<string, string> = {
  Food: '🍔',
  Transport: '🚗',
  Utilities: '💡',
  Rent: '🏠',
  Subscription: '📱',
  Shopping: '🛒',
  Entertainment: '🎬',
  Healthcare: '🏥',
  Other: '📦',
};

export class BotController {
  private bot: TelegramBot;
  private gemini: GeminiService;
  private database: DatabaseService;
  private exportService: ExportService;
  private conversation: ConversationService;

  constructor(bot: TelegramBot) {
    this.bot = bot;
    this.gemini = new GeminiService();
    this.database = new DatabaseService();
    this.exportService = new ExportService(this.database);
    this.conversation = new ConversationService();
  }

  // ========================================
  // Command Handlers
  // ========================================

  async handleStart(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const firstName = msg.from?.first_name || 'there';

    try {
      const user = await this.getUser(msg);

      if (!user.onboarding_completed) {
        await this.database.clearConversationState(user.id);
        await this.database.setConversationState(user.id, 'awaiting_nickname', {});

        await this.bot.sendMessage(
          chatId,
          `👋 Hi ${firstName}! Welcome to BillNot!

I help you track your expenses automatically with AI.

Before we start, let me get to know you better!

What should I call you? (nickname)`
        );
        return;
      }

      await this.database.clearConversationState(user.id);
      const nickname = user.nickname || firstName;

      await this.bot.sendMessage(
        chatId,
        `👋 Welcome back, ${nickname}!

I help you track your expenses automatically.

📝 How to use:
• Send me text: "grab 185 to office"
• Send me a photo of your receipt/bill
• Chat with me: "hi i just bought taiyaki 110 yen"
• I'll extract the details and save them

Commands:
/totalspend - Show monthly spending
/export - Generate Google Sheet
/help - Show available commands

Let's track your expenses! 💰`
      );
    } catch (error) {
      console.error('❌ Error in /start:', error);
      await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
    }
  }

  async handleHelp(msg: TelegramBot.Message): Promise<void> {
    await this.bot.sendMessage(
      msg.chat.id,
      `📖 BillNot Commands:

💬 Record expenses:
• Text: "grab 185 to office"
• Text: "lunch 89 at 7-11"
• Photo: Send receipt/invoice photo

📊 Commands:
• /totalspend - Show monthly total & breakdown
• /profile - View your profile & stats
• /setcurrency [CODE] - Change default currency
• /export - Generate Google Sheet with all expenses
• /deactivate - Reset account & delete all data

Need help? Just send me your expenses! 🚀`
    );
  }

  async handleDeactivate(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    try {
      const user = await this.getUser(msg);

      await this.bot.sendMessage(
        chatId,
        `⚠️ WARNING: This will permanently delete:

• All your expense records
• Your profile settings (nickname, country, currency)
• All exported sheets history

This action CANNOT be undone!

To confirm, type: DELETE ALL DATA
To cancel, type anything else or ignore this message.`
      );

      await this.database.setConversationState(
        user.id,
        'awaiting_confirmation',
        { action: 'deactivate' } as any
      );
    } catch (error) {
      console.error('❌ Error in /deactivate:', error);
      await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
    }
  }

  async handleExport(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    try {
      await this.bot.sendMessage(chatId, '📊 Generating your quarterly expense report...');

      const user = await this.getUser(msg);
      const userName = user.nickname || user.first_name || 'User';
      const userCurrency = user.default_currency || DEFAULT_CURRENCY;

      // Generate Excel file
      const { filePath, quarterInfo } = await this.exportService.exportToExcel(
        user.id,
        userName,
        userCurrency
      );

      // Send file to user with quarterly explanation
      await this.bot.sendDocument(chatId, filePath, {
        caption: `✅ Your expense report is ready!

📅 Quarter: ${quarterInfo}
📊 File contains one sheet per month with expenses

ℹ️ Note: This report covers a 3-month quarter only. Each quarter (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec) generates a separate report.

💰 You can open this file in Excel or Google Sheets.`,
      });

      console.log(`✅ Excel file sent to user ${user.telegram_id}`);

      // Clean up file after sending
      const fs = await import('fs');
      fs.unlinkSync(filePath);
      console.log(`🗑️ Cleaned up temp file: ${filePath}`);
    } catch (error) {
      console.error('❌ Error exporting report:', error);
      await this.bot.sendMessage(
        chatId,
        `Sorry, I couldn't generate your expense report. ${(error as Error).message}`
      );
    }
  }

  async handleTotalSpend(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    try {
      const user = await this.getUser(msg);
      const now = new Date();
      const monthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
      const totals = await this.database.getMonthlyTotal(user.id);
      const userCurrency = user.default_currency || DEFAULT_CURRENCY;

      if (totals.count === 0) {
        await this.bot.sendMessage(
          chatId,
          `📊 No expenses recorded for ${monthName} yet.\n\nStart tracking by sending me your expenses!`
        );
        return;
      }

      const currencyLines = Object.entries(totals.byCurrency)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([currency, data]) => `${currency}: ${data.total.toFixed(2)}`);

      const categoryLines = Object.entries(totals.byCategory)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([category, data]) => {
          const percentage = ((data.total / totals.total) * 100).toFixed(0);
          const emoji = CATEGORY_EMOJIS[category] || '📦';
          return `${emoji} ${category}: ${data.total.toFixed(2)} ${userCurrency} (${percentage}%)`;
        });

      await this.bot.sendMessage(
        chatId,
        `💰 Your spending for ${monthName}:

Total: ${totals.total.toFixed(2)} ${userCurrency}
Entries: ${totals.count}

By Currency:
${currencyLines.join('\n')}

Breakdown:
${categoryLines.join('\n')}`
      );
    } catch (error) {
      console.error('❌ Error getting total spend:', error);
      await this.bot.sendMessage(chatId, "Sorry, I couldn't calculate your total. Please try again.");
    }
  }

  async handleProfile(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;

    try {
      const user = await this.getUser(msg);
      const stats = await this.database.getUserStats(user.id);

      const nickname = user.nickname || user.first_name || 'User';
      const country = user.country || 'Not set';
      const currency = user.default_currency || DEFAULT_CURRENCY;
      const timezone = user.timezone || DEFAULT_TIMEZONE;
      const createdDate = new Date(user.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      await this.bot.sendMessage(
        chatId,
        `👤 Your Profile

📝 Personal Info:
• Name: ${nickname}
• Country: ${country}
• Currency: ${currency}
• Timezone: ${timezone}

📊 Statistics:
• Total expenses: ${stats.totalExpenses}
• Total spent: ${stats.totalAmount.toFixed(2)} ${currency}
• Member since: ${createdDate}

Use /setcurrency [CODE] to change your default currency.
Example: /setcurrency USD`
      );
    } catch (error) {
      console.error('❌ Error getting profile:', error);
      await this.bot.sendMessage(chatId, "Sorry, I couldn't load your profile. Please try again.");
    }
  }

  async handleSetCurrency(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    try {
      const user = await this.getUser(msg);

      // Extract currency code from command
      const parts = text.split(/\s+/);
      if (parts.length < 2) {
        await this.bot.sendMessage(
          chatId,
          `⚠️ Please specify a currency code.

Usage: /setcurrency [CODE]

Supported currencies:
THB, JPY, SGD, MYR, IDR, PHP, VND, KRW, CNY, HKD, TWD, INR, USD

Example: /setcurrency USD`
        );
        return;
      }

      const currencyCode = parts[1].toUpperCase() as Currency;

      // Validate currency
      const supportedCurrencies: Currency[] = [
        'THB', 'JPY', 'SGD', 'MYR', 'IDR',
        'PHP', 'VND', 'KRW', 'CNY', 'HKD',
        'TWD', 'INR', 'USD'
      ];

      if (!supportedCurrencies.includes(currencyCode)) {
        await this.bot.sendMessage(
          chatId,
          `❌ Currency "${currencyCode}" is not supported.

Supported currencies:
${supportedCurrencies.join(', ')}

Example: /setcurrency USD`
        );
        return;
      }

      // Update user's default currency
      await this.database.updateUserProfile(user.id, {
        default_currency: currencyCode,
      });

      await this.bot.sendMessage(
        chatId,
        `✅ Default currency updated to ${currencyCode}!

All new expenses will be converted to ${currencyCode} for your total calculations.`
      );
    } catch (error) {
      console.error('❌ Error setting currency:', error);
      await this.bot.sendMessage(chatId, "Sorry, I couldn't update your currency. Please try again.");
    }
  }

  // ========================================
  // Message Handler
  // ========================================

  async handleMessage(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text?.startsWith('/')) return;

    try {
      const user = await this.getUser(msg);
      const conversationState = await this.database.getConversationState(user.id);

      // Handle active conversation states (onboarding, expense collection, etc.)
      if (conversationState && text) {
        await this.handleConversationState(chatId, user, conversationState, text);
        return;
      }

      // Handle text messages via conversational AI
      if (text) {
        await this.handleTextMessage(chatId, user, text);
        return;
      }

      // Handle photo messages
      if (msg.photo) {
        await this.handlePhotoMessage(chatId, user, msg);
        return;
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
      await this.bot.sendMessage(chatId, 'Sorry, I encountered an error. Please try again.');
    }
  }

  // ========================================
  // Conversation State Handler
  // ========================================

  private async handleConversationState(
    chatId: number,
    user: User,
    state: ConversationState,
    text: string
  ): Promise<void> {
    const input = text.trim();

    switch (state.state) {
      case 'awaiting_nickname':
        await this.handleNicknameInput(chatId, user, input);
        break;

      case 'awaiting_country':
        await this.handleCountryInput(chatId, user, state, input);
        break;

      case 'awaiting_amount':
        await this.handleAmountInput(chatId, user, state, input);
        break;

      case 'awaiting_vendor':
        await this.handleVendorInput(chatId, user, state, input);
        break;

      case 'awaiting_payment':
        await this.handlePaymentInput(chatId, user, state, input);
        break;

      case 'awaiting_tax_inclusion':
        await this.handleTaxInclusionInput(chatId, user, state, input);
        break;

      case 'awaiting_tax_timing':
        await this.handleTaxTimingInput(chatId, user, state, input);
        break;

      case 'awaiting_confirmation':
        await this.handleConfirmationInput(chatId, user, state, input);
        break;

      default:
        await this.database.clearConversationState(user.id);
        await this.bot.sendMessage(chatId, 'Something went wrong. Please send /start to begin again.');
    }
  }

  // ========================================
  // Onboarding Handlers
  // ========================================

  private async handleNicknameInput(chatId: number, user: User, nickname: string): Promise<void> {
    await this.database.updateUserProfile(user.id, { nickname });
    await this.database.setConversationState(user.id, 'awaiting_country', { nickname } as any);

    await this.bot.sendMessage(
      chatId,
      `Nice to meet you, ${nickname}! 😊

Which country are you in?

🌏 Common countries:
🇯🇵 Japan
🇹🇭 Thailand
🇸🇬 Singapore
🇲🇾 Malaysia
🇮🇩 Indonesia
🇵🇭 Philippines
🇻🇳 Vietnam
🇰🇷 South Korea
🇨🇳 China
🇭🇰 Hong Kong
🇹🇼 Taiwan
🇮🇳 India

Just type your country name:`
    );
  }

  private async handleCountryInput(
    chatId: number,
    user: User,
    state: ConversationState,
    country: string
  ): Promise<void> {
    const currency = COUNTRY_CURRENCY_MAP[country] || DEFAULT_CURRENCY;
    const timezone = COUNTRY_TIMEZONE_MAP[country] || DEFAULT_TIMEZONE;

    await this.database.updateUserProfile(user.id, {
      country,
      default_currency: currency,
      timezone,
      onboarding_completed: true,
    });

    await this.database.clearConversationState(user.id);

    const nickname = state.data.nickname || user.first_name;
    await this.bot.sendMessage(
      chatId,
      `Perfect! ✅

Your settings:
📍 Country: ${country}
💰 Default currency: ${currency}
🕐 Timezone: ${timezone}

All set, ${nickname}! 🎉

You can now:
• Send me text: "grab 185 to office"
• Send me a photo of your receipt/bill
• Chat naturally: "hi i just bought taiyaki 110 yen"

Commands:
/totalspend - Monthly spending summary
/export - Generate Google Sheet
/help - Show all commands

Try sending me an expense now! 💬`
    );
  }

  // ========================================
  // Expense Collection Handlers
  // ========================================

  private async handleAmountInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;

    if (!data.amount) {
      const amountMatch = input.match(/\d+(\.\d+)?/);
      if (!amountMatch) {
        await this.bot.sendMessage(chatId, "Sorry, I didn't get that. How much did it cost? (just the number)");
        return;
      }

      data.amount = parseFloat(amountMatch[0]);
      data.missing = (data.missing || []).filter((m: string) => m !== 'amount');
    }

    if (!data.vendor) {
      await this.database.setConversationState(user.id, 'awaiting_vendor', data);
      await this.bot.sendMessage(chatId, 'Where did you buy it?');
    } else if (!data.payment_method) {
      await this.database.setConversationState(user.id, 'awaiting_payment', data);
      await this.bot.sendMessage(chatId, 'How did you pay?');
    } else {
      await this.askExpenseConfirmation(chatId, user, data);
    }
  }

  private async handleVendorInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;
    // Extract vendor name, removing prepositions like "at", "in", "on" and Japanese particles
    data.vendor = extractVendorName(input);
    data.missing = (data.missing || []).filter((m: string) => m !== 'vendor');

    if (!data.payment_method) {
      await this.database.setConversationState(user.id, 'awaiting_payment', data);
      await this.bot.sendMessage(chatId, 'How did you pay?');
    } else {
      await this.askExpenseConfirmation(chatId, user, data);
    }
  }

  private async handlePaymentInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;
    data.payment_method = normalizePaymentMethod(input);
    data.missing = (data.missing || []).filter((m: string) => m !== 'payment method');

    // Check if we need to ask about tax
    if (data.tax_rate && data.tax_rate > 0 && data.has_tax === undefined) {
      await this.database.setConversationState(user.id, 'awaiting_tax_inclusion', data);
      await this.bot.sendMessage(
        chatId,
        `Does this purchase include tax?\n\n${getMultiLangMessage('yes_no')}`
      );
    } else {
      await this.askExpenseConfirmation(chatId, user, data);
    }
  }

  private async handleTaxInclusionInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;

    // Check for cancel intent
    if (isCancelIntent(input)) {
      data.has_tax = false;
      data.tax_rate = 0;
      await this.askExpenseConfirmation(chatId, user, data);
      return;
    }

    const response = normalizeYesNo(input);

    if (response === 'yes') {
      data.has_tax = true;
      await this.database.setConversationState(user.id, 'awaiting_tax_timing', data);
      await this.bot.sendMessage(chatId, getMultiLangMessage('tax_timing'));
    } else if (response === 'no') {
      data.has_tax = false;
      data.tax_rate = 0;
      await this.askExpenseConfirmation(chatId, user, data);
    } else {
      await this.bot.sendMessage(
        chatId,
        `${getMultiLangMessage('invalid')}\n\n${getMultiLangMessage('yes_no')}`
      );
    }
  }

  private async handleTaxTimingInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;

    // Check for cancel intent
    if (isCancelIntent(input)) {
      data.has_tax = false;
      data.tax_rate = 0;
      await this.askExpenseConfirmation(chatId, user, data);
      return;
    }

    const response = normalizeTaxTiming(input);

    if (response === 'before') {
      data.tax_included = false;
      // Amount is before tax, no adjustment needed
      await this.bot.sendMessage(
        chatId,
        `✅ Got it! Price is before tax.\nFinal amount: ${(data.amount * (1 + data.tax_rate)).toFixed(2)} ${data.currency}`
      );
      await this.askExpenseConfirmation(chatId, user, data);
    } else if (response === 'after') {
      data.tax_included = true;
      // Amount includes tax, calculate base price
      const basePrice = data.amount / (1 + data.tax_rate);
      const originalAmount = data.amount;
      data.amount = basePrice;
      await this.bot.sendMessage(
        chatId,
        `✅ Got it! Price is after tax.\nBase price: ${basePrice.toFixed(2)} ${data.currency}\nTotal paid: ${originalAmount.toFixed(2)} ${data.currency}`
      );
      await this.askExpenseConfirmation(chatId, user, data);
    } else {
      await this.bot.sendMessage(
        chatId,
        `${getMultiLangMessage('invalid')}\n\n${getMultiLangMessage('tax_timing')}`
      );
    }
  }

  private async handleConfirmationInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;

    if (data.action === 'deactivate') {
      if (input === 'DELETE ALL DATA') {
        await this.bot.sendMessage(chatId, '⏳ Deleting all your data...');
        try {
          await this.database.deleteUser(user.id);
          await this.bot.sendMessage(
            chatId,
            `✅ All data deleted successfully.\n\nYour account has been reset. You can start fresh anytime by sending /start.\n\nThank you for using BillNot! 👋`
          );
        } catch (error) {
          console.error('❌ Error deleting user data:', error);
          await this.bot.sendMessage(chatId, '❌ Failed to delete data. Please try again or contact support.');
        }
      } else {
        await this.database.clearConversationState(user.id);
        await this.bot.sendMessage(chatId, '✅ Deactivation cancelled. Your data is safe!');
      }
      return;
    }

    // Image expense confirmation
    if (data.action === 'image_expense') {
      const response = normalizeYesNo(input);

      if (response === 'yes') {
        await this.bot.sendMessage(chatId, '💾 Saving...');
        try {
          await this.saveImageExpense(user, data);
          await this.database.clearConversationState(user.id);

          const count = data.items.length;
          await this.bot.sendMessage(
            chatId,
            `✅ Recorded ${count} item${count > 1 ? 's' : ''} from ${data.vendor}!`
          );
        } catch (error) {
          console.error('❌ Error saving image expense:', error);
          await this.bot.sendMessage(chatId, '❌ Failed to save. Please try again.');
        }
      } else if (response === 'no') {
        await this.database.clearConversationState(user.id);
        await this.bot.sendMessage(chatId, '❌ Cancelled. No expense recorded.');
      } else {
        await this.bot.sendMessage(chatId, `${getMultiLangMessage('invalid')}\n\nPlease confirm: Yes / No`);
      }
      return;
    }

    // Chat expense confirmation
    const response = normalizeYesNo(input);

    if (response === 'yes') {
      await this.bot.sendMessage(chatId, '💾 Saving...');
      try {
        await this.saveExpenseFromData(user, data);
        await this.database.clearConversationState(user.id);
        const currency = data.currency || user.default_currency;
        await this.bot.sendMessage(
          chatId,
          `✅ Recorded!\n\n${data.item} - ${data.amount} ${currency}\nat ${data.vendor}`
        );
      } catch (error) {
        console.error('❌ Error saving expense:', error);
        await this.bot.sendMessage(chatId, '❌ Failed to save. Please try again.');
      }
    } else if (response === 'no') {
      await this.database.clearConversationState(user.id);
      await this.bot.sendMessage(chatId, '❌ Cancelled. No expense recorded.');
    } else {
      await this.bot.sendMessage(chatId, `${getMultiLangMessage('invalid')}\n\nPlease confirm: Yes / No`);
    }
  }

  // ========================================
  // Text & Photo Message Handlers
  // ========================================

  private async handleTextMessage(chatId: number, user: User, text: string): Promise<void> {
    console.log(`\n📨 Received from user ${user.telegram_id}: "${text}"`);

    if (!user.onboarding_completed) {
      await this.bot.sendMessage(chatId, 'Please complete onboarding first by sending /start');
      return;
    }

    const chatResult = await this.conversation.chat(text, {
      userName: user.nickname || user.first_name || 'there',
      userCurrency: (user.default_currency as Currency) || DEFAULT_CURRENCY,
    });

    await this.bot.sendMessage(chatId, chatResult.reply);

    if (chatResult.expenseDetected?.isExpense) {
      await this.handleExpenseDetection(chatId, user, chatResult.expenseDetected);
    }
  }

  private async handlePhotoMessage(
    chatId: number,
    user: User,
    msg: TelegramBot.Message
  ): Promise<void> {
    console.log(`\n📸 Received photo from user ${user.telegram_id}`);

    try {
      await this.bot.sendMessage(chatId, '📸 Reading your receipt...');

      const photo = msg.photo![msg.photo!.length - 1];
      const fileLink = await this.bot.getFileLink(photo.file_id);
      console.log('📥 Downloading photo from:', fileLink);

      const response = await fetch(fileLink);
      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');

      const extracted = await this.gemini.extractBillFromImage(base64);

      if (!extracted) {
        await this.bot.sendMessage(
          chatId,
          "Sorry, I couldn't read the invoice. Could you send a clearer photo or type the details?"
        );
        return;
      }

      const userCurrency = user.default_currency || DEFAULT_CURRENCY;
      const detectedCurrency = extracted.detectedCurrency || userCurrency;

      // Build items summary for confirmation
      const itemLines = extracted.items.map((item) => {
        const itemCurrency = item.currency || detectedCurrency;
        const taxInfo = item.taxRate > 0 ? ` +${(item.taxRate * 100).toFixed(0)}% tax` : '';
        return `  • ${item.item} - ${item.amount} ${itemCurrency}${taxInfo} (${item.category})`;
      });

      const totalAmount = extracted.items.reduce(
        (sum, item) => sum + item.amount * (1 + (item.taxRate || 0)),
        0
      );

      // Store extracted data in conversation state for confirmation
      const normalizedPayment = normalizePaymentMethod(extracted.paymentMethod);
      await this.database.setConversationState(user.id, 'awaiting_confirmation', {
        action: 'image_expense',
        source: 'image',
        date: extracted.date,
        vendor: extracted.vendor,
        detectedCurrency,
        paymentMethod: normalizedPayment,
        items: extracted.items,
      } as any);

      await this.bot.sendMessage(
        chatId,
        `I found this from your receipt:

🏪 Vendor: ${extracted.vendor}
📅 Date: ${extracted.date}
💳 Payment: ${normalizedPayment}

Items:
${itemLines.join('\n')}

💰 Total: ${totalAmount.toFixed(2)} ${detectedCurrency}

Should I record this? Reply "yes" to confirm or "no" to cancel.`
      );
    } catch (error) {
      console.error('❌ Error processing photo:', error);
      await this.bot.sendMessage(chatId, 'Sorry, I encountered an error processing the photo. Please try again.');
    }
  }

  // ========================================
  // Expense Helpers
  // ========================================

  private async handleExpenseDetection(chatId: number, user: User, detected: any): Promise<void> {
    try {
      const missing: string[] = [];
      if (!detected.amount) missing.push('amount');
      if (!detected.vendor) missing.push('vendor');
      if (!detected.paymentMethod) missing.push('payment method');

      if (missing.length > 0) {
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
          missing,
        };

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

      // All info available
      const detectedCurrency = detected.currency
        ? (detected.currency.toUpperCase() as Currency)
        : (user.default_currency as Currency);

      const expenseData = {
        item: detected.item,
        amount: detected.amount,
        currency: detectedCurrency,
        vendor: detected.vendor,
        category: detected.category || 'Other',
        payment_method: normalizePaymentMethod(detected.paymentMethod),
        tax_rate: detected.taxRate || 0,
      };

      // Check if tax mentioned - ask for clarification
      if (expenseData.tax_rate > 0) {
        await this.database.setConversationState(user.id, 'awaiting_tax_inclusion', expenseData as any);
        await this.bot.sendMessage(
          chatId,
          `Does this purchase include tax?\n\n${getMultiLangMessage('yes_no')}`
        );
      } else {
        await this.askExpenseConfirmation(chatId, user, expenseData);
      }
    } catch (error) {
      console.error('❌ Error handling expense detection:', error);
      await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
    }
  }

  private async askExpenseConfirmation(chatId: number, user: User, data: any): Promise<void> {
    await this.database.setConversationState(user.id, 'awaiting_confirmation', data);

    const currency = data.currency || user.default_currency;
    await this.bot.sendMessage(
      chatId,
      `Should I record this expense?

📝 Item: ${data.item}
💰 Amount: ${data.amount} ${currency}
🏪 Vendor: ${data.vendor}
📁 Category: ${data.category || 'Other'}
💳 Payment: ${data.payment_method}

Reply "yes" to confirm or "no" to cancel.`
    );
  }

  private async saveImageExpense(user: User, data: any): Promise<void> {
    const userCurrency = user.default_currency || DEFAULT_CURRENCY;
    const detectedCurrency = data.detectedCurrency || userCurrency;

    for (const item of data.items) {
      const itemCurrency = item.currency || detectedCurrency;
      const amount = item.amount;
      const taxRate = item.taxRate || 0;
      const amountAfterTax = amount * (1 + taxRate);

      let exchangeRate = 1.0;
      let amountInDefaultCurrency = amountAfterTax;

      if (itemCurrency !== userCurrency) {
        exchangeRate = await this.database.getExchangeRate(
          itemCurrency as Currency,
          userCurrency as Currency
        );
        amountInDefaultCurrency = amountAfterTax * exchangeRate;
      }

      const bill: BillEntry = {
        date: data.date,
        vendor: data.vendor,
        item: item.item,
        category: item.category as any,
        amount,
        currency: itemCurrency as Currency,
        taxRate,
        paymentMethod: data.paymentMethod,
        description: item.description,
        amountInDefaultCurrency,
        exchangeRate,
        source: 'image',
      };

      await this.database.saveExpense(user.id, bill);
    }
  }

  private async saveExpenseFromData(user: User, data: any): Promise<void> {
    const userCurrency = user.default_currency || DEFAULT_CURRENCY;
    const expenseCurrency = data.currency || userCurrency;
    const amount = parseFloat(data.amount);
    const taxRate = 0;
    const amountAfterTax = amount * (1 + taxRate);

    let exchangeRate = 1.0;
    let amountInDefaultCurrency = amountAfterTax;

    if (expenseCurrency !== userCurrency) {
      exchangeRate = await this.database.getExchangeRate(
        expenseCurrency as Currency,
        userCurrency as Currency
      );
      amountInDefaultCurrency = amountAfterTax * exchangeRate;
    }

    const bill: BillEntry = {
      date: new Date().toISOString().split('T')[0],
      vendor: data.vendor,
      item: data.item,
      category: data.category || 'Other',
      amount,
      currency: expenseCurrency as Currency,
      taxRate,
      paymentMethod: data.payment_method,
      description: data.description || '',
      amountInDefaultCurrency,
      exchangeRate,
      source: 'chat',
    };

    await this.database.saveExpense(user.id, bill);
  }

  // ========================================
  // Utility
  // ========================================

  private async getUser(msg: TelegramBot.Message): Promise<User> {
    const telegramId = msg.from?.id.toString() || 'unknown';
    return this.database.getOrCreateUser(
      telegramId,
      msg.from?.username,
      msg.from?.first_name
    );
  }
}
