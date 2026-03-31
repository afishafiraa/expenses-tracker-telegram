# BillNot - WhatsApp Bill Tracker

## Overview

A multi-user bill tracking system where users send invoice photos or text messages via WhatsApp to an AI bot. The AI extracts bill details and records them in a database. Users can export their data to Google Sheets on-demand.

**Key Features:**
- 📱 Send text or image bills via WhatsApp
- 🤖 AI automatically extracts and categorizes expenses
- 🗄️ Database stores all user data (fast, scalable)
- 📊 Export to Google Sheets on command
- 👥 Multi-user support (each user sees only their data)
- 💰 Commands: `/totalspend`, `/export`, `/help`

---

## Architecture (Current Implementation)

### Telegram Bot with Database-First Approach ⭐ **CHOSEN**

```
Telegram (Multiple Users)
    ↓
Telegram Bot API (Polling/Webhook)
    ↓
Node.js Bot (TypeScript)
    ├→ Gemini AI (Extract & Parse)
    ↓
Supabase Database (Primary Storage)
    ↓
  [On Demand]
    ↓
Google Sheets (Export)
```

| Component          | Tool                        | Why                                                    |
| ------------------ | --------------------------- | ------------------------------------------------------ |
| Messaging          | **Telegram Bot API**        | **SUPER EASY!** No setup hell, instant bot creation    |
| Bot Framework      | node-telegram-bot-api       | Mature library, supports polling & webhooks            |
| Language           | Node.js + TypeScript        | Type-safe, easy to extend                              |
| AI Processing      | Google Gemini 2.5 Flash     | **FREE** (1,500 req/day), vision + text parsing        |
| Database           | Supabase (PostgreSQL)       | **FREE** (500MB), multi-user, fast queries            |
| Export             | Google Sheets API           | Generate sheets on-demand per user                     |
| Hosting            | Railway / Render (optional) | Can run locally or deploy to cloud                     |

### Why This Stack?

