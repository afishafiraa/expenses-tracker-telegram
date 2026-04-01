import 'dotenv/config';
import http from 'node:http';
import TelegramBot from 'node-telegram-bot-api';
import { BotController } from './controllers/bot.controller.js';
import { DatabaseService } from './services/database.service.js';
import { ExchangeRateService } from './services/exchangeRate.service.js';

// ========================================
// Config
// ========================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const PORT = parseInt(process.env.PORT || '3333', 10);
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const CRON_SECRET = process.env.CRON_SECRET;
const isDev = process.env.NODE_ENV === 'development';

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set in .env file');
  process.exit(1);
}

// ========================================
// Bot Init (polling in dev, webhook in prod)
// ========================================

const bot = isDev
  ? new TelegramBot(BOT_TOKEN, { polling: true })
  : new TelegramBot(BOT_TOKEN);

const database = new DatabaseService();
const exchangeRateService = new ExchangeRateService(database);
const controller = new BotController(bot);

let exchangeRateInterval: NodeJS.Timeout | null = null;
let server: http.Server | null = null;

// ========================================
// Command Routes (same for both modes)
// ========================================

bot.onText(/\/start/, (msg) => controller.handleStart(msg));
bot.onText(/\/help/, (msg) => controller.handleHelp(msg));
bot.onText(/\/profile/, (msg) => controller.handleProfile(msg));
bot.onText(/\/setcurrency/, (msg) => controller.handleSetCurrency(msg));
bot.onText(/\/totalspend/, (msg) => controller.handleTotalSpend(msg));
bot.onText(/\/export/, (msg) => controller.handleExport(msg));
bot.onText(/\/deactivate/, (msg) => controller.handleDeactivate(msg));

bot.on('message', (msg) => controller.handleMessage(msg));

// ========================================
// Error Handling
// ========================================

if (isDev) {
  bot.on('polling_error', (error) => {
    console.error('❌ Polling error:', error);
  });
}

// ========================================
// HTTP Server (production webhook mode)
// ========================================

function createHttpServer(): http.Server {
  const webhookPath = `/webhook/${BOT_TOKEN}`;

  const srv = http.createServer(async (req, res) => {
    // POST /webhook/<token> — receive Telegram updates
    if (req.method === 'POST' && req.url === webhookPath) {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString());
          bot.processUpdate(body);
          res.writeHead(200);
          res.end('ok');
        } catch (e) {
          console.error('❌ Failed to process update:', e);
          res.writeHead(400);
          res.end('bad request');
        }
      });
      return;
    }

    // GET /health — health check for Cloud Run
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', mode: 'webhook' }));
      return;
    }

    // GET /cron/exchange-rates — triggered by Cloud Scheduler
    if (req.method === 'GET' && req.url?.startsWith('/cron/exchange-rates')) {
      const secret = req.headers['x-cron-secret'];
      if (CRON_SECRET && secret !== CRON_SECRET) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
      try {
        await exchangeRateService.updateAllRates();
        res.writeHead(200);
        res.end('ok');
      } catch (e) {
        console.error('❌ Cron exchange rate update failed:', e);
        res.writeHead(500);
        res.end('error');
      }
      return;
    }

    // 404 for everything else
    res.writeHead(404);
    res.end('not found');
  });

  srv.listen(PORT, () => {
    console.log(`🌐 HTTP server listening on port ${PORT}`);
  });

  return srv;
}

// ========================================
// Startup
// ========================================

async function startup() {
  if (isDev) {
    await exchangeRateService.initialize();
    console.log('🚀 BillNot started in POLLING mode (development)');
    console.log('💬 Bot is polling for messages...\n');
    exchangeRateInterval = exchangeRateService.scheduleDailyUpdates();
  } else {
    // Start HTTP server FIRST — Cloud Run needs a listening port ASAP
    server = createHttpServer();

    // Initialize exchange rates in background (don't block startup)
    exchangeRateService.initialize().catch((err) => {
      console.error('❌ Exchange rate init failed:', err);
    });

    // Register webhook in background — Telegram remembers it,
    // so even if this is slow, incoming requests still work
    if (WEBHOOK_URL) {
      const webhookUrl = `${WEBHOOK_URL}/webhook/${BOT_TOKEN}`;
      bot.setWebHook(webhookUrl).then(() => {
        console.log(`🔗 Webhook registered: ${WEBHOOK_URL}/webhook/***`);
      }).catch((err) => {
        console.error('❌ Failed to register webhook:', err);
      });
      console.log('🚀 BillNot started in WEBHOOK mode');
    } else {
      console.warn('⚠️ WEBHOOK_URL not set — server running but webhook not registered');
    }
  }
}

startup().catch((error) => {
  console.error('❌ Startup failed:', error);
  process.exit(1);
});

// ========================================
// Shutdown
// ========================================

function shutdown(): void {
  console.log('\n\n👋 Shutting down bot...');

  if (exchangeRateInterval) {
    clearInterval(exchangeRateInterval);
    console.log('⏰ Cleared exchange rate schedule');
  }

  if (isDev) {
    bot.stopPolling();
  } else {
    bot.deleteWebHook().catch(() => {});
    server?.close();
  }

  console.log('✅ Bot stopped successfully');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
