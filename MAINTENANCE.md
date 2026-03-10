# SmartPlate Maintenance Guide

## Weekly Deal Refresh

**Automatic:** GitHub Actions triggers every Wednesday 11pm AEST

**Manual trigger:**
```bash
curl -X POST https://smartplate-api.onrender.com/api/admin/refresh-deals
```

Or via GitHub:
1. Go to Actions tab
2. Select "Weekly Deal Refresh" workflow
3. Click "Run workflow"

## Database Management

**Check product count:**
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM products;"
```

**Check by source:**
```bash
psql $DATABASE_URL -c "SELECT source, COUNT(*) FROM products GROUP BY source;"
```

**Backup database:**
Supabase automatic backups enabled (free tier: daily)

## Monitoring

**Check API health:**
```bash
curl https://smartplate-api.onrender.com/health
```

**Check logs:**
Render Dashboard → Logs tab

**Check uptime:**
UptimeRobot dashboard

## Troubleshooting

**API not responding:**
1. Check Render dashboard for errors
2. Check if service is spun down (wait 60s for cold start)
3. Check UptimeRobot alerts

**Deals not refreshing:**
1. Check GitHub Actions execution history
2. Manually trigger via Actions UI
3. Check Render logs for errors

**Database errors:**
1. Check Supabase dashboard
2. Verify connection string in Render env vars
3. Check if hitting 500MB limit

## Scaling Considerations

**When to upgrade to paid tiers:**
- Render Starter ($7/mo): Eliminate cold starts
- Supabase Pro ($25/mo): 8GB database (when >100K products)
- Anthropic API: Monitor costs, currently ~$3-5/month