import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from '../services/database.service.js';
import type { User, ConversationState, Currency } from '../types.js';
import { normalizePaymentMethod } from '../utils/payment.js';
import { extractVendorName } from '../utils/vendor.js';
import {
  normalizeYesNo,
  normalizeTaxTiming,
  isCancelIntent,
  getMultiLangMessage,
} from '../utils/language.js';

const DEFAULT_CURRENCY: Currency = 'JPY';

/**
 * Handles all expense-related conversation flows
 * - Amount input
 * - Vendor input
 * - Payment method input
 * - Tax inclusion questions
 * - Tax timing (before/after)
 */
export class ExpenseHandler {
  constructor(
    private bot: TelegramBot,
    private database: DatabaseService
  ) {}

  /**
   * Handle amount input
   */
  async handleAmountInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;

    // Extract number from input
    const amountMatch = input.match(/\d+(\.\d+)?/);
    if (!amountMatch) {
      await this.bot.sendMessage(chatId, "Sorry, I didn't get that. How much did it cost? (just the number)");
      return;
    }

    data.amount = parseFloat(amountMatch[0]);
    data.missing = (data.missing || []).filter((m: string) => m !== 'amount');

    // Check if tax rate mentioned but amount not specified
    const taxMatch = input.match(/tax\s+(\d+)/i) || input.match(/(\d+)%/);
    if (taxMatch && !data.tax_rate) {
      data.tax_rate = parseFloat(taxMatch[1]) / 100;
    }

