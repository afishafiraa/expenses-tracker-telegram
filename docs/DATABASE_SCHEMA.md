# Database Schema V2

## Overview

Using **Supabase (PostgreSQL)** with Telegram Bot integration, multi-currency support, and Google Sheets export functionality.

**Version:** 2.0.0
**Last Updated:** 2026-03-26

---

## ⚠️ RESET DATABASE (One-time only!)

Run this in Supabase SQL Editor to drop existing tables:

```sql
-- Drop existing tables (one-time reset!)
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS exchange_rates CASCADE;
DROP TABLE IF EXISTS conversation_states CASCADE;
DROP TABLE IF EXISTS sheet_exports CASCADE;
```

---

## Tables

### 1. users

Stores user information and preferences.

```sql
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
```

**Columns:**
- `id`: Unique user identifier (UUID)
- `telegram_id`: Telegram user ID (unique)
- `username`: Telegram @username (optional)
- `first_name`: Telegram first name
- `nickname`: User's preferred nickname (asked during onboarding)
- `country`: User's country (Thailand, Japan, Singapore, etc.)
- `timezone`: User's timezone (Asia/Bangkok, Asia/Tokyo, etc.)
- `default_currency`: Default currency code (THB, JPY, SGD, etc.)
- `onboarding_completed`: Whether user finished onboarding flow
- `created_at`: Account creation timestamp
- `last_active_at`: Last interaction timestamp

---

### 2. expenses

Stores all expense records with multi-currency support.

```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Expense details
  date DATE NOT NULL,
  vendor VARCHAR(200) NOT NULL,
  item VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,

  -- Multi-currency pricing
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'JPY',
  amount_in_default_currency DECIMAL(12, 2),
  exchange_rate DECIMAL(12, 6),

  -- Additional info
  payment_method VARCHAR(50),
  description TEXT,
  source VARCHAR(10) CHECK (source IN ('text', 'image', 'chat')),

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CHECK (amount > 0)
);

CREATE INDEX idx_expenses_user_date ON expenses(user_id, date DESC);
CREATE INDEX idx_expenses_user_category ON expenses(user_id, category);
CREATE INDEX idx_expenses_currency ON expenses(currency);
```

**Columns:**
- `id`: Unique expense identifier
- `user_id`: Foreign key to users table
- `date`: Expense date
- `vendor`: Store/vendor name
- `item`: Product/service description
- `category`: Expense category (Food, Transport, Utilities, etc.)
- `amount`: Original amount before tax in original currency
- `currency`: Currency code (THB, JPY, USD, etc.)
- `tax_rate`: Tax rate (0, 0.07, 0.08, 0.10, etc.)
- `amount_in_default_currency`: Converted amount after tax in user's default currency (cached)
- `exchange_rate`: Exchange rate used for conversion (cached)
- `payment_method`: Cash, Credit Card, QR, etc.
- `description`: Additional notes
- `source`: How expense was recorded (text, image, chat)
- `created_at`: Record creation timestamp

**Note:**
- `amount` = price before tax
- `amount_in_default_currency` = (amount × (1 + tax_rate)) × exchange_rate

---

### 3. exchange_rates

Stores currency exchange rates.

```sql
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
```

**Columns:**
- `id`: Unique rate identifier
- `from_currency`: Source currency code
- `to_currency`: Target currency code
- `rate`: Exchange rate (1 from_currency = rate × to_currency)
- `source`: API source name
- `updated_at`: Last update timestamp

**Example:**
- JPY → THB: rate = 0.25 (1 JPY = 0.25 THB)
- USD → THB: rate = 35.0 (1 USD = 35 THB)

---

### 4. conversation_states

Tracks multi-step conversation flows (onboarding, expense collection).

```sql
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
```

**Columns:**
- `user_id`: Foreign key to users (unique - one state per user)
- `state`: Current conversation state
- `data`: JSON object storing partial data
- `created_at`: State creation timestamp
- `updated_at`: Last state update timestamp

**Example states:**
- `awaiting_nickname` - Waiting for nickname input
- `awaiting_country` - Waiting for country selection
- `awaiting_amount` - Collecting expense amount
- `awaiting_vendor` - Collecting vendor name
- `awaiting_payment` - Collecting payment method
- `awaiting_confirmation` - Waiting for expense confirmation

**Example data:**
```json
{
  "item": "taiyaki",
  "amount": 110,
  "currency": "JPY",
  "vendor": null,
  "payment_method": null
}
```

---

### 5. sheet_exports (Optional)

Track Google Sheets exports for caching.

```sql
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
```

