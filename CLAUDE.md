# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BillNot is a Telegram bot for expense tracking. Users send text messages or receipt photos, and Gemini AI extracts expense data which is stored in Supabase (PostgreSQL). Supports multi-currency with automatic exchange rate conversion, focused on Asian/Southeast Asian currencies.

## Commands

- `npm run dev` — Start dev server with hot reload (tsx watch)
- `npm run build` — Compile TypeScript (`tsc`)
- `npm start` — Build and run production (`npm run build && node dist/index.js`)
- `npm test` — Test Gemini AI extraction (`tsx src/test-gemini.ts`)
- `npm run test:sheets` — Test Google Sheets API (`tsx src/test-sheets.ts`)

There is no test framework (jest/vitest) — tests are manual scripts.

## Architecture

**Entry point:** `src/index.ts` — Initializes the Telegram bot (polling mode), registers command routes, and starts the exchange rate scheduler.

**Controller-Handler pattern:**
- `src/controllers/bot.controller.ts` — Thin routing layer. Routes Telegram messages to the appropriate handler based on command or conversation state. Should stay under 200 lines.
- `src/handlers/` — Business logic split by concern:
  - `command.handler.ts` — Slash commands (/start, /help, /profile, /setcurrency, /totalspend, /export, /deactivate)
  - `message.handler.ts` — Text and photo message processing, AI expense detection, saving expenses
  - `expense.handler.ts` — Multi-step expense collection (amount, vendor, payment, tax flow)
  - `confirmation.handler.ts` — Yes/no confirmation handling
  - `onboarding.handler.ts` — New user setup (nickname, country)

**Services:**
- `database.service.ts` — Supabase client, all DB operations (users, expenses, conversation states, exchange rates)
- `gemini.service.ts` — Gemini 2.5 Flash API for bill extraction from text/images (direct REST calls, no SDK)
- `conversation.service.ts` — Gemini-powered conversational AI that detects expenses from natural chat
- `exchangeRate.service.ts` — Fetches and caches exchange rates daily
- `export.service.ts` — Excel export via exceljs
- `sheets.service.ts` — Google Sheets integration

**Conversation state machine:** Multi-step flows (onboarding, expense collection, tax questions) are tracked in the `conversation_states` Supabase table. Each user has at most one active state. States are defined in `src/types.ts` as `ConversationStateType`.

**Utilities:** `src/utils/` contains `payment.ts` (normalize payment methods), `vendor.ts`, `language.ts` (multi-language yes/no messages).

## Key Technical Details

- **ESM project** — `"type": "module"` in package.json, imports use `.js` extensions
- **TypeScript target:** ES2022, module: ES2022
- **AI model:** Gemini 2.5 Flash via direct REST API (no Google SDK for AI)
- **Database:** Supabase (PostgreSQL) — schema documented in `docs/DATABASE_SCHEMA.md`
- **Bot framework:** `node-telegram-bot-api` in polling mode
- **No formal test suite** — only manual test scripts in `src/test-*.ts`

## Deployment (Webhook + Google Cloud Run)

The bot supports two modes controlled by `NODE_ENV`:
- **Development** (`NODE_ENV=development`): Polling mode, same as before. Run with `npm run dev`.
- **Production** (default): Webhook mode with an HTTP server. Telegram pushes updates to `POST /webhook/<token>`.

**HTTP endpoints (production):**
- `POST /webhook/<BOT_TOKEN>` — receives Telegram updates via `bot.processUpdate()`
- `GET /health` — health check (returns `{"status":"ok","mode":"webhook"}`)
- `GET /cron/exchange-rates` — triggers exchange rate update, protected by `x-cron-secret` header

Exchange rate daily updates use Google Cloud Scheduler in production (not `setInterval`).

See `docs/CLOUD_RUN_DEPLOYMENT.md` for full deployment steps.

## Environment Variables

See `.env.example`. Required: `TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. Production also requires: `WEBHOOK_URL`, `CRON_SECRET`. Optional: Google Sheets credentials.
