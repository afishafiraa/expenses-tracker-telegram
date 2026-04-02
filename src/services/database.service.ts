import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { notifier } from './notification.service.js';
import type {
  User,
  BillEntry,
  Expense,
  ConversationState,
  ConversationStateType,
  PartialExpenseData,
  ExchangeRate,
  Currency,
} from '../types.js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!

export class DatabaseService {
  private supabase: SupabaseClient;

  constructor() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Supabase credentials not found in environment variables');
    }

    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Connected to Supabase database');
  }

  /**
   * Get or create user by Telegram ID
   */
  async getOrCreateUser(
    telegramId: string,
    username?: string,
    firstName?: string
  ): Promise<User> {
    try {
      // Try to get existing user
      const { data: existingUser, error: selectError } = await this.supabase
        .from('users')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (existingUser) {
        // Update last_active_at
        await this.supabase
          .from('users')
          .update({ last_active_at: new Date().toISOString() })
          .eq('telegram_id', telegramId);

        return existingUser as User;
      }

      // Create new user
      const { data: newUser, error: insertError } = await this.supabase
        .from('users')
        .insert({
          telegram_id: telegramId,
          username: username || null,
          first_name: firstName || null,
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      console.log(`✅ New user created: ${telegramId} (${firstName})`);
      return newUser as User;
    } catch (error) {
      console.error('❌ Error getting/creating user:', error);
      notifier.notify('Database', 'getOrCreateUser failed: ' + (error as Error).message);
      throw error;
    }
  }

  /**
   * Save expense to database with currency conversion
   */
  async saveExpense(userId: string, bill: BillEntry): Promise<void> {
    try {
      // Check for duplicate: same user, date, item, amount, vendor
      const { data: existing } = await this.supabase
        .from('expenses')
        .select('id')
        .eq('user_id', userId)
        .eq('date', bill.date)
        .eq('item', bill.item)
        .eq('amount', bill.amount)
        .eq('vendor', bill.vendor)
        .limit(1);

      if (existing && existing.length > 0) {
        console.log(`⚠️ Duplicate expense skipped: ${bill.vendor} - ${bill.item} ${bill.amount} ${bill.currency} on ${bill.date}`);
        return;
      }

      const { error } = await this.supabase.from('expenses').insert({
        user_id: userId,
        date: bill.date,
        vendor: bill.vendor,
        item: bill.item,
        category: bill.category,
        amount: bill.amount,
        currency: bill.currency,
        tax_rate: bill.taxRate || 0,
        amount_in_default_currency: bill.amountInDefaultCurrency || bill.amount,
        exchange_rate: bill.exchangeRate || 1.0,
        payment_method: bill.paymentMethod,
        description: bill.description,
        source: bill.source,
      });

      if (error) {
        throw error;
      }

      console.log(`✅ Expense saved: ${bill.vendor} - ${bill.amount} ${bill.currency}`);
    } catch (error) {
      console.error('❌ Error saving expense:', error);
      notifier.notify('Database', 'saveExpense failed: ' + (error as Error).message);
      throw error;
    }
  }

  /**
   * Get monthly expenses for a user
   */
  async getMonthlyExpenses(userId: string, year?: number, month?: number): Promise<Expense[]> {
    try {
      const now = new Date();
      const targetYear = year || now.getFullYear();
      const targetMonth = month || now.getMonth() + 1;

      const startDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      const endDate = new Date(targetYear, targetMonth, 0);
      const endDateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${endDate.getDate()}`;

      const { data, error } = await this.supabase
        .from('expenses')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDateStr)
        .order('date', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as Expense[];
    } catch (error) {
      console.error('❌ Error getting monthly expenses:', error);
      throw error;
    }
  }

  /**
   * Get monthly total and breakdown for a user
   */
  async getMonthlyTotal(
    userId: string,
    year?: number,
    month?: number
  ): Promise<{
    total: number;
    count: number;
    byCategory: Record<string, { total: number; count: number }>;
    byCurrency: Record<string, { total: number; count: number }>;
  }> {
    try {
      const expenses = await this.getMonthlyExpenses(userId, year, month);

      const total = expenses.reduce((sum, exp) => sum + Number(exp.amount_in_default_currency), 0);
      const count = expenses.length;

      const byCategory: Record<string, { total: number; count: number }> = {};
      const byCurrency: Record<string, { total: number; count: number }> = {};

      for (const exp of expenses) {
        if (!byCategory[exp.category]) {
          byCategory[exp.category] = { total: 0, count: 0 };
        }
        byCategory[exp.category].total += Number(exp.amount_in_default_currency);
        byCategory[exp.category].count += 1;

        if (!byCurrency[exp.currency]) {
          byCurrency[exp.currency] = { total: 0, count: 0 };
        }
        byCurrency[exp.currency].total += Number(exp.amount);
        byCurrency[exp.currency].count += 1;
      }

      return { total, count, byCategory, byCurrency };
    } catch (error) {
      console.error('❌ Error calculating monthly total:', error);
      throw error;
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<{
    totalExpenses: number;
    totalAmount: number;
    firstExpenseDate?: string;
    lastExpenseDate?: string;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('expenses')
        .select('date, amount_in_default_currency')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      if (error) {
        throw error;
      }

      const expenses = data || [];

      return {
        totalExpenses: expenses.length,
        totalAmount: expenses.reduce((sum, exp) => sum + Number(exp.amount_in_default_currency), 0),
        firstExpenseDate: expenses[0]?.date,
        lastExpenseDate: expenses[expenses.length - 1]?.date,
      };
    } catch (error) {
      console.error('❌ Error getting user stats:', error);
      throw error;
    }
  }

  /**
   * Update user profile (nickname, country, currency, timezone)
   */
  async updateUserProfile(
    userId: string,
    updates: {
      nickname?: string;
      country?: string;
      default_currency?: Currency;
      timezone?: string;
      onboarding_completed?: boolean;
    }
  ): Promise<User> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log(`✅ User profile updated: ${userId}`);
      return data as User;
    } catch (error) {
      console.error('❌ Error updating user profile:', error);
      throw error;
    }
  }

  /**
   * Get conversation state for user
   */
  async getConversationState(userId: string): Promise<ConversationState | null> {
    try {
      const { data, error } = await this.supabase
        .from('conversation_states')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data as ConversationState | null;
    } catch (error) {
      console.error('❌ Error getting conversation state:', error);
      throw error;
    }
  }

  /**
   * Set conversation state for user
   */
  async setConversationState(
    userId: string,
    state: ConversationStateType,
    data: PartialExpenseData = {}
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('conversation_states')
        .upsert(
          {
            user_id: userId,
            state,
            data,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id',
          }
        );

      if (error) {
        throw error;
      }

      console.log(`✅ Conversation state set: ${state}`);
    } catch (error) {
      console.error('❌ Error setting conversation state:', error);
      throw error;
    }
  }

  /**
   * Clear conversation state for user
   */
  async clearConversationState(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('conversation_states')
        .delete()
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      console.log(`✅ Conversation state cleared`);
    } catch (error) {
      console.error('❌ Error clearing conversation state:', error);
      throw error;
    }
  }

  /**
   * Get exchange rate
   */
  async getExchangeRate(fromCurrency: Currency, toCurrency: Currency): Promise<number> {
    try {
      if (fromCurrency === toCurrency) {
        return 1.0;
      }

      const { data, error } = await this.supabase
        .from('exchange_rates')
        .select('rate')
        .eq('from_currency', fromCurrency)
        .eq('to_currency', toCurrency)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.warn(`⚠️ No exchange rate found for ${fromCurrency} → ${toCurrency}, using 1.0`);
        return 1.0;
      }

      return Number(data.rate);
    } catch (error) {
      console.error('❌ Error getting exchange rate:', error);
      return 1.0;
    }
  }

  /**
   * Get the most recent exchange rate update timestamp
   */
  async getLatestExchangeRateUpdate(): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('exchange_rates')
        .select('updated_at')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return data.updated_at;
    } catch (error) {
      console.error('❌ Error getting latest exchange rate update:', error);
      return null;
    }
  }

  /**
   * Update exchange rate
   */
  async updateExchangeRate(
    fromCurrency: Currency,
    toCurrency: Currency,
    rate: number,
    source: string = 'api'
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('exchange_rates')
        .upsert(
          {
            from_currency: fromCurrency,
            to_currency: toCurrency,
            rate,
            source,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'from_currency,to_currency',
          }
        );

      if (error) {
        throw error;
      }

      console.log(`✅ Exchange rate updated: ${fromCurrency} → ${toCurrency} = ${rate}`);
    } catch (error) {
      console.error('❌ Error updating exchange rate:', error);
      throw error;
    }
  }

  /**
   * Get all onboarded users' telegram IDs (for broadcast messages)
   */
  async getAllActiveUserTelegramIds(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('telegram_id')
        .eq('onboarding_completed', true);

      if (error) {
        throw error;
      }

      return (data || []).map((u) => u.telegram_id);
    } catch (error) {
      console.error('❌ Error getting active users:', error);
      return [];
    }
  }

  /**
   * Delete user and all their data (expenses, conversation states)
   * CASCADE delete will automatically remove related records
   */
  async deleteUser(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) {
        throw error;
      }

      console.log(`✅ User deleted: ${userId} (cascade: expenses, conversation_states)`);
    } catch (error) {
      console.error('❌ Error deleting user:', error);
      throw error;
    }
  }
}
