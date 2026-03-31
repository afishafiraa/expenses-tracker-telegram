-- ========================================
-- BillNot Database Schema V2 - Complete Reset
-- ========================================
-- Version: 2.0.0
-- Date: 2026-03-26
--
-- INSTRUCTIONS:
-- 1. Open Supabase SQL Editor
-- 2. Copy and paste this ENTIRE file
-- 3. Click "Run" to execute
-- 4. This will DROP existing tables and create fresh ones
-- ========================================

-- ========================================
-- STEP 1: Drop existing tables
-- ========================================

DROP TABLE IF EXISTS conversation_states CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS exchange_rates CASCADE;
DROP TABLE IF EXISTS sheet_exports CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ========================================
-- STEP 2: Create tables
-- ========================================

-- Users table (with Telegram, nickname, country, currency)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id VARCHAR(50) UNIQUE NOT NULL,
  username VARCHAR(100),
  first_name VARCHAR(100),
  nickname VARCHAR(100),
  country VARCHAR(100),
  timezone VARCHAR(50) DEFAULT 'Asia/Tokyo',
  default_currency VARCHAR(3) DEFAULT 'JPY',
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_onboarding ON users(onboarding_completed);

-- Expenses table (with multi-currency support and tax)
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  vendor VARCHAR(200) NOT NULL,
  item VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'JPY',
  tax_rate DECIMAL(4, 3) DEFAULT 0,
  amount_in_default_currency DECIMAL(12, 2),
  exchange_rate DECIMAL(12, 6),
  payment_method VARCHAR(50),
  description TEXT,
  source VARCHAR(10) CHECK (source IN ('text', 'image', 'chat')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (amount > 0)
);

CREATE INDEX idx_expenses_user_date ON expenses(user_id, date DESC);
CREATE INDEX idx_expenses_user_category ON expenses(user_id, category);
CREATE INDEX idx_expenses_currency ON expenses(currency);

-- Exchange rates table
CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency VARCHAR(3) NOT NULL,
  to_currency VARCHAR(3) NOT NULL,
  rate DECIMAL(12, 6) NOT NULL,
  source VARCHAR(50) DEFAULT 'exchangerate-api.com',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(from_currency, to_currency),
  CHECK (rate > 0)
);

CREATE INDEX idx_exchange_rates_pair ON exchange_rates(from_currency, to_currency);
CREATE INDEX idx_exchange_rates_updated ON exchange_rates(updated_at DESC);

-- Conversation states table (for multi-step flows)
CREATE TABLE conversation_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state VARCHAR(50) NOT NULL,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_conversation_states_user ON conversation_states(user_id);

-- Sheet exports table (optional, for caching)
CREATE TABLE sheet_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sheet_id VARCHAR(100) NOT NULL,
  sheet_url TEXT NOT NULL,
  month DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, month)
);

CREATE INDEX idx_sheet_exports_user ON sheet_exports(user_id);

-- ========================================
-- STEP 3: Insert initial data
-- ========================================

-- Same-currency rates (always 1.0)
INSERT INTO exchange_rates (from_currency, to_currency, rate, source) VALUES
  ('THB', 'THB', 1.0, 'static'),
  ('JPY', 'JPY', 1.0, 'static'),
  ('SGD', 'SGD', 1.0, 'static'),
  ('MYR', 'MYR', 1.0, 'static'),
  ('IDR', 'IDR', 1.0, 'static'),
  ('PHP', 'PHP', 1.0, 'static'),
  ('VND', 'VND', 1.0, 'static'),
  ('KRW', 'KRW', 1.0, 'static'),
  ('CNY', 'CNY', 1.0, 'static'),
  ('HKD', 'HKD', 1.0, 'static'),
  ('TWD', 'TWD', 1.0, 'static'),
  ('INR', 'INR', 1.0, 'static'),
  ('USD', 'USD', 1.0, 'static');

-- Initial exchange rates (bidirectional, approximate, will be updated via API)

-- From JPY to other currencies
INSERT INTO exchange_rates (from_currency, to_currency, rate, source) VALUES
  ('JPY', 'THB', 0.25, 'manual'),
  ('JPY', 'USD', 0.0071, 'manual'),
  ('JPY', 'SGD', 0.0095, 'manual'),
  ('JPY', 'MYR', 0.031, 'manual'),
  ('JPY', 'IDR', 109.0, 'manual'),
  ('JPY', 'PHP', 0.40, 'manual'),
  ('JPY', 'VND', 175.0, 'manual'),
  ('JPY', 'KRW', 9.6, 'manual'),
  ('JPY', 'CNY', 0.051, 'manual'),
  ('JPY', 'HKD', 0.055, 'manual'),
  ('JPY', 'TWD', 0.23, 'manual'),
  ('JPY', 'INR', 0.59, 'manual');