    // Continue to next missing field
    if (!data.vendor) {
      await this.database.setConversationState(user.id, 'awaiting_vendor', data);
      await this.bot.sendMessage(chatId, 'Where did you buy it?');
    } else if (!data.payment_method) {
      await this.database.setConversationState(user.id, 'awaiting_payment', data);
      await this.bot.sendMessage(chatId, 'How did you pay?');
    } else if (data.has_tax === undefined || data.has_tax === false) {
      // Always ask about tax if not yet answered
      data.has_tax = undefined;
      await this.database.setConversationState(user.id, 'awaiting_tax_inclusion', data);
      await this.bot.sendMessage(
        chatId,
        `Does this purchase include tax?\n\n${getMultiLangMessage('yes_no')}`
      );
    } else {
      // All info collected
      await this.database.setConversationState(user.id, 'awaiting_confirmation', data);
      await this.sendConfirmation(chatId, user, data);
    }
  }

  /**
   * Handle vendor/merchant input
   */
  async handleVendorInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;
    data.vendor = extractVendorName(input);
    data.missing = (data.missing || []).filter((m: string) => m !== 'vendor');

    if (!data.payment_method) {
      await this.database.setConversationState(user.id, 'awaiting_payment', data);
      await this.bot.sendMessage(chatId, 'How did you pay?');
    } else if (data.has_tax === undefined || data.has_tax === false) {
      // Always ask about tax if not yet answered
      data.has_tax = undefined;
      await this.database.setConversationState(user.id, 'awaiting_tax_inclusion', data);
      await this.bot.sendMessage(
        chatId,
        `Does this purchase include tax?\n\n${getMultiLangMessage('yes_no')}`
      );
    } else {
      await this.database.setConversationState(user.id, 'awaiting_confirmation', data);
      await this.sendConfirmation(chatId, user, data);
    }
  }

  /**
   * Handle payment method input
   */
  async handlePaymentInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;
    data.payment_method = normalizePaymentMethod(input);
    data.missing = (data.missing || []).filter((m: string) => m !== 'payment method');

    // Always ask about tax if not yet answered
    if (data.has_tax === undefined || data.has_tax === false) {
      data.has_tax = undefined;
      await this.database.setConversationState(user.id, 'awaiting_tax_inclusion', data);
      await this.bot.sendMessage(
        chatId,
        `Does this purchase include tax?\n\n${getMultiLangMessage('yes_no')}`
      );
    } else {
      await this.database.setConversationState(user.id, 'awaiting_confirmation', data);
      await this.sendConfirmation(chatId, user, data);
    }
  }

  /**
   * Handle tax inclusion question (does it include tax?)
   */
  async handleTaxInclusionInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;

    if (isCancelIntent(input)) {
      data.has_tax = false;
      data.tax_rate = 0;
      await this.database.setConversationState(user.id, 'awaiting_confirmation', data);
      await this.sendConfirmation(chatId, user, data);
      return;
    }

    const response = normalizeYesNo(input);

    if (response === 'yes') {
      data.has_tax = true;

      // If tax rate not specified, ask for it
      if (!data.tax_rate || data.tax_rate === 0) {
        await this.database.setConversationState(user.id, 'awaiting_tax_rate', data);
        await this.bot.sendMessage(
          chatId,
          `What's the tax rate?\n\nExamples:\n• 8% (8 percent)\n• 10% (10 percent)\n• 0.08 (8 percent)`
        );
        return;
      }

      // Tax rate exists, ask if before/after
      await this.database.setConversationState(user.id, 'awaiting_tax_timing', data);
      await this.bot.sendMessage(chatId, getMultiLangMessage('tax_timing'));
    } else if (response === 'no') {
      data.has_tax = false;
      data.tax_rate = 0;
      await this.database.setConversationState(user.id, 'awaiting_confirmation', data);
      await this.sendConfirmation(chatId, user, data);
    } else {
      await this.bot.sendMessage(
        chatId,
        `${getMultiLangMessage('invalid')}\n\n${getMultiLangMessage('yes_no')}`
      );
    }
  }

  /**
   * Handle tax rate input (NEW - asks for tax percentage)
   */
  async handleTaxRateInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;

    if (isCancelIntent(input)) {
      data.has_tax = false;
      data.tax_rate = 0;
      await this.database.setConversationState(user.id, 'awaiting_confirmation', data);
      await this.sendConfirmation(chatId, user, data);
      return;
    }

    // Parse tax rate from input
    const taxMatch = input.match(/(\d+(?:\.\d+)?)\s*%?/);
    if (!taxMatch) {
      await this.bot.sendMessage(
        chatId,
        `Sorry, I didn't understand that.\n\nPlease enter the tax rate:\n• 8 or 8% for 8 percent\n• 10 or 10% for 10 percent`
      );
      return;
    }

    let taxRate = parseFloat(taxMatch[1]);

    // If number is > 1, assume it's percentage (e.g., 8 = 8%)
    if (taxRate > 1) {
      taxRate = taxRate / 100;
    }

    data.tax_rate = taxRate;

    // Now ask if before/after tax
    await this.database.setConversationState(user.id, 'awaiting_tax_timing', data);
    await this.bot.sendMessage(chatId, getMultiLangMessage('tax_timing'));
  }

  /**
   * Handle tax timing (before/after tax)
   */
  async handleTaxTimingInput(
    chatId: number,
    user: User,
    state: ConversationState,
    input: string
  ): Promise<void> {
    const data = state.data as any;

    if (isCancelIntent(input)) {
      data.has_tax = false;
      data.tax_rate = 0;
      await this.database.setConversationState(user.id, 'awaiting_confirmation', data);
      await this.sendConfirmation(chatId, user, data);
      return;
    }

    const response = normalizeTaxTiming(input);

    if (response === 'before') {
      data.tax_included = false;
      const total = Math.ceil(data.amount * (1 + data.tax_rate));
      await this.bot.sendMessage(
        chatId,
        `✅ Got it! Price is before tax.\nFinal amount: ${total} ${data.currency || 'JPY'}`
      );
      await this.database.setConversationState(user.id, 'awaiting_confirmation', data);
      await this.sendConfirmation(chatId, user, data);
    } else if (response === 'after') {
      data.tax_included = true;
      const basePrice = Math.ceil(data.amount / (1 + data.tax_rate));
      const originalAmount = Math.ceil(data.amount);
      data.amount = basePrice;
      await this.bot.sendMessage(
        chatId,
        `✅ Got it! Price is after tax.\nBase price: ${basePrice} ${data.currency || 'JPY'}\nTotal paid: ${originalAmount} ${data.currency || 'JPY'}`
      );
      await this.database.setConversationState(user.id, 'awaiting_confirmation', data);
      await this.sendConfirmation(chatId, user, data);
    } else {
      await this.bot.sendMessage(
        chatId,
        `${getMultiLangMessage('invalid')}\n\n${getMultiLangMessage('tax_timing')}`
      );
    }
  }

  /**
   * Send expense confirmation message
   */
  private async sendConfirmation(chatId: number, user: User, data: any): Promise<void> {
    const currency = data.currency || user.default_currency || DEFAULT_CURRENCY;
    const amount = Math.ceil(data.amount);
    const taxInfo = data.tax_rate && data.tax_rate > 0
      ? `\nTax: ${(data.tax_rate * 100).toFixed(0)}% (${data.tax_included ? 'included' : 'excluded'})`
      : '';

    await this.bot.sendMessage(
      chatId,
      `📝 Please confirm:

Item: ${data.item}
Amount: ${amount} ${currency}${taxInfo}
Vendor: ${data.vendor}
Payment: ${data.payment_method}

Is this correct? (Yes/No)`
    );
  }
}
