import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from '../services/database.service.js';
import { MessageHandler } from './message.handler.js';
import type { User, ConversationState } from '../types.js';
import { normalizeYesNo, getMultiLangMessage } from '../utils/language.js';

/**
 * Handles all confirmation flows
 * - Expense confirmation (yes/no)
 * - Image expense confirmation
 * - Deactivate account confirmation
 */
export class ConfirmationHandler {
  constructor(
    private bot: TelegramBot,
    private database: DatabaseService,
    private messageHandler: MessageHandler
  ) {}

  /**
   * Handle all types of confirmations
   */
  async handleConfirmation(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;

    // Deactivate account confirmation
    if (data.action === 'deactivate') {
      await this.handleDeactivateConfirmation(chatId, user, input);
      return;
    }

    // Image expense confirmation
    if (data.action === 'image_expense') {
      await this.handleImageExpenseConfirmation(chatId, user, data, input);
      return;
    }

    // Regular expense confirmation
    await this.handleExpenseConfirmation(chatId, user, data, input);
  }

  /**
   * Handle expense confirmation (from chat/AI)
   */
  private async handleExpenseConfirmation(
    chatId: number,
    user: User,
    data: any,
    input: string
  ): Promise<void> {
    const response = normalizeYesNo(input);

    if (response === 'yes') {
      // Clear state first to prevent double-confirm
      await this.database.clearConversationState(user.id);
      await this.bot.sendMessage(chatId, '💾 Saving...');
      try {
        await this.messageHandler.saveExpenseFromData(user, data);
        const currency = data.currency || user.default_currency;
        const amount = Math.ceil(data.amount);
        await this.bot.sendMessage(
          chatId,
          `✅ Recorded!\n\n${data.item} - ${amount} ${currency}\nat ${data.vendor}`
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

  /**
   * Handle image expense confirmation
   */
  private async handleImageExpenseConfirmation(
    chatId: number,
    user: User,
    data: any,
    input: string
  ): Promise<void> {
    const response = normalizeYesNo(input);

    if (response === 'yes') {
      // Clear state first to prevent double-confirm
      await this.database.clearConversationState(user.id);
      await this.bot.sendMessage(chatId, '💾 Saving...');
      try {
        await this.messageHandler.saveImageExpense(user, data);

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
  }

  /**
   * Handle account deactivation confirmation
   */
  private async handleDeactivateConfirmation(
    chatId: number,
    user: User,
    input: string
  ): Promise<void> {
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
  }
}
