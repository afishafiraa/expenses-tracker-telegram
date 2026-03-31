# BillNot - Product Requirements Document (PRD)

## Product Overview

**Product Name:** BillNot
**Version:** 1.0 (MVP)
**Target Users:** Individual users who want to track daily expenses via WhatsApp
**Platform:** WhatsApp Bot + Google Sheets

### Problem Statement
Manually tracking daily expenses is tedious. Users have to:
- Open a spreadsheet app
- Remember invoice details
- Type everything manually
- Switch between apps constantly

**Solution:** Send invoice photos or quick text messages to WhatsApp. AI extracts the data and logs it automatically to Google Sheets.

---

## User Personas

### Primary User: Budget-Conscious Individual
- Age: 25-45
- Uses WhatsApp daily
- Wants to track spending but finds traditional apps too complicated
- Takes photos of receipts but never organizes them
- Comfortable with Google Sheets for viewing data

---

## User Stories

### Core Features (MVP)

| ID | User Story | Acceptance Criteria |
|----|-----------|---------------------|
| US-01 | As a user, I want to send a photo of my invoice to WhatsApp so that the bill is automatically recorded | - Bot receives image<br>- AI extracts: date, vendor, amount, category<br>- Data is written to Google Sheets<br>- Confirmation reply sent |
| US-02 | As a user, I want to send text messages like "lunch 150" so that quick expenses are logged without taking photos | - Bot receives text<br>- AI parses: amount, description<br>- Uses current date<br>- Writes to Google Sheets<br>- Confirmation reply sent |
| US-03 | As a user, I want a new sheet tab created each month so that I can view expenses by month | - On first bill of a new month, create new tab named "YYYY-MM"<br>- Tab includes header row<br>- Previous months remain accessible |
| US-04 | As a user, I want to see a confirmation message after logging a bill so that I know it was recorded correctly | - Reply includes: vendor, amount, category, date<br>- User can verify accuracy<br>- Reply sent within 5 seconds |
| US-05 | As a user, I want to type "summary" and get my monthly total spending | - Bot calculates total for current month<br>- Replies with total amount<br>- Optionally shows breakdown by category |

### Future Enhancements (Post-MVP)

| ID | User Story | Priority |
|----|-----------|----------|
| US-06 | As a user, I want to edit the last entry if AI extracted wrong data | Medium |
| US-07 | As a user, I want to set budget limits and get alerts when exceeded | Medium |
| US-08 | As a user, I want a monthly summary report sent automatically | Low |
| US-09 | As a user, I want to categorize custom categories beyond the defaults | Low |
| US-10 | As a user, I want to track expenses in multiple currencies | Low |

---

## Functional Requirements

### 1. WhatsApp Message Handling

**FR-1.1:** System shall receive WhatsApp messages (text and images)
**FR-1.2:** System shall differentiate between image and text messages
**FR-1.3:** System shall download images from WhatsApp API
**FR-1.4:** System shall handle message delivery failures gracefully

### 2. AI Data Extraction

**FR-2.1:** System shall use Claude Vision API to extract data from invoice images
**FR-2.2:** System shall extract the following fields:
- Date (format: YYYY-MM-DD)
- Vendor/shop name
- Item name(s)
- Price per item (before tax)
- Tax rate (0%, 8%, or 10% - common in invoices)
- Effective Price (price including tax)
- Category (from predefined list)
- Payment method (cash, credit card, QR, transfer, etc.)
- Description (brief, max 100 chars)

**FR-2.3:** System shall parse casual text messages (e.g., "grab 185", "lunch 89 at 7-11")
**FR-2.4:** System shall default to current date if date is not specified
**FR-2.5:** System shall use "Other" category if category cannot be determined
**FR-2.6:** System shall detect tax rate from invoice (8% or 10%) and calculate effective price
**FR-2.7:** If invoice has multiple items, system shall create one row per item
**FR-2.8:** If no tax is shown on invoice, default to 0% (effective price = price)

**Predefined Categories:**
- Food
- Transport
- Utilities
- Rent
- Subscription
- Shopping
- Entertainment
- Healthcare
- Other

### 3. Google Sheets Integration

**FR-3.1:** System shall check if a sheet tab for the current month exists
**FR-3.2:** System shall create a new monthly tab with format "YYYY-MM" if it doesn't exist
**FR-3.3:** System shall append data as a new row to the correct monthly tab

