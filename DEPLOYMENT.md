# SmartPlate Production Deployment

## Architecture

| Layer      | Service                           | URL                                    |
|------------|-----------------------------------|----------------------------------------|
| Frontend   | Vercel (Hobby — free)             | https://dealtodish.com                 |
| Backend    | Render (Free tier)                | https://smartplate-api.onrender.com    |
| Database   | Supabase (Free tier, PostgreSQL)  | supabase.com dashboard                 |
| Cron       | GitHub Actions / cron-job.org     | Wednesday 11pm AEST                    |
| Keep-alive | UptimeRobot (free)                | Pings /health every 5 min              |

**Total cost: $0/month**

---

## Step-by-Step Deployment

### 1. Create Supabase Project

1. Go to https://supabase.com → New project
2. Note the **Connection string** (Settings → Database → Connection string → URI)
   - Format: `postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres`
3. Note the **Project URL** and **Anon key** (Settings → API)

### 2. Migrate Database

Run locally with your Supabase connection string:

```bash
# From project root
export DATABASE_URL="postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres"
node backend/scripts/migrateToPostgres.js
```

This migrates all products and aliases from local SQLite to Supabase PostgreSQL.

### 3. Deploy Backend to Render

1. Push repo to GitHub (if not already)
2. Go to https://render.com → New Web Service
3. Connect your GitHub repo — Render auto-detects `render.yaml`
4. Set environment variables in Render dashboard:
   - `DATABASE_URL` — Supabase connection string (from step 1)
   - `ANTHROPIC_API_KEY` — your Anthropic API key
   - `SUPABASE_URL` — Supabase project URL
   - `SUPABASE_ANON_KEY` — Supabase anon key
5. Deploy — backend available at `https://smartplate-api.onrender.com`

**Verify:**
```bash
curl https://smartplate-api.onrender.com/health
```

### 4. Deploy Frontend to Vercel

1. Go to https://vercel.com → Import your GitHub repo
2. Set environment variable: `VITE_API_URL=https://smartplate-api.onrender.com`
3. Deploy — frontend available at your Vercel URL or custom domain

**Or** if already deployed: add the env var in Vercel dashboard → Project Settings → Environment Variables, then redeploy.

### 5. Configure Weekly Refresh

**Option A: GitHub Actions (recommended — already configured)**
- File: `.github/workflows/weekly-refresh.yml`
- Runs automatically every Wednesday 1pm UTC (11pm AEST)
- Can be triggered manually via GitHub Actions UI → "Run workflow"

**Option B: cron-job.org**
1. Go to https://cron-job.org → Create account
2. New cron job:
   - URL: `https://smartplate-api.onrender.com/api/admin/refresh-deals`
   - Method: POST
   - Schedule: `0 23 * * 3` (Wednesday 11pm)
   - Timezone: Australia/Sydney

### 6. Set Up Keep-Alive (UptimeRobot)

1. Go to https://uptimerobot.com → Create account
2. New monitor:
   - Type: HTTP(s)
   - Name: SmartPlate API
   - URL: `https://smartplate-api.onrender.com/health`
   - Interval: 5 minutes
3. Enable email alerts for downtime

---

## Environment Variables Reference

### Render (Backend)
| Variable          | Description                        |
|-------------------|------------------------------------|
| `DATABASE_URL`    | Supabase PostgreSQL connection URL |
| `ANTHROPIC_API_KEY` | Claude API key                   |
| `SUPABASE_URL`    | Supabase project URL               |
| `SUPABASE_ANON_KEY` | Supabase anon key                |
| `NODE_ENV`        | `production` (set in render.yaml)  |
| `USE_POSTGRESQL`  | `true` (set in render.yaml)        |
| `PORT`            | `10000` (set in render.yaml)       |

### Vercel (Frontend)
| Variable       | Value                                       |
|----------------|---------------------------------------------|
| `VITE_API_URL` | `https://smartplate-api.onrender.com`       |

---

## Free Tier Limits

| Service     | Limit                        | Current Usage       |
|-------------|------------------------------|---------------------|
| Render      | 750 hrs/month, spins down after 15 min idle | ~360 hrs/month with UptimeRobot |
| Supabase    | 500MB database               | ~20MB (60K products) |
| Vercel      | Unlimited bandwidth (Hobby)  | Minimal             |
| UptimeRobot | 50 monitors                  | 1 used              |

### Known Limitations
- **Cold starts:** 30–60s on first request after 15 min idle. Mitigated by UptimeRobot pinging every 5 min.
- **Overnight spin-down:** Service may spin down 12am–6am AEST when UptimeRobot isn't active.
- **Database backups:** Supabase free tier includes daily backups (7-day retention).

---

## When to Upgrade

Consider **Render Starter ($7/month)** when:
- You have paying users and need guaranteed uptime
- Cold starts are affecting user experience
- >100 active daily users

Consider **Supabase Pro ($25/month)** when:
- Database approaches 500MB (currently ~20MB for 60K products)
- Need >7-day backup retention
