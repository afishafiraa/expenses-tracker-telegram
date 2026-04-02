import TelegramBot from 'node-telegram-bot-api';

const DEV_BOT_TOKEN = process.env.TELEGRAM_DEV_BOT_TOKEN;
const ERROR_CHAT_ID = process.env.ERROR_NOTIFY_CHAT_ID;

/**
 * Sends error notifications to a Telegram chat via the dev bot.
 * Rate-limited to max 1 message per 5 seconds.
 */
export class NotificationService {
  private bot: TelegramBot | null = null;
  private chatId: string | null = null;
  private lastSentAt = 0;
  private queue: string[] = [];
  private sending = false;

  constructor() {
    if (!DEV_BOT_TOKEN || !ERROR_CHAT_ID) {
      console.warn('⚠️ Error notifications disabled (TELEGRAM_DEV_BOT_TOKEN or ERROR_NOTIFY_CHAT_ID not set)');
      return;
    }

    this.bot = new TelegramBot(DEV_BOT_TOKEN);
    this.chatId = ERROR_CHAT_ID;
    console.log('🔔 Error notification service initialized');
  }

  /**
   * Send an error notification
   */
  async notify(
    category: string,
    message: string,
    details?: { userId?: string; username?: string; stack?: string }
  ): Promise<void> {
    if (!this.bot || !this.chatId) return;

    const now = new Date();
    const time = now.toISOString().replace('T', ' ').substring(0, 19);

    let text = `🚨 *BillNot Error*\n\n📂 Category: ${category}\n⏰ Time: ${time}\n❌ Error: ${this.escapeMarkdown(message)}`;

    if (details?.userId || details?.username) {
      const userInfo = details.username ? `@${details.username} (${details.userId})` : details.userId;
      text += `\n👤 User: ${userInfo}`;
    }

    if (details?.stack) {
      const shortStack = details.stack.split('\n').slice(0, 3).join('\n');
      text += `\n\n\`\`\`\n${shortStack}\n\`\`\``;
    }

    this.queue.push(text);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.sending || this.queue.length === 0) return;
    this.sending = true;

    while (this.queue.length > 0) {
      const elapsed = Date.now() - this.lastSentAt;
      if (elapsed < 5000) {
        await new Promise((r) => setTimeout(r, 5000 - elapsed));
      }

      const text = this.queue.shift()!;
      try {
        await this.bot!.sendMessage(this.chatId!, text, { parse_mode: 'Markdown' });
        this.lastSentAt = Date.now();
      } catch (err) {
        console.error('❌ Failed to send error notification:', err);
      }
    }

    this.sending = false;
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }
}

// Singleton instance
export const notifier = new NotificationService();