-- From VND to other currencies
INSERT INTO exchange_rates (from_currency, to_currency, rate, source) VALUES
  ('VND', 'THB', 0.0014, 'manual'),
  ('VND', 'JPY', 0.0057, 'manual'),
  ('VND', 'USD', 0.000041, 'manual'),
  ('VND', 'SGD', 0.000055, 'manual'),
  ('VND', 'MYR', 0.00018, 'manual'),
  ('VND', 'IDR', 0.63, 'manual'),
  ('VND', 'PHP', 0.0023, 'manual'),
  ('VND', 'KRW', 0.055, 'manual'),
  ('VND', 'CNY', 0.00029, 'manual'),
  ('VND', 'HKD', 0.00032, 'manual'),
  ('VND', 'TWD', 0.0013, 'manual'),
  ('VND', 'INR', 0.0034, 'manual');

-- From IDR to other currencies
INSERT INTO exchange_rates (from_currency, to_currency, rate, source) VALUES
  ('IDR', 'THB', 0.0023, 'manual'),
  ('IDR', 'JPY', 0.0092, 'manual'),
  ('IDR', 'USD', 0.000065, 'manual'),
  ('IDR', 'SGD', 0.000088, 'manual'),
  ('IDR', 'MYR', 0.00029, 'manual'),
  ('IDR', 'PHP', 0.0036, 'manual'),
  ('IDR', 'VND', 1.59, 'manual'),
  ('IDR', 'KRW', 0.088, 'manual'),
  ('IDR', 'CNY', 0.00047, 'manual'),
  ('IDR', 'HKD', 0.00051, 'manual'),
  ('IDR', 'TWD', 0.0021, 'manual'),
  ('IDR', 'INR', 0.0054, 'manual');

-- From SGD to other currencies
INSERT INTO exchange_rates (from_currency, to_currency, rate, source) VALUES
  ('SGD', 'THB', 25.0, 'manual'),
  ('SGD', 'JPY', 105.0, 'manual'),
  ('SGD', 'USD', 0.74, 'manual'),
  ('SGD', 'MYR', 3.4, 'manual'),
  ('SGD', 'IDR', 11400.0, 'manual'),
  ('SGD', 'PHP', 42.0, 'manual'),
  ('SGD', 'VND', 18150.0, 'manual'),
  ('SGD', 'KRW', 1000.0, 'manual'),
  ('SGD', 'CNY', 5.3, 'manual'),
  ('SGD', 'HKD', 5.8, 'manual'),
  ('SGD', 'TWD', 23.7, 'manual'),
  ('SGD', 'INR', 62.0, 'manual');

-- From other currencies
INSERT INTO exchange_rates (from_currency, to_currency, rate, source) VALUES
  ('USD', 'THB', 35.0, 'manual'),
  ('USD', 'JPY', 140.0, 'manual'),
  ('USD', 'VND', 24500.0, 'manual'),
  ('USD', 'IDR', 15400.0, 'manual'),
  ('USD', 'SGD', 1.35, 'manual'),
  ('MYR', 'THB', 8.0, 'manual'),
  ('MYR', 'JPY', 32.0, 'manual'),
  ('MYR', 'SGD', 0.29, 'manual'),
  ('PHP', 'THB', 0.63, 'manual'),
  ('PHP', 'JPY', 2.5, 'manual'),
  ('PHP', 'SGD', 0.024, 'manual'),
  ('KRW', 'THB', 0.026, 'manual'),
  ('KRW', 'JPY', 0.104, 'manual'),
  ('KRW', 'SGD', 0.001, 'manual'),
  ('CNY', 'THB', 4.9, 'manual'),
  ('CNY', 'JPY', 19.5, 'manual'),
  ('CNY', 'SGD', 0.19, 'manual'),
  ('HKD', 'THB', 4.5, 'manual'),
  ('HKD', 'JPY', 18.0, 'manual'),
  ('HKD', 'SGD', 0.17, 'manual'),
  ('TWD', 'THB', 1.1, 'manual'),
  ('TWD', 'JPY', 4.4, 'manual'),
  ('TWD', 'SGD', 0.042, 'manual'),
  ('INR', 'THB', 0.42, 'manual'),
  ('INR', 'JPY', 1.7, 'manual'),
  ('INR', 'SGD', 0.016, 'manual');

-- ========================================
-- ✅ DONE! Database reset complete
-- ========================================

-- Verify tables created
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
