import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from '../services/database.service.js';
import { MessageHandler } from './message.handler.js';
import type { User, ConversationState, Currency } from '../types.js';
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
      await this.askRejectionReason(chatId, user, data);
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
      await this.askRejectionReason(chatId, user, data);
    } else {
      await this.bot.sendMessage(chatId, `${getMultiLangMessage('invalid')}\n\nPlease confirm: Yes / No`);
    }
  }

  /**
   * Ask user why they rejected — edit or cancel?
   */
  private async askRejectionReason(
    chatId: number,
    user: User,
    data: any
  ): Promise<void> {
    await this.database.setConversationState(user.id, 'awaiting_rejection_choice', data);
    await this.bot.sendMessage(
      chatId,
      `What would you like to do?\n\n1️⃣ Edit — correct items or details\n2️⃣ Cancel — don't save this receipt\n\nReply 1 or 2`
    );
  }

  /**
   * Handle rejection choice (edit or cancel)
   */
  async handleRejectionChoice(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;
    const choice = input.trim().toLowerCase();

    if (choice === '1' || choice === 'edit') {
      await this.database.setConversationState(user.id, 'awaiting_edit', data);

      // Build numbered item list for reference
      let editGuide = '';
      if (data.items && data.items.length > 0) {
        const itemsList = data.items
          .map((item: any, i: number) => `  ${i + 1}. ${item.item}: ${item.amount} ${item.currency || data.detectedCurrency || ''}`)
          .join('\n');
        editGuide = `\n\nCurrent items:\n${itemsList}\n`;
      }

      await this.bot.sendMessage(
        chatId,
        `✏️ What needs to be corrected?${editGuide}\nExamples:\n• "vendor Daiso Amagasaki"\n• "date 2026-03-31"\n• "item 2 amount 200"\n• "item 3 name Coffee"\n• "remove item 5"\n• "payment cash"\n\nType "done" when finished, or "cancel" to discard.`
      );
    } else if (choice === '2' || choice === 'cancel') {
      await this.database.clearConversationState(user.id);
      await this.bot.sendMessage(chatId, '❌ Cancelled. No expense recorded.');
    } else {
      await this.bot.sendMessage(chatId, 'Please reply 1 (Edit) or 2 (Cancel)');
    }
  }

  /**
   * Handle edit commands from user
   */
  async handleEdit(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;
    const cmd = input.trim().toLowerCase();

    // Cancel editing
    if (cmd === 'cancel') {
      await this.database.clearConversationState(user.id);
      await this.bot.sendMessage(chatId, '❌ Cancelled. No expense recorded.');
      return;
    }

    // Done editing — show updated data for confirmation
    if (cmd === 'done') {
      // Re-enter confirmation state
      await this.database.setConversationState(user.id, 'awaiting_confirmation', data);

      if (data.items && data.items.length > 0) {
        // Image expense — show items list
        const itemsList = data.items
          .map((item: any) => {
            const currency = item.currency || data.detectedCurrency || '';
            const taxDisplay = item.taxRate && item.taxRate > 0 ? ` (Tax: ${(item.taxRate * 100).toFixed(0)}%)` : '';
            return `• ${item.item}: ${item.amount} ${currency}${taxDisplay}`;
          })
          .join('\n');

        await this.bot.sendMessage(
          chatId,
          `📋 Updated expenses:\n\n📅 Date: ${data.date}\n🏪 Vendor: ${data.vendor}\n💳 Payment: ${data.paymentMethod}\n\n${itemsList}\n\nIs this correct now?\n\n${getMultiLangMessage('yes_no')}`
        );
      } else {
        // Chat expense — show single item
        const currency = data.currency || user.default_currency;
        const amount = Math.ceil(data.amount);
        await this.bot.sendMessage(
          chatId,
          `📋 Updated expense:\n\n${data.item} - ${amount} ${currency}\nat ${data.vendor}\n\nIs this correct now?\n\n${getMultiLangMessage('yes_no')}`
        );
      }
      return;
    }

    // Parse edit commands
    try {
      const edited = this.applyEdit(data, input.trim());
      if (edited) {
        await this.database.setConversationState(user.id, 'awaiting_edit', data);
        await this.bot.sendMessage(chatId, `✅ ${edited}\n\nAnything else to edit? Type "done" when finished.`);
      } else {
        await this.bot.sendMessage(
          chatId,
          `❓ I didn't understand that edit. Try:\n• "vendor [name]"\n• "date [YYYY-MM-DD]"\n• "item [number] amount [value]"\n• "item [number] name [name]"\n• "remove item [number]"\n• "payment [method]"`
        );
      }
    } catch (error) {
      await this.bot.sendMessage(chatId, `❌ ${(error as Error).message}`);
    }
  }

  /**
   * Apply a single edit command to the data
   */
  private applyEdit(data: any, input: string): string | null {
    // Edit vendor
    const vendorMatch = input.match(/^vendor\s+(.+)/i);
    if (vendorMatch) {
      data.vendor = vendorMatch[1].trim();
      return `Vendor updated to "${data.vendor}"`;
    }

    // Edit date
    const dateMatch = input.match(/^date\s+(\d{4}-\d{2}-\d{2})/i);
    if (dateMatch) {
      data.date = dateMatch[1];
      return `Date updated to ${data.date}`;
    }

    // Edit payment
    const paymentMatch = input.match(/^payment\s+(.+)/i);
    if (paymentMatch) {
      const method = paymentMatch[1].trim();
      if (data.paymentMethod !== undefined) {
        data.paymentMethod = method;
      } else {
        data.payment_method = method;
      }
      return `Payment updated to "${method}"`;
    }

    // Edit single-item expense amount
    const amountMatch = input.match(/^amount\s+([\d,.]+)/i);
    if (amountMatch && !data.items) {
      data.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      return `Amount updated to ${data.amount}`;
    }

    // Remove item by number
    const removeMatch = input.match(/^remove\s+item\s+(\d+)/i);
    if (removeMatch && data.items) {
      const idx = parseInt(removeMatch[1]) - 1;
      if (idx < 0 || idx >= data.items.length) {
        throw new Error(`Item ${removeMatch[1]} doesn't exist. You have ${data.items.length} items.`);
      }
      const removed = data.items.splice(idx, 1)[0];
      return `Removed "${removed.item}"`;
    }

    // Edit item field: "item 2 amount 200" or "item 3 name Coffee"
    const itemEditMatch = input.match(/^item\s+(\d+)\s+(amount|name|category)\s+(.+)/i);
    if (itemEditMatch && data.items) {
      const idx = parseInt(itemEditMatch[1]) - 1;
      const field = itemEditMatch[2].toLowerCase();
      const value = itemEditMatch[3].trim();

      if (idx < 0 || idx >= data.items.length) {
        throw new Error(`Item ${itemEditMatch[1]} doesn't exist. You have ${data.items.length} items.`);
      }

      const item = data.items[idx];
      if (field === 'amount') {
        item.amount = parseFloat(value.replace(/,/g, ''));
        return `Item ${idx + 1} amount updated to ${item.amount}`;
      } else if (field === 'name') {
        item.item = value;
        return `Item ${idx + 1} name updated to "${value}"`;
      } else if (field === 'category') {
        item.category = value;
        return `Item ${idx + 1} category updated to "${value}"`;
      }
    }

    return null;
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
