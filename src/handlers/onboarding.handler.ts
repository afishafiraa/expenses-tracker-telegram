import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from '../services/database.service.js';
import type { User, ConversationState, Currency } from '../types.js';
import { COUNTRY_CURRENCY_MAP, COUNTRY_TIMEZONE_MAP } from '../types.js';

const DEFAULT_CURRENCY: Currency = 'JPY';
const DEFAULT_TIMEZONE = 'Asia/Tokyo';

/**
 * Handles onboarding flow
 * - Nickname input
 * - Country input
 */
export class OnboardingHandler {
  constructor(
    private bot: TelegramBot,
    private database: DatabaseService
  ) {}

  /**
   * Handle nickname input
   */
  async handleNicknameInput(chatId: number, user: User, input: string): Promise<void> {
    const nickname = input.trim();

    await this.database.updateUserProfile(user.id, { nickname });
    await this.database.setConversationState(user.id, 'awaiting_country', {});

    await this.bot.sendMessage(
      chatId,
      `Nice to meet you, ${nickname}! 👋

Which country are you in? This helps me:
• Set your default currency
• Set your timezone

Examples: Japan, Singapore, Indonesia, Vietnam`
    );
  }

  /**
   * Handle country input
   */
  async handleCountryInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const country = input.trim();

    // Try to find matching country and get currency/timezone
    let currency: Currency = DEFAULT_CURRENCY;
    let timezone = DEFAULT_TIMEZONE;

    // Check if country matches known mappings
    const countryKey = Object.keys(COUNTRY_CURRENCY_MAP).find(
      (key) => key.toLowerCase() === country.toLowerCase()
    );

    if (countryKey) {
      currency = COUNTRY_CURRENCY_MAP[countryKey];
      timezone = COUNTRY_TIMEZONE_MAP[countryKey];
    }

    // Update user profile
    await this.database.updateUserProfile(user.id, {
      country,
      default_currency: currency,
      timezone,
      onboarding_completed: true,
    });

    await this.database.clearConversationState(user.id);

    const nickname = user.nickname || user.first_name || 'there';

    await this.bot.sendMessage(
      chatId,
      `🎉 All set, ${nickname}!

📍 Country: ${country}
💰 Default Currency: ${currency}
🕐 Timezone: ${timezone}

You're ready to track expenses! Just send me:
• "lunch 89 at 7-11"
• "taxi 250 baht"
• Or take a photo of your receipt 📸

Let's start! 🚀`
    );
  }
}
