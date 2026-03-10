# SmartPlate Production Deployment

## Architecture
- **Frontend:** Vercel (dealtodish.com)
- **Backend:** Render free tier (smartplate-api.onrender.com)
- **Database:** Supabase PostgreSQL free tier
- **Cron:** GitHub Actions (weekly refresh)
- **Monitoring:** UptimeRobot (keep-alive)

## Environment Variables

### Render (Backend)
- `DATABASE_URL` - Supabase connection string
- `ANTHROPIC_API_KEY` - Claude API key
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anon key
- `NODE_ENV=production`
- `USE_POSTGRESQL=true`
- `PORT=10000`

### Vercel (Frontend)
- `VITE_API_URL=https://smartplate-api.onrender.com`

## Weekly Deal Refresh

Automated via GitHub Actions:
- Schedule: Every Wednesday 11pm AEST
- Workflow: `.github/workflows/weekly-refresh.yml`
- Manual trigger: GitHub Actions UI → Run workflow

## Database Seeding

After deployment:
1. Get Supabase connection string
2. Run migration: `DATABASE_URL=xxx node backend/scripts/migrateToPostgres.js`
3. Verify: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM products;"`

## Monitoring

- **UptimeRobot:** Pings /health every 5 min
- **Render Logs:** https://dashboard.render.com
- **Supabase Dashboard:** https://supabase.com

## Costs

Monthly: $0
- Render free tier: 750 hours/month
- Vercel Hobby: Unlimited
- Supabase free: 500MB database
- GitHub Actions: 2000 minutes/month
- UptimeRobot: 50 monitors free

## Known Limitations (Free Tier)

1. **Cold starts:** 30-60s on first request after 15min idle
   - Mitigated by UptimeRobot pinging every 5min
   
2. **Spin down overnight:** Service may spin down 12am-6am AEST
   - Acceptable for MVP testing
   
3. **Database size limit:** 500MB max
   - Current: ~20MB for 60K products
   - Can hold ~1.5M products before limit

## When to Upgrade

Consider Render Starter ($7/month) when:
- Paying users exist (eliminate cold starts)
- >100 active daily users
- Need guaranteed 24/7 uptime