**Why Telegram (not WhatsApp)?** 🎯 **KEY DECISION**
- ✅ **5-minute setup** - Just message @BotFather, get token, done!
- ✅ **No approval needed** - Works instantly
- ✅ **No recipient restrictions** - Anyone can use your bot immediately
- ✅ **Built-in commands** - `/start`, `/help`, `/totalspend` work natively
- ✅ **Unlimited users for FREE** - No conversation limits
- ✅ **Better API** - Simpler, better documented
- ✅ **File handling** - Photos, documents, easy to send/receive
- ❌ **Only con:** Users need Telegram app (but it's free and popular)

**Why Database (not Google Sheets directly)?**
- ✅ **Multi-user support** - Each user has isolated data
- ✅ **Fast queries** - Indexed, optimized for reads/writes
- ✅ **Scalable** - Can handle 100+ users easily
- ✅ **No rate limits** - Unlike Google Sheets API (60 req/min)
- ✅ **Complex queries** - Category breakdown, date ranges, analytics
- ✅ **Better for commands** - `/totalspend` is instant

**Why Export to Sheets?**
- ✅ **Familiar interface** - Users know how to use spreadsheets
- ✅ **Easy sharing** - Can share with family/accountant
- ✅ **Manual editing** - User can fix errors directly
- ✅ **Charts & formulas** - Built-in visualization
- ✅ **On-demand** - Only create when user requests

**Why Gemini (not Claude)?**
- ✅ **100% FREE** - No credit card needed!
- ✅ **1,500 requests/day** - More than enough
- ✅ **Vision support** - Can read invoice images
- ✅ **Good accuracy** - Comparable to Claude for this task

---

## Database Schema

### users table
```sql
- id (UUID, primary key)
- phone_number (VARCHAR, unique)
- name (VARCHAR, optional)
- created_at (TIMESTAMP)
- last_active_at (TIMESTAMP)
```

### expenses table
```sql
- id (UUID, primary key)
- user_id (UUID, foreign key → users.id)
- date (DATE)
- vendor (VARCHAR)
- item (VARCHAR)
- category (VARCHAR) -- Food, Transport, Utilities, etc.
- price (DECIMAL) -- before tax
- tax_rate (DECIMAL) -- 0, 0.08, 0.10
- effective_price (DECIMAL) -- after tax
- payment_method (VARCHAR) -- Cash, Credit Card, QR, etc.
- description (TEXT)
- source (VARCHAR) -- 'text' or 'image'
- created_at (TIMESTAMP)
```

**See full schema:** `docs/DATABASE_SCHEMA.md`

---

## Workflow Detail

### Flow 1: Receive WhatsApp Message

```
1. User sends message to bot (+1 555 158 4058)
2. Meta WhatsApp API sends webhook to our server
3. Server identifies user by phone number
4. Get or create user in database
5. Check message type (text, image, or command)
```

### Flow 2: AI Processing (Text/Image)

```
For Text Message:
- Extract: date, vendor, item, amount, category
- Use Gemini AI with natural language prompt
- Return structured JSON

For Image Message:
- Download image from WhatsApp
- Send to Gemini Vision API
- Extract all bill fields from image
- Return structured JSON
```

### Flow 3: Save to Database

```
1. Parse AI response (JSON)
2. Insert expense record with user_id
3. Reply to WhatsApp with confirmation
4. Example: "✅ Recorded! Grab - 185 THB (Transport) on 2026-03-25"
```

### Flow 4: Handle Commands

```
/totalspend:
  - Query database for user's monthly expenses
  - Calculate total and breakdown by category
  - Reply with formatted message

/export:
  - Query all user's expenses for current month
  - Create new Google Sheet
  - Format data (same columns as before)
  - Share sheet link via WhatsApp

/help:
  - Send list of available commands
```

---

## Google Sheets Export Structure

When user runs `/export`, a Google Sheet is generated from database with this format:

**Sheet Name:** `{UserName}_Expenses_{YYYY-MM}`

| Date       | Vendor        | Item   | Category     | Price | Payment  | Description      | Effective Price | Source |
| ---------- | ------------- | ------ | ------------ | ----- | -------- | ---------------- | --------------- | ------ |
| 2026-03-17 | Thai Electric | Bill   | Utilities    | 1,157 | Transfer | March electricity| 1,250           | image  |
| 2026-03-17 | LINE Mobile   | Plan   | Subscription | 599   | Auto     | Monthly phone    | 599             | text   |
| 2026-03-18 | Grab          | Ride   | Transport    | 185   | Cash     | To office        | 185             | text   |

### Auto-calculated Summary (added at bottom)
- **Total (before tax):** =SUM(E:E)
- **Total (after tax):** =SUM(H:H)
- **By Category:** =SUMIF(D:D, "Food", H:H) for each category

---

## Setup Steps (Telegram Implementation)

### Step 1: Create Telegram Bot (2 minutes) ⭐ **START HERE**
1. Open Telegram app
2. Search for **@BotFather**
3. Send command: `/newbot`
4. Enter bot name: `BillNot Expense Tracker`
5. Enter username: `billnot_expense_bot` (must end with `_bot`)
6. **Copy the token** - looks like: `7123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`
7. Add to `.env` file as `TELEGRAM_BOT_TOKEN`

**That's it! No approval, no waiting, works immediately!**

### Step 2: Gemini API Setup (5 minutes)
1. Go to https://aistudio.google.com/apikey
2. Sign in with Google account
3. Click "Create API key"
4. Copy the key (FREE - no credit card needed!)
5. Add to `.env` file as `GEMINI_API_KEY`

### Step 3: Supabase Database Setup (10 minutes)
1. Go to https://supabase.com
2. Create free account
3. Create new project
4. Go to SQL Editor, run schema from `docs/DATABASE_SCHEMA.md`
5. Get credentials:
   - Project URL
   - Anon key
   - Service key
6. Add to `.env` file

### Step 4: Google Sheets API Setup (15 minutes - OPTIONAL for now)
1. Create Google Cloud project
2. Enable Google Sheets API
3. Create Service Account, download JSON credentials
4. Add credentials to `config/google-credentials.json`
5. This is only for `/export` command - can add later

### Step 5: Run the Bot

**Install dependencies:**
```bash
npm install node-telegram-bot-api @supabase/supabase-js
npm install --save-dev @types/node-telegram-bot-api
```

**Run locally:**
```bash
npm run dev
```

**That's it!** Bot starts polling Telegram. No webhooks, no ngrok, no headaches!

**Test:**
1. Open Telegram
2. Search for your bot: `@billnot_expense_bot`
3. Send `/start`
4. Bot replies instantly!

**Production (optional - can run on your computer):**
```bash
# Deploy to Railway/Render
git push origin main
# Bot runs 24/7 in cloud
```

---

## Cost Estimate (Current Stack)

### For 10 Active Users

| Service              | Free Tier Limit              | Monthly Cost |
| -------------------- | ---------------------------- | ------------ |
| WhatsApp Business API| 1,000 conversations          | **$0**       |
| Gemini API           | 1,500 requests/day           | **$0**       |
| Supabase Database    | 500MB storage, unlimited API | **$0**       |
| Google Sheets API    | 60 requests/min (exports)    | **$0**       |
| Railway/Render Host  | 500 hours/month              | **$0**       |
| **Total**            |                              | **$0/month** |

### Usage Estimates
- **10 users** × 50 expenses/month = 500 AI requests/month (well under 45k/month limit)
- **10 users** × 2 exports/month = 20 sheet creations/month (well under API limit)
- **Database:** ~5,000 expense records = ~5MB storage (1% of free tier)

**🎉 Completely FREE for up to 30-50 active users!**

---

## Sample Telegram Messages

### Recording Expenses

**Text Input:**
```
User: grab 185 to office
Bot: ✅ Recorded!
     Grab - Transport
     185.00 THB on 2026-03-25

User: lunch 89 at 7-11
Bot: ✅ Recorded!
     7-Eleven - Lunch
     89.00 THB (Food) on 2026-03-25

User: today drink cola 200 yen cash
Bot: ✅ Recorded!
     Convenience Store - cola
     200.00 JPY (Cash) on 2026-03-25
```

**Image Input:**
```
User: [Sends photo of restaurant receipt]
Bot: 📸 Processing your invoice...

Bot: ✅ Recorded!
     Oishi Restaurant - Dinner
     450.00 THB (incl. tax 8%)
     (Food) on 2026-03-25
     Payment: Credit Card
```

### Commands

**Monthly Summary:**
```
User: /totalspend
Bot: 💰 Your March 2026 spending:

     Total: 8,450.00 THB
     Entries: 23

     Breakdown:
     🍔 Food: 3,380 THB (40%)
     🚗 Transport: 2,535 THB (30%)
     💡 Utilities: 1,690 THB (20%)
     🛒 Other: 845 THB (10%)
```

**Export to Sheets:**
```
User: /export
Bot: 📊 Generating your March 2026 expenses...

Bot: ✅ Your expense sheet is ready!
     📄 23 entries exported
     🔗 https://docs.google.com/spreadsheets/d/abc123...

     You can view, edit, and download the sheet.
```

**Help:**
```
User: /help
Bot: 📖 BillNot Commands:

     💬 Record expenses:
     • Text: "grab 185 to office"
     • Image: Send receipt photo

     📊 Commands:
     /totalspend - Monthly total & breakdown
     /export - Generate Google Sheet
     /lastweek - Last 7 days summary
     /help - Show this message
```

---

## Implementation Status

### ✅ Phase 1 - Core Functionality (COMPLETED)
- [x] Set up Gemini API (free)
- [x] Text message parsing with Gemini
- [x] Image bill extraction with Gemini Vision
- [x] Data structure & types defined
- [x] Telegram!

### ✅ Phase 2 - Google Sheets Integration (COMPLETED - Will use for export)
- [x] Set up Google Sheets API
- [x] Sheet creation and formatting logic
- [x] Can reuse for `/export` command

### 🚧 Phase 3 - Telegram Migration (IN PROGRESS) ⭐ **CURRENT**
- [ ] Create Telegram bot with @BotFather
- [ ] Install node-telegram-bot-api
- [ ] Build Telegram bot service
- [ ] Handle text messages
- [ ] Handle photo messages
- [ ] Implement command handlers (/start, /help)
- [ ] Test with real users (no restrictions!)

### 🚧 Phase 4 - Database Migration (NEXT)
- [ ] Set up Supabase database
- [ ] Create database schema (users, expenses)
- [ ] Build database service layer
- [ ] Connect Telegram bot to database
- [ ] Test multi-user isolation

### 📋 Phase 5 - Commands (PENDING)
- [ ] Implement `/totalspend` command
- [ ] Implement `/export` command (database → Google Sheets)
- [ ] Implement `/help` command (built-in to Telegram!)
- [ ] Implement `/lastweek` command (optional)

### 📋 Phase 6 - Production Ready (PENDING)
- [ ] Deploy to Railway/Render (optional - can run locally!)
- [ ] Test with 5-10 real users (no restrictions!)
- [ ] Monitor errors and fix bugs
- [ ] Add usage analytics

### 🎯 Phase 6 - Nice to Have (FUTURE)
- [ ] Budget tracking & alerts
- [ ] Recurring expense tracking (subscriptions)
- [ ] Multi-currency support
- [ ] Edit/delete last entry command
- [ ] Web dashboard (view expenses online)
- [ ] Export to PDF/CSV
- [ ] Category customization per user

---

## Why Not Other Tools?

| Alternative        | Why Not Chosen                                               |
| ------------------ | ------------------------------------------------------------ |
| **WhatsApp Business API** | ❌ **Tried for hours!** Recipient list hell, token issues, complex setup. Switched to Telegram! |
| **OpenClaw**       | Tried but setup was complex (gateway issues, Anthropic key needed). Not simpler than custom code. |
| **n8n**            | Good option but adds extra layer. Direct Node.js gives more control for multi-user. |
| **Make.com**       | Similar to n8n but paid. Not worth it for our use case. |
| **Google Sheets only** | Rate limits (60 req/min), slow for multi-user, hard to query. Database is better. |
| **Zapier**         | Too expensive ($20+/month), limited free tier. |
| **Twilio WhatsApp** | Paid ($1-2/month), users need to "join" first. Telegram is free & easier. |
| **Evolution API**  | WhatsApp Web wrapper, risk of ban. Official Telegram API is better. |
| **Discord bot**    | Considered, but Telegram has better mobile UX for personal expense tracking. |

### Why Custom Node.js + Database Won

**Pros:**
- ✅ Full control over multi-user logic
- ✅ Type-safe with TypeScript
- ✅ Easy to add features (commands, analytics)
- ✅ Database enables complex queries
- ✅ Can scale to 100+ users
- ✅ Free (Gemini + Supabase + Railway)
- ✅ Self-hosted option available

**Cons:**
- ❌ More code to write (but we've already done it!)
- ❌ Meta API setup is complex (but it's done)
- ❌ Need to manage deployment (but Railway is easy)

---

## Multi-User Support

### How It Works

1. **User Identification:**
   - Each WhatsApp number is a unique user
   - Automatically create user record on first message

2. **Data Isolation:**
   - Database queries filtered by `user_id`
   - Users can ONLY see their own expenses
   - No cross-user data leakage

3. **Commands per User:**
   - `/totalspend` shows YOUR total only
   - `/export` creates YOUR sheet only
   - Each user gets their own Google Sheet

4. **Testing with Friends:**
   - Add friend's phone numbers to Meta recipient list
   - Each tester messages the bot independently
   - Each tester tracks their own expenses
   - Verify data isolation between users

---

## Next Steps

### Immediate (Start Building Database)

1. **Create Supabase account** (2 minutes)
   - https://supabase.com
   - Create new project

2. **Set up database schema** (10 minutes)
   - Run SQL from `docs/DATABASE_SCHEMA.md`
   - Test with sample data

3. **Install dependencies** (1 minute)
   ```bash
   npm install @supabase/supabase-js
   ```

4. **Create database service** (30 minutes)
   - `src/services/database.service.ts`
   - Methods: getOrCreateUser, saveExpense, getMonthlyTotal

5. **Update bot logic** (1 hour)
   - Replace Sheets service with Database service
   - Test with your account

6. **Test multi-user** (30 minutes)
   - Add tester to recipient list
   - Test with different phone numbers
   - Verify data isolation

### Short Term (Telegram Migration) ⚡ **THIS WEEK**

1. **Create Telegram bot** (2 minutes) ← START HERE!
2. **Migrate to Telegram Bot API** (1 hour)
3. **Test text messages** (15 minutes)
4. **Test image messages** (15 minutes)
5. **Set up Supabase database** (30 minutes)
6. **Connect bot to database** (1 hour)
7. **Test multi-user** (15 minutes)

**Total time: ~3-4 hours to working multi-user bot!**

### Medium Term (Add Commands)

1. **Implement /totalspend** (1 hour)
2. **Implement /export** (2 hours)
3. **Implement /help** (already built-in!)

### Long Term (Production)

1. **Deploy to Railway/Render** (optional - can run locally)
2. **Share with friends** (instant - no approval needed!)
3. **Monitor & fix bugs** (ongoing)
4. **Add features based on feedback** (future)

---

## Resources

- **Current codebase:** `/Users/gaogao/Dev/Afi/Portfolio/billnot/`
- **Database schema:** `docs/DATABASE_SCHEMA.md`
- **Implementation details:** `docs/IMPLEMENTATION_PLAN.md`
- **Meta WhatsApp API:** https://developers.facebook.com/docs/whatsapp
- **Gemini API:** https://ai.google.dev/docs
- **Supabase Docs:** https://supabase.com/docs

---

## Risks & Mitigations

| Risk                                | Mitigation                                           |
| ----------------------------------- | ---------------------------------------------------- |
| WhatsApp recipient list restriction | Add all testers to recipient list manually           |
| Invoice image quality is poor       | Gemini handles blurry text well; ask user to re-send |
| AI extracts wrong amount            | Always reply with extracted data so user can verify  |
| Database free tier fills up         | 500MB = ~50K expenses, enough for years              |
| Multiple users stress test bot      | Supabase handles 50+ concurrent users easily         |
| Export creates too many sheets      | Reuse sheets if already created (cache in database)  |

---

*Last Updated: 2026-03-25*
*Status: Phase 3 (Database Migration) - Ready to implement*
