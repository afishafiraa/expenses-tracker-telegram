# BillNot - WhatsApp Bill Tracker

Track your expenses by chatting with a WhatsApp bot. Send text messages or invoice photos, and the AI automatically logs them to Google Sheets.

## Features

- 💬 Chat with WhatsApp bot to record expenses
- 📸 Send invoice photos (AI reads and extracts data)
- 📊 Monthly summary with "summary" command
- 📁 Auto-creates monthly sheet tabs
- 🤖 Powered by Gemini AI (free tier)
- 📈 Data stored in Google Sheets

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials (already done if you followed the guide).

### 3. Start the Server

```bash
npm run dev
```

The webhook server will start on `http://localhost:3000`

### 4. Expose Server with ngrok

Install ngrok:
```bash
brew install ngrok
```

Run ngrok:
```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

### 5. Configure Webhook in Meta Developer Console

1. Go to your WhatsApp app in Meta Developer Console
2. Navigate to **WhatsApp** → **Configuration**
3. In **Webhook** section, click **"Edit"**
4. Paste your ngrok URL + `/webhook` (e.g., `https://abc123.ngrok.io/webhook`)
5. Enter the **Verify Token**: `billnot_webhook_verify_token_12345` (from .env)
6. Click **"Verify and Save"**
7. Subscribe to **messages** field

### 6. Test Your Bot!

1. Send a message to your WhatsApp test number
2. Try: "grab 185 to office"
3. Bot should reply with confirmation
4. Check your Google Sheet!

## Usage Examples

**Track expense:**
```
grab 185 to office
lunch 89 at 7-11
electric bill 1250
```

**Send invoice photo:**
Just send any receipt/invoice image

**Get summary:**
```
summary
```

## Tech Stack

- TypeScript
- Express (webhook server)
- Gemini AI (bill extraction)
- Google Sheets API (data storage)
- WhatsApp Business API

## Cost

- **Gemini API**: Free (1,500 requests/day)
- **WhatsApp Business API**: Free (1,000 conversations/month)
- **Google Sheets**: Free
- **Total**: $0/month 🎉

## Project Structure

```
src/
├── index.ts                    # Main webhook server
├── types.ts                    # TypeScript interfaces
└── services/
    ├── gemini.service.ts       # AI extraction
    ├── sheets.service.ts       # Google Sheets integration
    └── whatsapp.service.ts     # WhatsApp API
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript
- `npm start` - Run production build
- `npm test` - Test Gemini API
- `npm run test:sheets` - Test Google Sheets API

## Troubleshooting

**Webhook verification fails:**
- Check verify token matches in .env
- Ensure ngrok is running
- Check server logs

**Messages not received:**
- Verify webhook is subscribed to "messages" field
- Check Meta app is not in test mode restrictions
- Check server logs for errors

**Gemini extraction fails:**
- Ensure API key is valid
- Check if you hit rate limit (1,500/day)
- Try rephrasing the message

## License

MIT