**Purpose:**
- Cache Google Sheet URLs
- Avoid recreating sheets unnecessarily
- Track which months have been exported

---

## Initial Data Setup

### Supported Currencies (Asian + Southeast Asian Focus)

```sql
-- Insert same-currency rates (always 1.0)
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

-- Initial exchange rates to THB (approximate, will be updated via API)
INSERT INTO exchange_rates (from_currency, to_currency, rate, source) VALUES
  ('JPY', 'THB', 0.25, 'manual'),
  ('USD', 'THB', 35.0, 'manual'),
  ('SGD', 'THB', 25.0, 'manual'),
  ('MYR', 'THB', 8.0, 'manual'),
  ('IDR', 'THB', 0.0023, 'manual'),
  ('PHP', 'THB', 0.63, 'manual'),
  ('VND', 'THB', 0.0014, 'manual'),
  ('KRW', 'THB', 0.026, 'manual'),
  ('CNY', 'THB', 4.9, 'manual'),
  ('HKD', 'THB', 4.5, 'manual'),
  ('TWD', 'THB', 1.1, 'manual'),
  ('INR', 'THB', 0.42, 'manual');
```

**Supported Currencies:**
- 🇹🇭 THB - Thai Baht
- 🇯🇵 JPY - Japanese Yen
- 🇸🇬 SGD - Singapore Dollar
- 🇲🇾 MYR - Malaysian Ringgit
- 🇮🇩 IDR - Indonesian Rupiah
- 🇵🇭 PHP - Philippine Peso
- 🇻🇳 VND - Vietnamese Dong
- 🇰🇷 KRW - South Korean Won
- 🇨🇳 CNY - Chinese Yuan
- 🇭🇰 HKD - Hong Kong Dollar
- 🇹🇼 TWD - New Taiwan Dollar
- 🇮🇳 INR - Indian Rupee
- 🇺🇸 USD - US Dollar (common for travel)

---

## Example Data

### users table
```sql
INSERT INTO users (telegram_id, first_name, nickname, country, default_currency, onboarding_completed) VALUES
  ('123456789', 'Gaogao', 'Gao', 'Thailand', 'THB', TRUE),
  ('987654321', 'Yuki', 'Yuki-chan', 'Japan', 'JPY', TRUE),
  ('555444333', 'Ming', 'Ming', 'Singapore', 'SGD', TRUE);
```

### expenses table
```sql
INSERT INTO expenses (
  user_id,
  date,
  vendor,
  item,
  category,
  amount,
  currency,
  tax_rate,
  amount_in_default_currency,
  exchange_rate,
  payment_method,
  description,
  source
) VALUES (
  (SELECT id FROM users WHERE telegram_id = '123456789'),
  '2026-03-25',
  'Grab',
  'Ride to office',
  'Transport',
  185.00,
  'THB',
  0.0,
  185.00,
  1.0,
  'Credit Card',
  'Morning commute',
  'text'
),
(
  (SELECT id FROM users WHERE telegram_id = '123456789'),
  '2026-03-25',
  'FamilyMart',
  'Taiyaki',
  'Food',
  110.00,
  'JPY',
  0.08,
  29.70,
  0.25,
  'Cash',
  'Snack from Japan trip (110 JPY + 8% tax = 118.8 JPY → 29.70 THB)',
  'chat'
);
```

---

## Common Queries

### Get user by Telegram ID

```sql
SELECT * FROM users
WHERE telegram_id = '123456789';
```

### Get or create user

```sql
INSERT INTO users (telegram_id, username, first_name)
VALUES ('123456789', 'gaogao', 'Gaogao')
ON CONFLICT (telegram_id)
DO UPDATE SET last_active_at = NOW()
RETURNING *;
```

### Get user's monthly expenses with currency

```sql
SELECT
  e.date,
  e.vendor,
  e.item,
  e.category,
  e.amount,
  e.currency,
  e.amount_in_default_currency,
  e.exchange_rate,
  e.payment_method,
  e.description,
  u.default_currency,
  u.nickname
FROM expenses e
JOIN users u ON e.user_id = u.id
WHERE e.user_id = (SELECT id FROM users WHERE telegram_id = '123456789')
  AND e.date >= DATE_TRUNC('month', CURRENT_DATE)
  AND e.date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
ORDER BY e.date DESC;
```

### Get monthly total in default currency

```sql
SELECT
  u.nickname,
  u.default_currency,
  SUM(e.amount_in_default_currency) as total,
  COUNT(*) as expense_count
FROM expenses e
JOIN users u ON e.user_id = u.id
WHERE e.user_id = (SELECT id FROM users WHERE telegram_id = '123456789')
  AND e.date >= DATE_TRUNC('month', CURRENT_DATE)
  AND e.date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
GROUP BY u.nickname, u.default_currency;
```

