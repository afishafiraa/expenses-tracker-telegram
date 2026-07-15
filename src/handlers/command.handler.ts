import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from '../services/database.service.js';
import { ExportService } from '../services/export.service.js';
import type { User, Currency } from '../types.js';
import { COUNTRY_CURRENCY_MAP, COUNTRY_TIMEZONE_MAP } from '../types.js';

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

export class CommandHandler {
  constructor(
    private bot: TelegramBot,
    private database: DatabaseService,
    private exportService: ExportService
  ) {}

  async handleStart(msg: TelegramBot.Message, user: User): Promise<void> {
    const chatId = msg.chat.id;
    const firstName = msg.from?.first_name || 'there';

    try {
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
• Text: "lunch 89 at 7-11", "buy coffee 300 yen with tax"
• Photo: Send receipt photos
• AI Chat: Talk naturally, I'll detect expenses

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
• /export - Generate quarterly Excel report (try /export prev or /export Q1)
• /cancel - Stop the current action (e.g. a half-entered expense)
• /deactivate - Reset account & delete all data

Need help? Just send me your expenses! 🚀`
    );
  }

  async handleProfile(msg: TelegramBot.Message, user: User): Promise<void> {
    const chatId = msg.chat.id;

    try {
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
• Total spent: ${Math.ceil(stats.totalAmount)} ${currency}
• Member since: ${createdDate}

Use /setcurrency [CODE] to change your default currency.
Example: /setcurrency USD`
      );
    } catch (error) {
      console.error('❌ Error getting profile:', error);
      await this.bot.sendMessage(chatId, "Sorry, I couldn't load your profile. Please try again.");
    }
  }

  async handleSetCurrency(msg: TelegramBot.Message, user: User): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    try {
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

  async handleTotalSpend(msg: TelegramBot.Message, user: User): Promise<void> {
    const chatId = msg.chat.id;

    try {
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
        .map(([currency, data]) => `${currency}: ${Math.ceil(data.total)}`);

      const categoryLines = Object.entries(totals.byCategory)
        .sort(([, a], [, b]) => b.total - a.total)
        .map(([category, data]) => {
          const percentage = ((data.total / totals.total) * 100).toFixed(0);
          const emoji = CATEGORY_EMOJIS[category] || '📦';
          return `${emoji} ${category}: ${Math.ceil(data.total)} ${userCurrency} (${percentage}%)`;
        });

      await this.bot.sendMessage(
        chatId,
        `💰 Your spending for ${monthName}:

Total: ${Math.ceil(totals.total)} ${userCurrency}
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

  async handleExport(msg: TelegramBot.Message, user: User): Promise<void> {
    const chatId = msg.chat.id;

    try {
      const userName = user.nickname || user.first_name || 'User';
      const userCurrency = user.default_currency || DEFAULT_CURRENCY;

      // Parse optional quarter argument: /export Q1, /export prev, /export Q4 2025
      const text = (msg.text || '').trim();
      const parts = text.split(/\s+/).slice(1); // Remove /export
      let targetQuarter: number | undefined;
      let targetYear: number | undefined;

      if (parts.length > 0) {
        const arg = parts[0].toLowerCase();
        if (arg === 'prev' || arg === 'previous') {
          const now = new Date();
          const currentQ = Math.ceil((now.getMonth() + 1) / 3);
          if (currentQ === 1) {
            targetQuarter = 4;
            targetYear = now.getFullYear() - 1;
          } else {
            targetQuarter = currentQ - 1;
            targetYear = now.getFullYear();
          }
        } else {
          const qMatch = arg.match(/^q([1-4])$/);
          if (qMatch) {
            targetQuarter = parseInt(qMatch[1]);
            targetYear = parts[1] ? parseInt(parts[1]) : new Date().getFullYear();
          }
        }
      }

      await this.bot.sendMessage(chatId, '📊 Generating your quarterly expense report...');

      const { filePath, quarterInfo } = await this.exportService.exportToExcel(
        user.id,
        userName,
        userCurrency,
        targetQuarter,
        targetYear
      );

      await this.bot.sendDocument(chatId, filePath, {
        caption: `✅ Your expense report is ready!

📅 Quarter: ${quarterInfo}
📊 File contains one sheet per month with expenses

ℹ️ Note: This report covers a 3-month quarter only. Each quarter (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec) generates a separate report.

💰 You can open this file in Excel or Google Sheets.`,
      });

      console.log(`✅ Excel file sent to user ${user.telegram_id}`);

      const fs = await import('fs/promises');
      try {
        await fs.unlink(filePath);
        console.log(`🗑️ Cleaned up temp file: ${filePath}`);
      } catch {
        console.warn(`⚠️ Could not clean up temp file: ${filePath}`);
      }
    } catch (error) {
      console.error('❌ Error exporting report:', error);
      await this.bot.sendMessage(
        chatId,
        `Sorry, I couldn't generate your expense report. ${(error as Error).message}`
      );
    }
  }

  async handleDeactivate(msg: TelegramBot.Message, user: User): Promise<void> {
    const chatId = msg.chat.id;

    try {
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
}
