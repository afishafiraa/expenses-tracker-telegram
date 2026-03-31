# BillNot - Implementation Plan

## Project Overview

**Goal:** Build a WhatsApp AI bot to track monthly expenses automatically with data stored in Google Sheets.

**User Experience:**
```
User → WhatsApp → AI Bot → Google Sheets
             ↓
        AI replies with confirmation
```

---

## Core Features

### 1. Image Input (Receipt/Bill Photo)
**User Action:**
- Send photo of receipt/bill via WhatsApp

**Bot Behavior:**
1. Receives image message
2. AI reads and extracts:
   - Date
   - Vendor name
   - Items purchased
   - Price (before tax)
   - Tax rate (if applicable)
   - Total amount (after tax)
   - Payment method
3. Saves to Google Sheets (creates monthly tab if needed)
4. Replies with confirmation message

**Example:**
```
User: [Sends photo of 7-11 receipt]
Bot: ✅ Recorded!
     7-Eleven - Lunch
     89.00 THB
     (Food) on 2026-03-25
```

---

### 2. Text Input (Simple Message)
**User Action:**
- Send text message with expense details

**Bot Behavior:**
1. Receives text message
2. AI parses natural language:
   - "today drink cola 200 yen cash"
   - "grab 185 to office"
   - "lunch 89 at 7-11"
3. Extracts: date, vendor, item, amount, payment method, category
4. Saves to Google Sheets
5. Replies with confirmation

**Example:**
```
User: today drink cola 200 yen cash
Bot: ✅ Recorded!
     Convenience Store - cola
     200.00 JPY (Cash)
     (Food) on 2026-03-25
```

---

### 3. Monthly Report Command
**Command:** `/report`

**Bot Behavior:**
1. Generates Excel/CSV file from current month's Google Sheet
2. Includes:
   - All expenses for the month
   - Summary by category
   - Total before/after tax
   - Charts (optional)
3. Sends file via WhatsApp

**Example:**
```
User: /report
Bot: 📊 Generating your March 2026 report...
     [Sends file: expenses_2026-03.xlsx]

     Summary:
     - Total expenses: 15,250 THB
     - Categories: Food (40%), Transport (30%), Utilities (30%)
```

---

### 4. Total Spend Command
**Command:** `/totalspend`

**Bot Behavior:**
1. Calculates total expenses for current month
2. Shows breakdown by category
3. Compares with previous month (optional)

**Example:**
```
User: /totalspend
Bot: 💰 Your spending for March 2026:

     Total: 15,250.00 THB

     Breakdown:
     🍔 Food: 6,100 THB (40%)
     🚗 Transport: 4,575 THB (30%)
     💡 Utilities: 4,575 THB (30%)
```

---

## Technical Architecture

### Components

```
┌─────────────┐
│  WhatsApp   │
│   (User)    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ WhatsApp        │
│ Business API    │ (Webhook)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Node.js Server │
│  (Express)      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────────┐
│ Gemini │ │Google Sheets │
│   AI   │ │     API      │
└────────┘ └──────────────┘
```

### Tech Stack

1. **AI Processing:** Google Gemini 2.5 Flash (Free)
   - Text extraction from images
   - Natural language parsing
   - Structured data output

2. **Data Storage:** Google Sheets API (Free)
   - Monthly sheet tabs (YYYY-MM format)
   - Auto-creates tabs when needed
   - Real-time data sync

3. **WhatsApp Integration:** Meta WhatsApp Business API (Free tier)
   - Webhook for receiving messages
   - Send API for replies
   - 1,000 conversations/month free

4. **Server:** Node.js + TypeScript + Express
   - Webhook handler
   - Service layer architecture
   - Runs locally or on cloud

---

## Data Structure

### Google Sheets Format

**Sheet Name:** `YYYY-MM` (e.g., "2026-03")

**Columns:**
| Column | Description | Example |
|--------|-------------|---------|
| Date | Transaction date | 2026-03-25 |
| Vendor | Store/company name | 7-Eleven |
| Item | Product/service | Lunch |
| Category | Expense category | Food |
| Price | Amount before tax | 82.40 |
| Payment Method | How paid | Cash |
| Description | Additional notes | Lunch bento |
| Effective Price | Amount after tax | 89.00 |
| Cumulative Price | Running total | =SUM($H$2:H2) |
| Source | text or image | text |

**Categories:**
- Food
- Transport
- Utilities
- Rent
- Subscription
- Shopping
- Entertainment
- Healthcare
- Other

---

## Implementation Status

### ✅ Completed (Phase 1)

1. **Gemini AI Integration**
   - Text message parsing
   - Image bill extraction
   - JSON output formatting

2. **Google Sheets Integration**
   - Auto-create monthly tabs
   - Append expense rows
   - Cumulative calculations
   - Monthly total queries

3. **WhatsApp Webhook**
   - Receive text messages
   - Receive image messages
   - Webhook verification
   - Message processing

4. **Core Logic**
   - Bill entry creation
   - Category classification
   - Date handling
   - Tax calculations

### 🚧 In Progress (Phase 2)

1. **WhatsApp Replies**
   - Issue: Recipient phone number restriction
   - Status: Messages received & saved ✅, replies blocked ❌
   - Fix needed: Add phone to recipient list or get production access

### 📋 Pending (Phase 3)

1. **Command: `/report`**
   - Generate Excel/CSV from Google Sheets
   - Format and send file via WhatsApp

2. **Command: `/totalspend`**
   - Calculate monthly total
   - Breakdown by category
   - Format message with emojis