### Get spending breakdown by original currency

```sql
SELECT
  e.currency,
  SUM(e.amount) as total_in_original_currency,
  SUM(e.amount_in_default_currency) as total_in_default_currency,
  COUNT(*) as count,
  u.default_currency
FROM expenses e
JOIN users u ON e.user_id = u.id
WHERE e.user_id = (SELECT id FROM users WHERE telegram_id = '123456789')
  AND e.date >= DATE_TRUNC('month', CURRENT_DATE)
  AND e.date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
GROUP BY e.currency, u.default_currency
ORDER BY total_in_default_currency DESC;
```

### Get breakdown by category

```sql
SELECT
  category,
  COUNT(*) as count,
  SUM(amount_in_default_currency) as total,
  ROUND(SUM(amount_in_default_currency) * 100.0 /
    SUM(SUM(amount_in_default_currency)) OVER (), 2) as percentage
FROM expenses
WHERE user_id = (SELECT id FROM users WHERE telegram_id = '123456789')
  AND date >= DATE_TRUNC('month', CURRENT_DATE)
  AND date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
GROUP BY category
ORDER BY total DESC;
```

### Get exchange rate

```sql
SELECT rate, updated_at
FROM exchange_rates
WHERE from_currency = 'JPY'
  AND to_currency = 'THB'
ORDER BY updated_at DESC
LIMIT 1;
```

### Update exchange rate

```sql
INSERT INTO exchange_rates (from_currency, to_currency, rate, source)
VALUES ('JPY', 'THB', 0.25, 'exchangerate-api.com')
ON CONFLICT (from_currency, to_currency)
DO UPDATE SET
  rate = EXCLUDED.rate,
  source = EXCLUDED.source,
  updated_at = NOW()
RETURNING *;
```

### Get user's conversation state

```sql
SELECT state, data
FROM conversation_states
WHERE user_id = (SELECT id FROM users WHERE telegram_id = '123456789');
```

### Set conversation state

```sql
INSERT INTO conversation_states (user_id, state, data)
VALUES (
  (SELECT id FROM users WHERE telegram_id = '123456789'),
  'awaiting_vendor',
  '{"item": "taiyaki", "amount": 110, "currency": "JPY"}'::jsonb
)
ON CONFLICT (user_id)
DO UPDATE SET
  state = EXCLUDED.state,
  data = EXCLUDED.data,
  updated_at = NOW()
RETURNING *;
```

### Clear conversation state

```sql
DELETE FROM conversation_states
WHERE user_id = (SELECT id FROM users WHERE telegram_id = '123456789');
```

---

## Migration Notes

### Changes from V1 to V2

**Users table:**
- Changed: `phone_number` → `telegram_id`
- Added: `nickname`, `country`, `timezone`, `default_currency`, `onboarding_completed`
- Removed: `name` (now using `nickname` + `first_name`)

**Expenses table:**
- Renamed: `price` → `amount`
- Renamed: `effective_price` → `amount_in_default_currency`
- Added: `currency`, `exchange_rate`
- Removed: `tax_rate` (simplified for now)
- Updated: `source` now includes 'chat' option

**New tables:**
- `exchange_rates` - Currency conversion rates
- `conversation_states` - Multi-step conversation tracking

---

## Country → Currency Mapping

```typescript
const countryCurrencyMap = {
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
```

---

## Performance Notes

- **Indexes:** Created on frequently queried columns (user_id, date, category, currency)
- **Caching:** Exchange rates cached in database (update daily)
- **Caching:** Sheet exports table caches Google Sheet URLs
- **Cascading:** DELETE on user cascades to expenses and conversation_states
- **JSON data:** conversation_states uses JSONB for flexible state storage

---

## Backup Strategy

**Supabase handles backups automatically:**
- Daily backups (retained for 7 days on free tier)
- Point-in-time recovery available on paid tiers

**Additional backup:**
- Monthly export to Google Sheets via `/export` command
- Store in Google Drive

---

## Next Steps

1. ✅ Run SQL schema in Supabase SQL Editor
2. ⏳ Update TypeScript types to match new schema
3. ⏳ Update DatabaseService with new methods
4. ⏳ Implement onboarding flow (/start)
5. ⏳ Implement currency conversion service
6. ⏳ Implement conversational AI flow

---

*Version: 2.0.0*
*Last Updated: 2026-03-26*
