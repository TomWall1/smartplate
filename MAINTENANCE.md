# SmartPlate Maintenance Guide

## Weekly Deal Refresh

**Automatic:** GitHub Actions triggers every Wednesday 1pm UTC (11pm AEST)

**Manual trigger (curl):**
```bash
curl -X POST https://smartplate-api.onrender.com/api/admin/refresh-deals
```

**Manual trigger (GitHub Actions):**
1. Go to GitHub repo → Actions → "Weekly Deal Refresh"
2. Click "Run workflow"

---

## Health Checks

```bash
# API health
curl https://smartplate-api.onrender.com/health

# Get deals (verify data is loaded)
curl https://smartplate-api.onrender.com/api/deals/current | head -c 500

# Get recipes
curl https://smartplate-api.onrender.com/api/recipes/suggestions | head -c 500
```

---

## Database Management

**Connect to Supabase:**
```bash
psql $DATABASE_URL
```

**Check product count:**
```sql
SELECT COUNT(*) FROM products;
SELECT source, COUNT(*) FROM products GROUP BY source ORDER BY count DESC;
SELECT category, COUNT(*) FROM products GROUP BY category ORDER BY count DESC;
```

**Re-seed if needed:**
```bash
# From project root, with DATABASE_URL set
export USE_POSTGRESQL=true
node backend/scripts/migrateToPostgres.js        # Migrate from local SQLite
# OR re-run seed scripts against PostgreSQL:
node backend/scripts/seedDatabase/seedOpenFoodFacts.js
node backend/scripts/seedDatabase/seedWoolworths.js
node backend/scripts/seedDatabase/seedColes.js
```

---

## Troubleshooting

### API not responding
1. Check Render dashboard → Logs for errors
2. If spun down, wait 30–60s for cold start (or check UptimeRobot)
3. Check UptimeRobot alerts for downtime notifications

### Deals not refreshing
1. Check GitHub Actions → "Weekly Deal Refresh" run history for errors
2. Manually trigger: `curl -X POST .../api/admin/refresh-deals`
3. Check Render logs after triggering

### Database errors
1. Check `DATABASE_URL` is set correctly in Render env vars
2. Verify Supabase project is active (supabase.com dashboard)
3. Check if approaching 500MB limit: `SELECT pg_size_pretty(pg_database_size(current_database()));`

### Frontend showing old data / no deals
1. Check `VITE_API_URL` is set in Vercel env vars
2. Trigger a deal refresh manually
3. Hard refresh browser (Ctrl+Shift+R) to clear cache

### CORS errors in browser console
- Check the origin is in CORS allowlist in `backend/server.js`
- Add new domain to the `origin` array and redeploy to Render

---

## Logs

- **Render:** https://dashboard.render.com → Your service → Logs
- **Vercel:** https://vercel.com → Project → Deployments → Function Logs
- **Supabase:** https://supabase.com → Project → Logs

---

## Monitoring Dashboard

Run locally to check production status:
```bash
# Quick status check
curl https://smartplate-api.onrender.com/health
curl https://dealtodish.com | head -c 100
```

---

## Costs

**Monthly: $0**
- Render free: 750 hrs/month
- Vercel Hobby: unlimited
- Supabase free: 500MB
- GitHub Actions: 2000 min/month free (weekly refresh uses ~1 min)
- UptimeRobot: 50 monitors free

**One-time seeding cost:** ~$3–4 Claude API usage
