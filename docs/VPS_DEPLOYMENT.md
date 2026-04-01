# Deploying BillNot to VPS with Cloudflare Tunnel

## Architecture

```
Telegram → Cloudflare Tunnel (https://billnot.afishafiraa.cloud) → VPS Docker (bot:3333)
```

GitHub Actions auto-deploys on every push to `main` via SSH.

## Prerequisites

1. A VPS with Docker installed (e.g., Hostinger KVM 1, ~$4/mo)
2. A Cloudflare account (free) with your domain added
3. A Cloudflare Tunnel created

## Step 1: Create Cloudflare Tunnel (one-time)

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Add your domain to Cloudflare (update nameservers at your registrar)
3. Go to **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
4. Select **Cloudflared** connector, name it `billnot`
5. Configure public hostname:
   - Subdomain: `billnot`
   - Domain: `afishafiraa.cloud`
   - Service type: `HTTP`
   - Service URL: `bot:3333`
6. Copy the **tunnel token**

## Step 2: Set Up VPS (one-time)

```bash
# SSH into VPS
ssh root@your-vps-ip

# Clone repo
git clone https://github.com/afishafiraa/expenses-tracker-telegram.git billnot
cd billnot

# Create .env file
nano .env
```

Add all environment variables:

```env
TELEGRAM_BOT_TOKEN=your_token
GEMINI_API_KEY=your_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_key
GCP_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GCP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
PORT=3333
WEBHOOK_URL=https://billnot.afishafiraa.cloud
CRON_SECRET=your_random_secret
CLOUDFLARE_TUNNEL_TOKEN=your_tunnel_token
```

## Step 3: Deploy

```bash
docker compose up -d --build
```

This starts two containers:
- `bot` — the Node.js app on port 3333
- `tunnel` — Cloudflare Tunnel routing external traffic to the bot

## Step 4: Verify

```bash
# Check containers are running
docker compose ps

# Check logs
docker compose logs bot
docker compose logs tunnel

# Health check via tunnel
curl https://billnot.afishafiraa.cloud/health
# Should return: {"status":"ok","mode":"webhook"}
```

Send a message to your Telegram bot — it should respond.

## Step 5: Set Up Exchange Rate Cron

Add a daily cron job on the VPS:

```bash
crontab -e
```

Add this line (runs daily at 8:00 AM):

```
0 8 * * * curl -s -H "x-cron-secret: your_cron_secret" http://localhost:3333/cron/exchange-rates
```

## Step 6: GitHub Actions Auto-Deploy

Add these secrets to your GitHub repo (**Settings → Secrets → Actions**):

| Secret | Value |
|---|---|
| `VPS_HOST` | Your VPS IP address |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Your SSH private key (see below) |

### Generate SSH key for GitHub Actions

On your VPS:

```bash
# Generate a deploy key
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""

# Add public key to authorized_keys
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys

# Show private key — copy this to GitHub secret VPS_SSH_KEY
cat ~/.ssh/github_deploy
```

After setup, every push to `main` will automatically:
1. SSH into VPS
2. `git pull origin main`
3. `docker compose up -d --build --force-recreate`
4. Clean up old Docker images

## Useful Commands

```bash
# View bot logs
docker compose logs -f bot

# View tunnel logs
docker compose logs -f tunnel

# Restart bot
docker compose restart bot

# Rebuild and restart
docker compose up -d --build --force-recreate

# Stop everything
docker compose down
```

## Cost

- **VPS (Hostinger KVM 1)**: ~$4/month
- **Cloudflare Tunnel**: Free
- **Gemini API**: Free (1,500 requests/day)
- **Cloud Vision**: Free (1,000 requests/month)
- **Supabase**: Free (500MB storage)
- **Total**: ~$4/month
