import 'dotenv/config';
import { DatabaseService } from './database.service.js';
import type { Currency } from '../types.js';

/**
 * ExchangeRate Service
 * Fetches real-time exchange rates from Frankfurter API v2
 * Covers 150+ currencies from 20+ central banks
 * Free, open-source, no API key required, no rate limits
 * Docs: https://frankfurter.dev
 */
export class ExchangeRateService {
  private database: DatabaseService;
  private apiUrl = 'https://api.frankfurter.dev/v2/rates';

  // Base currencies we'll fetch (to minimize API calls)
  private baseCurrencies: Currency[] = ['JPY', 'USD', 'SGD'];

  // All currencies we support
  private supportedCurrencies: Currency[] = [
    'THB', 'JPY', 'SGD', 'MYR', 'IDR',
    'PHP', 'VND', 'KRW', 'CNY', 'HKD',
    'TWD', 'INR', 'USD'
  ];

  constructor(database: DatabaseService) {
    this.database = database;
  }

  /**
   * Fetch available currencies from Frankfurter v2
   */
  async getAvailableCurrencies(): Promise<string[]> {
    try {
      const response = await fetch('https://api.frankfurter.dev/v2/currencies');

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as Array<{ iso_code: string }>;
      const currencies = data.map(c => c.iso_code);

      console.log('📊 Frankfurter v2 available currencies:', currencies.length);
      return currencies;
    } catch (error) {
      console.error('❌ Failed to fetch available currencies:', error);
      throw error;
    }
  }

  /**
   * Fetch exchange rates from API for a base currency
   * v2 API returns array: [{ date, base, quote, rate }, ...]
   */
  private async fetchRatesFromAPI(baseCurrency: Currency): Promise<Record<string, number>> {
    try {
      // Build quotes parameter (all supported currencies except base)
      const quotes = this.supportedCurrencies.filter(c => c !== baseCurrency).join(',');

      const response = await fetch(`${this.apiUrl}?base=${baseCurrency}&quotes=${quotes}`);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as Array<{
        date: string;
        base: string;
        quote: string;
        rate: number;
      }>;

      // Convert array to Record<Currency, Rate>
      const rates: Record<string, number> = {};
      for (const item of data) {
        rates[item.quote] = item.rate;
      }

      console.log(`✅ Fetched ${Object.keys(rates).length} rates for ${baseCurrency} from Frankfurter v2`);
      return rates;
    } catch (error) {
      console.error(`❌ Failed to fetch rates for ${baseCurrency}:`, error);
      throw error;
    }
  }

  /**
   * Update all exchange rates in database
   */
  async updateAllRates(): Promise<void> {
    console.log('🔄 Starting exchange rate update from Frankfurter v2...');

    let totalUpdated = 0;
    const errors: string[] = [];

    for (const base of this.baseCurrencies) {
      try {
        const rates = await this.fetchRatesFromAPI(base);

        // Update rates for all fetched currencies
        for (const [target, rate] of Object.entries(rates)) {
          try {
            await this.database.updateExchangeRate(
              base as Currency,
              target as Currency,
              rate,
              'frankfurter-v2'
            );
            totalUpdated++;
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : JSON.stringify(err);
            errors.push(`${base}→${target}: ${errorMsg}`);
            console.error(`❌ Failed to update ${base}→${target}:`, err);
          }
        }

        // Add small delay between API calls to be respectful
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        errors.push(`Failed to fetch ${base}: ${error}`);
        console.error(`⚠️ Skipping ${base} due to error:`, error);
      }
    }

    console.log(`✅ Exchange rate update complete: ${totalUpdated} rates updated`);

    if (errors.length > 0) {
      console.warn(`⚠️ ${errors.length} errors occurred during update:`, errors.slice(0, 5));
    }
  }

  /**
   * Check if rates need updating (check if last update was today)
   */
  async needsUpdate(): Promise<boolean> {
    try {
      // Get the most recent update timestamp
      const lastUpdate = await this.database.getLatestExchangeRateUpdate();

      // If no rates exist, we need to update
      if (!lastUpdate) {
        console.log('📊 No exchange rates found, update needed');
        return true;
      }

      // Check if last update was today
      const lastUpdateDate = new Date(lastUpdate);
      const today = new Date();

      // Compare dates (ignore time)
      const isSameDay =
        lastUpdateDate.getFullYear() === today.getFullYear() &&
        lastUpdateDate.getMonth() === today.getMonth() &&
        lastUpdateDate.getDate() === today.getDate();

      if (isSameDay) {
        console.log(`✅ Exchange rates already updated today (${lastUpdateDate.toISOString()})`);
        return false;
      }

      console.log(`📊 Exchange rates need update (last: ${lastUpdateDate.toISOString()})`);
      return true;
    } catch (error) {
      console.error('❌ Error checking if rates need update:', error);
      return true; // Default to updating on error
    }
  }

  /**
   * Schedule daily updates
   * Returns interval ID that can be cleared
   */
  scheduleDailyUpdates(): NodeJS.Timeout {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

    console.log('⏰ Scheduled daily exchange rate updates (every 24 hours)');

    return setInterval(async () => {
      try {
        console.log('⏰ Running scheduled exchange rate update...');
        await this.updateAllRates();
      } catch (error) {
        console.error('❌ Scheduled update failed:', error);
      }
    }, TWENTY_FOUR_HOURS);
  }

  /**
   * Initialize rates on startup if needed
   */
  async initialize(): Promise<void> {
    try {
      const needsUpdate = await this.needsUpdate();

      if (needsUpdate) {
        console.log('🚀 Initializing exchange rates...');
        await this.updateAllRates();
      } else {
        console.log('✅ Exchange rates are up to date');
      }
    } catch (error) {
      console.error('❌ Failed to initialize exchange rates:', error);
      console.warn('⚠️ Bot will continue with existing/fallback rates');
    }
  }
}