**Sheet Structure:**
| Column | Field | Type |
|--------|-------|------|
| A | Date | Date (YYYY-MM-DD) |
| B | Vendor | Text |
| C | Item | Text |
| D | Category | Text |
| E | Price | Number |
| F | Payment method | Text |
| G | Description | Text |
| H | Effective Price | Number |
| I | Cumulative Price | Number |
| J | Source | Text (image/text) |

**FR-3.4:** System shall add header row to new monthly tabs
**FR-3.5:** System shall add SUM formula for Price column and Effective Price column
**FR-3.6:** Cumulative Price column shall use a running total formula (sum of all Effective Price rows up to current row)
**FR-3.7:** System shall handle Google Sheets API rate limits

### 4. Response Messages

**FR-4.1:** System shall send confirmation reply within 10 seconds
**FR-4.2:** Confirmation format:
  - Single item: `"Recorded! {Vendor} - {Item} {EffectivePrice} THB ({Category}) on {Date}"`
  - Multi-item: `"Recorded! {Vendor} - {N} items, total {TotalEffectivePrice} THB on {Date}"`
  - If tax applied, include tax info: `"(incl. tax {taxRate}%)"`
**FR-4.3:** System shall handle "summary" command and reply with monthly total
**FR-4.4:** System shall handle "summary {category}" command for category totals
**FR-4.5:** System shall send error message if extraction fails

---

## Non-Functional Requirements

### Performance

**NFR-1.1:** Image processing shall complete within 10 seconds
**NFR-1.2:** Text message processing shall complete within 5 seconds
**NFR-1.3:** System shall handle at least 10 concurrent requests
**NFR-1.4:** Monthly sheet creation shall complete within 3 seconds

### Reliability

**NFR-2.1:** System uptime shall be 99% (7.2 hours downtime/month acceptable)
**NFR-2.2:** System shall retry failed API calls up to 3 times
**NFR-2.3:** System shall log all errors for debugging
**NFR-2.4:** Data shall not be lost even if WhatsApp reply fails

### Security

**NFR-3.1:** WhatsApp connection shall use end-to-end encryption
**NFR-3.2:** Google Sheets API credentials shall be stored securely (env variables)
**NFR-3.3:** Only the authorized user's WhatsApp number shall be allowed
**NFR-3.4:** Claude API key shall be stored securely (not in code)

### Scalability

**NFR-4.1:** System shall support up to 500 bills per month
**NFR-4.2:** Google Sheets shall support up to 50,000 rows (years of data)
**NFR-4.3:** System shall handle invoice images up to 10MB

### Usability

**NFR-5.1:** User shall not need to install any app (WhatsApp only)
**NFR-5.2:** User shall not need to learn special syntax (natural language)
**NFR-5.3:** Setup shall take less than 30 minutes for technical users
**NFR-5.4:** Error messages shall be clear and actionable

---

## Technical Constraints

### TC-1: Technology Stack
- **Option A (Recommended):** OpenClaw + Claude API + Google Sheets
- **Option B:** n8n + WhatsApp Business API + Claude API + Google Sheets

### TC-2: External Dependencies
- Claude API (Anthropic)
- Google Sheets API
- WhatsApp (via OpenClaw or Meta Business API)

### TC-3: Infrastructure
- VPS with 2GB RAM, 1 CPU core minimum
- Node.js 22+ runtime
- 24/7 uptime required

### TC-4: Rate Limits
- Claude API: 50 requests/minute (Tier 1)
- Google Sheets API: 60 requests/minute per user
- WhatsApp: 1,000 free conversations/month

---

## Data Model

### Bill Entry (Google Sheets Row)

```typescript
interface BillEntry {
  date: string;              // YYYY-MM-DD
  vendor: string;            // max 50 chars
  item: string;              // item name, max 100 chars
  category: Category;        // enum
  price: number;             // before tax, 2 decimal places
  paymentMethod: string;     // cash, credit card, QR, transfer, etc.
  description: string;       // max 100 chars
  effectivePrice: number;    // price after tax (price * (1 + taxRate))
  cumulativePrice: number;   // running total of effectivePrice
  source: 'image' | 'text';
}

enum Category {
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
```

### Tax Handling

Invoices may include tax at different rates. The AI must detect and handle:

