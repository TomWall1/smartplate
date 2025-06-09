# SmartPlate API Setup Guide

This guide will help you set up the real APIs for SmartPlate.

## 🔑 API Keys Required

### 1. Spoonacular Recipe API (Required)

**Status**: ✅ Available and working
**Cost**: Free tier with 150 requests/day
**Paid**: $10/month for 5,000 requests/day

**Setup Steps**:
1. Go to [Spoonacular API Console](https://spoonacular.com/food-api/console)
2. Create a free account
3. Get your API key from the dashboard
4. Add to `backend/.env`: `SPOONACULAR_API_KEY=your_key_here`

**What it provides**:
- Recipe search by ingredients
- Nutritional information
- Dietary filtering (vegetarian, vegan, gluten-free)
- Recipe instructions and details

### 2. Coles Product API (Recommended)

**Status**: ✅ Available via RapidAPI
**Cost**: Check RapidAPI pricing

**Setup Steps**:
1. Go to [Coles Product Price API on RapidAPI](https://rapidapi.com/data-holdings-group-data-holdings-group-default/api/coles-product-price-api)
2. Create RapidAPI account
3. Subscribe to the Coles API
4. Get your RapidAPI key
5. Add to `backend/.env`: `COLES_API_KEY=your_rapidapi_key`

**What it provides**:
- Real Coles product data
- Current pricing information
- Product search functionality
- Brand and size information

### 3. Woolworths API (Not Available)

**Status**: ❌ No public API yet
**Alternative**: Using enhanced mock data
**Future**: ACCC recommended APIs in March 2025, may become available

**Current solution**:
- High-quality mock data that matches real Woolworths products
- Will be easily replaceable when official API becomes available

## 🚀 Deployment Setup

### Local Development

1. **Backend Environment**:
```bash
cd backend
cp .env.example .env
# Edit .env with your API keys
```

2. **Frontend Environment**:
```bash
cd frontend
cp .env.example .env
# Edit .env with backend URL
```

3. **Start Development**:
```bash
npm run dev
```

### Vercel Deployment

1. **Backend Environment Variables** (in Vercel dashboard):
```
SPOONACULAR_API_KEY=your_key
COLES_API_KEY=your_rapidapi_key
WOOLWORTHS_API_KEY=not_available_yet
```

2. **Frontend Environment Variables** (in Vercel dashboard):
```
VITE_API_URL=https://your-backend-url.vercel.app
```

## 🧪 Testing API Integration

### Test Spoonacular
```bash
curl "https://api.spoonacular.com/recipes/complexSearch?apiKey=YOUR_KEY&includeIngredients=salmon,spinach&number=2"
```

### Test Coles (via RapidAPI)
```bash
curl -X GET "https://coles-product-price-api.p.rapidapi.com/search?query=chicken&page=1&pageSize=5" \
  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: coles-product-price-api.p.rapidapi.com"
```

## 📊 API Usage & Costs

### Spoonacular Limits
- **Free**: 150 requests/day
- **Estimated app usage**: ~50-100 requests/day for active testing
- **Recommendation**: Start with free tier, upgrade when needed

### Coles API Limits
- **Check RapidAPI pricing tiers**
- **Estimated usage**: ~20-50 requests/day for deal updates
- **Recommendation**: Choose based on expected user volume

## 🔧 Implementation Status

| Service | Status | Integration | Data Quality |
|---------|--------|-------------|-------------|
| Spoonacular | ✅ Ready | Real API | High |
| Coles | ✅ Ready | Real API | High |
| Woolworths | 🟡 Mock | Enhanced Mock | Medium |

## 🚨 Rate Limiting

The app includes automatic rate limiting:
- **Spoonacular**: Respects daily limits
- **Coles**: Includes delays between requests
- **Fallback**: Uses mock data if APIs fail

## 🔄 Fallback Strategy

If APIs fail or limits are exceeded:
1. App falls back to high-quality mock data
2. Users can still test full functionality
3. No app crashes or broken experiences

## 🎯 Next Steps

1. **Immediate**: Set up Spoonacular (free and most valuable)
2. **Week 1**: Add Coles API for real pricing data
3. **Future**: Replace Woolworths mock when official API available

## 💡 Tips

- Start with free tiers to validate user interest
- Monitor API usage in production
- Consider caching responses to reduce API calls
- Keep mock data updated for good user experience