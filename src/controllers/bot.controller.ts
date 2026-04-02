import TelegramBot from 'node-telegram-bot-api';
import { DatabaseService } from '../services/database.service.js';
import { ExportService } from '../services/export.service.js';
import { CommandHandler } from '../handlers/command.handler.js';
import { ExpenseHandler } from '../handlers/expense.handler.js';
import { MessageHandler } from '../handlers/message.handler.js';
import { ConfirmationHandler } from '../handlers/confirmation.handler.js';
import { OnboardingHandler } from '../handlers/onboarding.handler.js';
import type { User } from '../types.js';

/**
 * Main Bot Controller - Routes messages to appropriate handlers
 * This file should stay under 200 lines - all logic in handlers
 */
export class BotController {
  private database: DatabaseService;
  private exportService: ExportService;

  // Handlers
  private commandHandler: CommandHandler;
  private expenseHandler: ExpenseHandler;
  private messageHandler: MessageHandler;
  private confirmationHandler: ConfirmationHandler;
  private onboardingHandler: OnboardingHandler;

  constructor(private bot: TelegramBot) {
    this.database = new DatabaseService();
    this.exportService = new ExportService(this.database);

    // Initialize handlers
    this.commandHandler = new CommandHandler(this.bot, this.database, this.exportService);
    this.expenseHandler = new ExpenseHandler(this.bot, this.database);
    this.messageHandler = new MessageHandler(this.bot, this.database);
    this.confirmationHandler = new ConfirmationHandler(this.bot, this.database, this.messageHandler);
    this.onboardingHandler = new OnboardingHandler(this.bot, this.database);
  }

  // ========================================
  // Command Routes
  // ========================================

  async handleStart(msg: TelegramBot.Message): Promise<void> {
    const user = await this.getUser(msg);
    await this.commandHandler.handleStart(msg, user);
  }

  async handleHelp(msg: TelegramBot.Message): Promise<void> {
    await this.commandHandler.handleHelp(msg);
  }

  async handleProfile(msg: TelegramBot.Message): Promise<void> {
    const user = await this.getUser(msg);
    await this.commandHandler.handleProfile(msg, user);
  }

  async handleSetCurrency(msg: TelegramBot.Message): Promise<void> {
    const user = await this.getUser(msg);
    await this.commandHandler.handleSetCurrency(msg, user);
  }

  async handleTotalSpend(msg: TelegramBot.Message): Promise<void> {
    const user = await this.getUser(msg);
    await this.commandHandler.handleTotalSpend(msg, user);
  }

  async handleExport(msg: TelegramBot.Message): Promise<void> {
    const user = await this.getUser(msg);
    await this.commandHandler.handleExport(msg, user);
  }

  async handleDeactivate(msg: TelegramBot.Message): Promise<void> {
    const user = await this.getUser(msg);
    await this.commandHandler.handleDeactivate(msg, user);
  }

  // ========================================
  // Message Handler
  // ========================================

  async handleMessage(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const text = msg.text;

    // Skip commands
    if (text?.startsWith('/')) return;

    try {
      const user = await this.getUser(msg);
      const conversationState = await this.database.getConversationState(user.id);

      // Handle active conversation states
      if (conversationState && text) {
        await this.routeConversationState(chatId, user, conversationState, text);
        return;
      }

      // Handle text messages via AI
      if (text) {
        const detected = await this.messageHandler.handleTextMessage(chatId, user, text);
        if (detected) {
          await this.messageHandler.handleExpenseDetection(chatId, user, detected);
        }
        return;
      }

      // Handle photo messages
      if (msg.photo) {
        await this.messageHandler.handlePhotoMessage(chatId, user, msg);
        return;
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
      await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
    }
  }

  // ========================================
  // Conversation State Router
  // ========================================

  private async routeConversationState(
    chatId: number,
    user: User,
    state: any,
    input: string
  ): Promise<void> {
    switch (state.state) {
      // Onboarding
      case 'awaiting_nickname':
        await this.onboardingHandler.handleNicknameInput(chatId, user, input);
        break;

      case 'awaiting_country':
        await this.onboardingHandler.handleCountryInput(chatId, user, state, input);
        break;

      // Expense collection
      case 'awaiting_amount':
        await this.expenseHandler.handleAmountInput(chatId, user, state, input);
        break;

      case 'awaiting_vendor':
        await this.expenseHandler.handleVendorInput(chatId, user, state, input);
        break;

      case 'awaiting_payment':
        await this.expenseHandler.handlePaymentInput(chatId, user, state, input);
        break;

      // Tax flow
      case 'awaiting_tax_inclusion':
        await this.expenseHandler.handleTaxInclusionInput(chatId, user, state, input);
        break;

      case 'awaiting_tax_rate':
        await this.expenseHandler.handleTaxRateInput(chatId, user, state, input);
        break;

      case 'awaiting_tax_timing':
        await this.expenseHandler.handleTaxTimingInput(chatId, user, state, input);
        break;

      // Confirmations
      case 'awaiting_confirmation':
        await this.confirmationHandler.handleConfirmation(chatId, user, state, input);
        break;

      case 'awaiting_rejection_choice':
        await this.confirmationHandler.handleRejectionChoice(chatId, user, state, input);
        break;

      case 'awaiting_edit':
        await this.confirmationHandler.handleEdit(chatId, user, state, input);
        break;

      default:
        await this.database.clearConversationState(user.id);
        await this.bot.sendMessage(chatId, 'Something went wrong. Please send /start to begin again.');
    }
  }

  // ========================================
  // Helper Methods
  // ========================================

  private async getUser(msg: TelegramBot.Message): Promise<User> {
    const telegramId = msg.from!.id.toString();
    const username = msg.from?.username;
    const firstName = msg.from?.first_name;

    return await this.database.getOrCreateUser(telegramId, username, firstName);
  }
}
