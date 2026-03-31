// ========================================
// User Types
// ========================================

export interface User {
  id: string;
  telegram_id: string;
  username?: string;
  first_name?: string;
  nickname?: string;
  country?: string;
  timezone: string;
  default_currency: string;
  onboarding_completed: boolean;
  created_at: string;
  last_active_at: string;
}

// ========================================
// Currency Types
// ========================================

export type Currency =
  | 'THB' // Thai Baht
  | 'JPY' // Japanese Yen
  | 'SGD' // Singapore Dollar
  | 'MYR' // Malaysian Ringgit
  | 'IDR' // Indonesian Rupiah
  | 'PHP' // Philippine Peso
  | 'VND' // Vietnamese Dong
  | 'KRW' // South Korean Won
  | 'CNY' // Chinese Yuan
  | 'HKD' // Hong Kong Dollar
  | 'TWD' // New Taiwan Dollar
  | 'INR' // Indian Rupee
  | 'USD'; // US Dollar

export interface ExchangeRate {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  source: string;
  updated_at: string;
}

// ========================================
// Expense Types
// ========================================

export interface BillEntry {
  date: string; // YYYY-MM-DD
  vendor: string;
  item: string;
  category: Category;
  amount: number; // Original amount before tax
  currency: Currency;
  taxRate?: number; // Tax rate (0, 0.07, 0.08, 0.10, etc.)
  paymentMethod: string;
  description: string;
  amountInDefaultCurrency?: number; // Converted amount (after tax)
  exchangeRate?: number;
  source: 'image' | 'text' | 'chat';
}

export interface Expense {
  id: string;
  user_id: string;
  date: string;
  vendor: string;
  item: string;
  category: string;
  amount: number;
  currency: string;
  tax_rate: number;
  amount_in_default_currency: number;
  exchange_rate: number;
  payment_method: string;
  description: string;
  source: 'text' | 'image' | 'chat';
  created_at: string;
}

export enum Category {
  Food = 'Food',
  Transport = 'Transport',
  Utilities = 'Utilities',
  Rent = 'Rent',
  Subscription = 'Subscription',
  Shopping = 'Shopping',
  Entertainment = 'Entertainment',
  Healthcare = 'Healthcare',
  Other = 'Other'
}

// ========================================
// Gemini AI Types
// ========================================

export interface GeminiExtractedData {
  date: string;
  vendor: string;
  items: Array<{
    item: string;
    category: string;
    amount: number; // Amount before tax
    taxRate: number; // 0, 0.07, 0.08, 0.10, etc.
    currency?: Currency;
    description: string;
  }>;
  paymentMethod: string;
  detectedCurrency?: Currency;
}

// ========================================
// Conversation State Types
// ========================================

export type ConversationStateType =
  | 'idle'
  | 'awaiting_nickname'
  | 'awaiting_country'
  | 'awaiting_amount'
  | 'awaiting_vendor'
  | 'awaiting_payment'
  | 'awaiting_tax_inclusion'
  | 'awaiting_tax_rate'
  | 'awaiting_tax_timing'
  | 'awaiting_confirmation'
  | 'awaiting_deactivate_confirmation';

export interface ConversationState {
  id: string;
  user_id: string;
  state: ConversationStateType;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PartialExpenseData {
  item?: string;
  amount?: number;
  currency?: Currency;
  vendor?: string;
  category?: string;
  payment_method?: string;
  description?: string;
  date?: string;
  tax_rate?: number;
  has_tax?: boolean;
  tax_included?: boolean; // true = after tax, false = before tax
}

// ========================================
// Country Mapping
// ========================================

export const COUNTRY_CURRENCY_MAP: Record<string, Currency> = {
  'Thailand': 'THB',
  'Japan': 'JPY',
  'Singapore': 'SGD',
  'Malaysia': 'MYR',
  'Indonesia': 'IDR',
  'Philippines': 'PHP',
  'Vietnam': 'VND',
  'South Korea': 'KRW',
  'Korea': 'KRW',
  'China': 'CNY',
  'Hong Kong': 'HKD',
  'Taiwan': 'TWD',
  'India': 'INR',
};

export const COUNTRY_TIMEZONE_MAP: Record<string, string> = {
  'Thailand': 'Asia/Bangkok',
  'Japan': 'Asia/Tokyo',
  'Singapore': 'Asia/Singapore',
  'Malaysia': 'Asia/Kuala_Lumpur',
  'Indonesia': 'Asia/Jakarta',
  'Philippines': 'Asia/Manila',
  'Vietnam': 'Asia/Ho_Chi_Minh',
  'South Korea': 'Asia/Seoul',
  'Korea': 'Asia/Seoul',
  'China': 'Asia/Shanghai',
  'Hong Kong': 'Asia/Hong_Kong',
  'Taiwan': 'Asia/Taipei',
  'India': 'Asia/Kolkata',
};