| Tax Rate | When Applied | Effective Price Calculation |
|----------|-------------|---------------------------|
| 0% | No tax shown on invoice, or casual text input | Effective Price = Price |
| 8% | Reduced tax rate items (e.g., food/groceries in some countries) | Effective Price = Price * 1.08 |
| 10% | Standard tax rate items (e.g., services, dining out) | Effective Price = Price * 1.10 |

**Important notes:**
- A single invoice may contain items with different tax rates (e.g., 8% for food items, 10% for alcohol)
- AI should extract the tax rate per item, not assume a flat rate for the whole invoice
- If the invoice shows a total with tax already included, use that as the effective price and back-calculate the pre-tax price

### Monthly Sheet Structure

Sheet Name: `YYYY-MM` (e.g., "2026-03")

Row 1 (Header):
```
| Date | Vendor | Item | Category | Price | Payment Method | Description | Effective Price | Cumulative Price | Source |
```

Row 2-N (Data):
```
| 2026-03-23 | Restaurant ABC | Ramen        | Food | 800  | Credit Card | Lunch | 880  | 880  | image |
| 2026-03-23 | Restaurant ABC | Beer         | Food | 500  | Credit Card | Lunch | 550  | 1430 | image |
| 2026-03-23 | Grab           | Ride to work | Transport | 185 | QR | - | 185 | 1615 | text |
```

**Formulas:**
- Cumulative Price (col I): `=I{prev_row} + H{current_row}` (running total)
- Summary row: `=SUM(E:E)` for total Price, `=SUM(H:H)` for total Effective Price

---

## User Flow

### Flow 1: Log Bill via Image (Single Item)

```
1. User takes photo of electricity bill
2. User sends photo to WhatsApp bot
3. Bot: "Processing your invoice..."
4. AI extracts: vendor=Thai Electric, item=March electricity, price=1,250, tax=0%
5. Bot writes 1 row to Google Sheets (correct month tab)
6. Bot: "Recorded! Thai Electric - March electricity 1,250 THB (Utilities) on 2026-03-23"
```

### Flow 2: Log Bill via Image (Multi-Item with Tax)

```
1. User takes photo of restaurant receipt (has 8% and 10% tax)
2. User sends photo to WhatsApp bot
3. Bot: "Processing your invoice..."
4. AI extracts:
   - Ramen: 800 THB + 8% tax = 864 THB
   - Beer: 500 THB + 10% tax = 550 THB
5. Bot writes 2 rows to Google Sheets
6. Bot: "Recorded! Restaurant ABC - 2 items, total 1,414 THB (incl. tax) on 2026-03-23"
```

### Flow 3: Log Bill via Text

```
1. User types: "grab 185 to office"
2. Bot processes text
3. AI extracts: vendor=Grab, item=Ride to office, price=185, tax=0%
4. Bot writes to Google Sheets
5. Bot: "Recorded! Grab - Ride to office 185 THB (Transport) on 2026-03-23"
```

### Flow 4: View Summary

```
1. User types: "summary"
2. Bot calculates total from current month's sheet
3. Bot: "Your spending for March 2026:
   Total (before tax): 12,350 THB
   Total (after tax): 13,214 THB
   ---
   - Food: 5,890 THB
   - Transport: 2,560 THB
   - Utilities: 3,500 THB
   - Subscription: 1,264 THB"
```

### Flow 5: Error Handling

```
1. User sends blurry image
2. AI cannot extract amount
3. Bot: "Sorry, I couldn't read the amount. Could you send a clearer photo or type the amount?"
```

---

## Success Metrics

### MVP Launch Goals (Month 1)

- [ ] 95% successful bill logging (image + text)
- [ ] Average processing time < 8 seconds
- [ ] Zero data loss incidents
- [ ] User logs 50+ bills successfully

### Long-term Goals (Month 3+)

- [ ] User logs 100+ bills/month consistently
- [ ] 90% of bills logged via image (shows trust in AI extraction)
- [ ] User checks Google Sheets < 5 times/month (trusts automation)
- [ ] AI extraction accuracy > 95%

---

## Out of Scope (V1.0)