3. **Additional Commands**
   - `/help` - Show available commands
   - `/categories` - Show expense categories
   - `/lastweek` - Show last 7 days summary

---

## Setup Requirements

### APIs & Credentials

1. **Gemini API**
   - Get key from: https://aistudio.google.com/apikey
   - Free tier: 1,500 requests/day
   - ✅ Currently configured

2. **Google Sheets API**
   - Service account with JSON credentials
   - Share spreadsheet with service account email
   - ✅ Currently configured

3. **WhatsApp Business API**
   - Meta Developer account
   - App with WhatsApp product
   - Phone Number ID and Access Token
   - ✅ Currently configured (replies need fix)

### Infrastructure

1. **Server**
   - Node.js 20+
   - TypeScript
   - Port 3333 (configurable)

2. **Tunnel (Development)**
   - ngrok for webhook access
   - Static domain recommended
   - HTTPS required

3. **Environment Variables**
   - Gemini API key
   - Google Sheets credentials
   - WhatsApp tokens
   - Port configuration

---

## Current Challenges

### 1. WhatsApp Reply Restriction
**Problem:** Bot receives messages but can't send replies

**Error:** `(#131030) Recipient phone number not in allowed list`

**Cause:** Using test/temporary access token in development mode

**Solutions:**
- **Option A:** Add phone to recipient list in Meta dashboard
- **Option B:** Use production access token (requires business verification)
- **Option C:** Skip replies, check Google Sheets directly (works now!)

### 2. Commands Not Implemented Yet
**Status:** Basic text/image processing works, but `/report` and `/totalspend` need to be built

**Next Steps:**
- Implement command detection
- Build report generation logic
- Add file export functionality

---

## Cost Analysis

### Current Setup (Free)

| Service | Free Tier | Usage | Status |
|---------|-----------|-------|--------|
| Gemini API | 1,500 req/day | ~50-100/day | ✅ Free |
| Google Sheets | Unlimited | Low | ✅ Free |
| WhatsApp API | 1,000 conv/month | ~20-50/month | ✅ Free |
| Hosting | - | Local Mac | ✅ Free |

**Total Cost:** $0/month

### Future Scaling (if needed)

- **Railway/Render hosting:** $5-10/month (if moving from local)
- **Static ngrok domain:** Free tier available
- **Gemini API:** Still free at low volume

---

## User Flow Examples

### Example 1: Image Bill

```
[10:30 AM] User sends photo of restaurant receipt

[10:31 AM] Bot: 📸 Processing your invoice...

[10:31 AM] Bot: ✅ Recorded!

               Oishi Restaurant - Dinner
               450.00 THB (incl. tax 8%)
               (Food) on 2026-03-25
               Payment: Credit Card
```

### Example 2: Text Message

```
[3:45 PM] User: grab 185 to office

[3:45 PM] Bot: ✅ Recorded!

               Grab - Transport
               185.00 THB
               (Transport) on 2026-03-25
```

### Example 3: Monthly Report

```
[11:00 PM] User: /totalspend

[11:00 PM] Bot: 💰 Your spending for March 2026:

               Total (after tax): 8,245.00 THB
               Total (before tax): 7,850.00 THB

               Breakdown:
               🍔 Food: 3,500 THB (42%)
               🚗 Transport: 2,100 THB (25%)
               💡 Utilities: 1,250 THB (15%)
               🛒 Shopping: 1,395 THB (18%)
```

### Example 4: Generate Report

```
[5:00 PM] User: /report

[5:00 PM] Bot: 📊 Generating your March 2026 report...

[5:01 PM] Bot: ✅ Here's your expense report!
               [expenses_2026-03.xlsx]

               Total entries: 45
               Date range: 2026-03-01 to 2026-03-25
```

---

## Next Steps

### Immediate (Fix Core)
1. Resolve WhatsApp reply restriction
2. Test end-to-end with real messages
3. Verify Google Sheets data accuracy

### Short Term (Add Commands)
1. Implement `/totalspend` command
2. Implement `/report` command with file export
3. Add `/help` command

### Long Term (Enhancements)
1. Budget tracking (set monthly budget, get alerts)
2. Recurring expense tracking (subscriptions)
3. Multi-currency support
4. Export to other formats (PDF, CSV)
5. Analytics dashboard (web interface)
6. Multi-user support (family/team tracking)

---

## Success Criteria

**MVP is successful when:**
- ✅ User sends text → Bot saves to Sheets
- ✅ User sends image → Bot reads & saves to Sheets
- ✅ Bot replies with confirmation
- ✅ `/totalspend` shows accurate monthly total
- ✅ `/report` generates downloadable file

**User satisfaction:**
- Faster than manual entry (< 30 seconds per expense)
- More convenient than opening spreadsheet
- Accurate data extraction (>90%)
- Always available (24/7 uptime)

---

## Maintenance Plan

### Daily
- Monitor webhook logs for errors
- Check Google Sheets data integrity

### Weekly
- Review failed message processing
- Update AI prompts if extraction accuracy drops

### Monthly
- Verify API quotas not exceeded
- Check token expiration dates
- Archive old sheets if needed

---

## Version History

- **v0.1 (2026-03-25):** Initial implementation with text & image processing
- **v0.2 (TBD):** Add commands (/totalspend, /report)
- **v0.3 (TBD):** Production-ready with WhatsApp reply fix
- **v1.0 (TBD):** Fully featured MVP release

---

*Last Updated: 2026-03-25*
