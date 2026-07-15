import type { Currency } from '../types.js';

/**
 * Shared currency/money helpers.
 *
 * Single source of truth for rounding and amount parsing so the three
 * conversation handlers can't silently drift apart on money math.
 */

export const DEFAULT_CURRENCY: Currency = 'JPY';

// Currencies that don't use decimal subunits — amounts are whole numbers.
export const ZERO_DECIMAL_CURRENCIES: Currency[] = ['JPY', 'KRW', 'VND', 'IDR'];

/**
 * Round an amount according to its currency's convention.
 * Zero-decimal currencies round up to a whole unit; others keep 2 decimals.
 */
export function roundAmount(amount: number, currency: Currency): number {
  if (ZERO_DECIMAL_CURRENCIES.includes(currency)) return Math.ceil(amount);
  return Math.round(amount * 100) / 100;
}

/**
 * Parse a user-typed amount, tolerating thousands separators.
 * "1,500" -> 1500, "1.500,50" is NOT handled (assumes '.' is the decimal point).
 * Returns null when no number is found.
 */
export function parseAmount(input: string): number | null {
  const match = input.match(/[\d,]+(\.\d+)?/);
  if (!match) return null;
  const value = parseFloat(match[0].replace(/,/g, ''));
  return Number.isFinite(value) ? value : null;
}