- ❌ Mobile app (WhatsApp only)
- ❌ Multi-user support (single user only)
- ❌ Budget forecasting / predictions
- ❌ Bank account integration
- ❌ Receipt storage / archival
- ❌ Export to other formats (CSV, PDF)
- ❌ Collaboration / shared expenses
- ❌ Web dashboard (Google Sheets is the UI)

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| AI extracts wrong amount | High | Medium | Always show confirmation for user to verify |
| AI applies wrong tax rate (8% vs 10%) | Medium | Medium | Show tax breakdown in confirmation; user can correct via edit command |
| WhatsApp API approval delayed | Medium | Medium | Start with test number, apply for production early |
| Google Sheets rate limit hit | Medium | Low | Batch writes, implement exponential backoff |
| User sends non-bill images | Low | High | AI should identify and reply "Not a bill" |
| VPS downtime | Medium | Low | Use reliable provider (Hetzner/Oracle), set up monitoring |
| Claude API cost spike | Medium | Low | Set monthly budget alerts, cache common patterns |

---

## Timeline Estimate

### Phase 1: Setup & Basic Flow (Week 1)
- Day 1-2: Set up OpenClaw + WhatsApp + Claude API
- Day 3-4: Build text message → Google Sheets flow
- Day 5-7: Test and fix bugs

### Phase 2: Image Support (Week 2)
- Day 8-10: Add image processing
- Day 11-12: Test with real invoices
- Day 13-14: Improve AI prompts for better extraction

### Phase 3: Polish (Week 3)
- Day 15-16: Monthly sheet auto-creation
- Day 17-18: Add summary command
- Day 19-20: Error handling & edge cases
- Day 21: Final testing & documentation

**Total: ~3 weeks to MVP**

---

## Appendix

### Sample AI Prompts

**For Image Extraction:**
```
You are analyzing a receipt/invoice image. Extract EACH line item separately.

For each item, extract:
- Date (format: YYYY-MM-DD, or today if not visible)
- Vendor name
- Item name
- Category (Food/Transport/Utilities/Rent/Subscription/Shopping/Entertainment/Healthcare/Other)
- Price (before tax, number only)
- Tax rate (0%, 8%, or 10% - check the invoice for tax details)
- Effective price (price after tax)
- Payment method (cash/credit card/QR/transfer/other - check bottom of receipt)
- Brief description

IMPORTANT tax rules:
- Look for tax lines like "Tax 8%", "Tax 10%", "VAT", or "consumption tax"
- Some invoices mix 8% and 10% tax rates for different items
- If the invoice only shows final totals with tax included, back-calculate the pre-tax price
- If no tax is mentioned, assume 0%

Return as JSON array (one object per item):
{
  "date": "2026-03-23",
  "vendor": "Restaurant ABC",
  "items": [
    {
      "item": "Ramen",
      "category": "Food",
      "price": 800,
      "taxRate": 0.08,
      "effectivePrice": 864,
      "description": "Lunch"
    },
    {
      "item": "Beer",
      "category": "Food",
      "price": 500,
      "taxRate": 0.10,
      "effectivePrice": 550,
      "description": "Lunch"
    }
  ],
  "paymentMethod": "Credit Card"
}

If you cannot extract any field, use null.
```

**For Text Parsing:**
```
Parse this casual expense message: "{user_message}"

Extract:
- Vendor (if mentioned, else "Expense")
- Item name (if mentioned, else same as vendor)
- Amount (number only - treat as effective price, no tax calculation needed)
- Category (guess from context: Food/Transport/Utilities/etc.)
- Payment method (if mentioned, else "Unknown")
- Description (brief)
- Date: use today's date

Return as JSON:
{
  "date": "2026-03-23",
  "vendor": "Grab",
  "items": [
    {
      "item": "Ride to office",
      "category": "Transport",
      "price": 185,
      "taxRate": 0,
      "effectivePrice": 185,
      "description": "Ride to office"
    }
  ],
  "paymentMethod": "Unknown"
}
```

### Environment Variables

```bash
# OpenClaw
CLAUDE_API_KEY=sk-ant-xxx

# Google Sheets
GOOGLE_SHEETS_CLIENT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY=xxx
GOOGLE_SHEETS_SPREADSHEET_ID=xxx

# WhatsApp (if using Meta Business API instead of OpenClaw)
WHATSAPP_PHONE_NUMBER_ID=xxx
WHATSAPP_ACCESS_TOKEN=xxx
WHATSAPP_VERIFY_TOKEN=xxx
```
