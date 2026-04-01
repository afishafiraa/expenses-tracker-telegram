# BillNot - Telegram Expense Tracker

Track your expenses by chatting with a Telegram bot. Send text messages or receipt photos, and Gemini AI automatically extracts and logs them to a database with multi-currency support.

## Features

- Chat naturally to record expenses ("lunch 89 at 7-11")
- Send receipt/invoice photos (AI reads and extracts data)
- Multi-currency support (13 Asian/SEA currencies + USD)
- Automatic exchange rate conversion (updated daily)
- Monthly spending summary with category breakdown
- Quarterly Excel export
- Cloud Vision receipt validation (rejects non-receipt photos)
- Tax handling (before/after tax calculation)

## Tech Stack

| Component | Tool | Why |
|---|---|---|
| Messaging | Telegram Bot API | Free, instant setup, no approval needed |
| AI Extraction | Gemini 2.5 Flash | Free (1,500 req/day), vision + text |
| Image Validation | Google Cloud Vision | Receipt detection before Gemini extraction |
| Database | Supabase (PostgreSQL) | Free (500MB), multi-user, fast queries |
| Export | exceljs | Quarterly Excel reports |
| Hosting | VPS + Cloudflare Tunnel | Always-on, no cold starts, free tunnel |
| CI/CD | GitHub Actions | Auto-deploy on push to main via SSH |

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials.

Required:
- `TELEGRAM_BOT_TOKEN` — from @BotFather on Telegram
- `GEMINI_API_KEY` — from https://aistudio.google.com/apikey
- `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` — from Supabase project settings

Optional:
- `GCP_CLIENT_EMAIL`, `GCP_PRIVATE_KEY` (for Cloud Vision receipt validation)
- `WEBHOOK_URL`, `CRON_SECRET` (for production deployment)

### 3. Set Up Database

Run the SQL schema from `docs/DATABASE_SCHEMA.md` in Supabase SQL Editor.

### 4. Start Development

```bash
npm run dev
```

The bot starts in polling mode locally.

## Commands

| Command | Description |
|---|---|
| `/start` | Start bot / onboarding |
| `/help` | Show available commands |
| `/profile` | View your profile and stats |
| `/setcurrency [CODE]` | Change default currency (e.g., `/setcurrency USD`) |
| `/totalspend` | Monthly spending total and breakdown |
| `/export` | Generate quarterly Excel report |
| `/deactivate` | Delete account and all data |

## Usage Examples

**Text input:**
```
grab 185 to office
lunch 89 at 7-11
coffee 250 yen cash
```

**Photo input:**
Send a receipt/invoice photo — the bot validates it's a real receipt using Cloud Vision, then extracts expense data with Gemini AI.

## Scripts

- `npm run dev` — Start dev server with hot reload (polling mode)
- `npm run build` — Compile TypeScript
- `npm start` — Run production build (webhook mode)
- `npm test` — Test Gemini AI extraction

## Deployment

Deployed to a VPS with Cloudflare Tunnel and Docker Compose. GitHub Actions auto-deploys on push to `main` via SSH.

```bash
# On VPS
git clone <repo> billnot && cd billnot
cp .env.example .env  # fill in secrets + CLOUDFLARE_TUNNEL_TOKEN
docker compose up -d --build
```

See `docs/VPS_DEPLOYMENT.md` for full deployment guide.

## Supported Currencies

THB, JPY, SGD, MYR, IDR, PHP, VND, KRW, CNY, HKD, TWD, INR, USD

## Cost

- **Gemini API**: Free (1,500 requests/day)
- **Cloud Vision**: Free (1,000 requests/month)
- **Supabase**: Free (500MB storage)
- **VPS**: ~$4/month (Hostinger/Hetzner)
- **Cloudflare Tunnel**: Free
- **Total**: ~$4/month

## License

MIT
