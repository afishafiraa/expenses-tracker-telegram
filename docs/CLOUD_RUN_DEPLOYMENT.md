# Deploying BillNot to Google Cloud Run

## Architecture

```
git push → GitHub Actions → Build Docker image → Push to Artifact Registry → Deploy to Cloud Run
```

Auto-deploys on every push to `main` branch.

## Prerequisites

1. [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed
2. A GCP project (`billnot`) with billing enabled
3. Required APIs enabled:
   ```bash
   gcloud services enable \
     run.googleapis.com \
     artifactregistry.googleapis.com \
     cloudscheduler.googleapis.com \
     iam.googleapis.com
   ```
4. GitHub repository with the code pushed

## Step 1: GCP Setup (one-time)

### Create Artifact Registry repository

```bash
gcloud artifacts repositories create billnot \
  --repository-format=docker \
  --location=asia-southeast1
```

### Create a service account for GitHub Actions

```bash
# Create service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Deploy"

# Grant permissions
PROJECT_ID=billnot
SA_EMAIL=github-actions@${PROJECT_ID}.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" --role="roles/run.admin"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" --role="roles/artifactregistry.writer"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" --role="roles/iam.serviceAccountUser"

# Create JSON key
gcloud iam service-accounts keys create gha-key.json \
  --iam-account=$SA_EMAIL
```

### Add GitHub Secrets

In your GitHub repo, go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `GCP_PROJECT_ID` | `billnot` |
| `GCP_SA_KEY` | Contents of `gha-key.json` |
| `GCP_REGION` | `asia-southeast1` |
| `TELEGRAM_BOT_TOKEN` | Your bot token |
| `GEMINI_API_KEY` | Your Gemini API key |
| `SUPABASE_URL` | Your Supabase URL |
| `SUPABASE_SERVICE_KEY` | Your Supabase service key |
| `CRON_SECRET` | A random secret string |

After adding secrets, delete the local key file:
```bash
rm gha-key.json
```

## Step 2: First Deploy

The first deploy needs to happen manually to get the Cloud Run service URL:

```bash
# Build and push to Artifact Registry
gcloud builds submit \
  --tag asia-southeast1-docker.pkg.dev/billnot/billnot/billnot:latest

# Deploy without WEBHOOK_URL first
gcloud run deploy billnot \
  --image asia-southeast1-docker.pkg.dev/billnot/billnot/billnot:latest \
  --platform managed \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --port 3000 \
  --set-env-vars "TELEGRAM_BOT_TOKEN=your_token,GEMINI_API_KEY=your_key,SUPABASE_URL=your_url,SUPABASE_SERVICE_KEY=your_key,CRON_SECRET=your_secret"
```

Note the service URL from the output (e.g., `https://billnot-xxxxx-xx.a.run.app`).

```bash
# Update with WEBHOOK_URL
gcloud run services update billnot \
  --region asia-southeast1 \
  --update-env-vars "WEBHOOK_URL=https://billnot-xxxxx-xx.a.run.app"
```

Then add `WEBHOOK_URL` as a GitHub Secret too.

## Step 3: Verify

```bash
# Health check
curl https://billnot-xxxxx-xx.a.run.app/health
# Should return: {"status":"ok","mode":"webhook"}
```

Send a message to your Telegram bot — it should respond.

## Step 4: Set Up Exchange Rate Cron

Use Google Cloud Scheduler to update exchange rates daily:

```bash
gcloud scheduler jobs create http billnot-exchange-rates \
  --schedule="0 8 * * *" \
  --uri="https://billnot-xxxxx-xx.a.run.app/cron/exchange-rates" \
  --http-method=GET \
  --headers="x-cron-secret=your_secret" \
  --time-zone="Asia/Bangkok" \
  --location=asia-southeast1
```

This runs daily at 8:00 AM Bangkok time.

## Step 5: Auto-Deploy via GitHub Actions

After steps 1-4 are complete, every push to `main` will auto-deploy via the workflow in `.github/workflows/deploy.yml`.

The workflow:
1. Checks out code
2. Authenticates to GCP using the service account
3. Builds Docker image
4. Pushes to Artifact Registry
5. Deploys to Cloud Run with all env vars

## Useful Commands

```bash
# View logs
gcloud run services logs read billnot --region asia-southeast1

# Check service status
gcloud run services describe billnot --region asia-southeast1

# Manual redeploy
gcloud builds submit --tag asia-southeast1-docker.pkg.dev/billnot/billnot/billnot:latest
gcloud run deploy billnot \
  --image asia-southeast1-docker.pkg.dev/billnot/billnot/billnot:latest \
  --region asia-southeast1
```

## Cost

With free tier:
- **Cloud Run**: 2M requests/month free, 360,000 GB-seconds free
- **Artifact Registry**: 500MB storage free
- **Cloud Scheduler**: 3 jobs free
- **Estimated cost**: $0/month for low-traffic bot
