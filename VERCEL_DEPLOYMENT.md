# SmartPlate Vercel Deployment Guide

## 🚨 **Current Issue Fix**

Your console shows CORS errors because the frontend and backend URLs don't match. Here's how to fix it:

### **Frontend URL**: `smartplate-beryl.vercel.app`
### **Backend URL**: `smartplate-mjdq.vercel.app`

## 🛠️ **Fix Steps**

### **Step 1: Update Frontend Environment Variable**

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click on your **frontend project** (`smartplate-beryl`)
3. Go to **Settings** → **Environment Variables**
4. Add or update:
   ```
   VITE_API_URL = https://smartplate-mjdq.vercel.app
   ```
5. **Redeploy** the frontend (Deployments tab → click "Redeploy")

### **Step 2: Redeploy Backend**

1. Go to your **backend project** (`smartplate-mjdq`)
2. Go to **Deployments** tab
3. Click **"Redeploy"** to apply the CORS fixes

### **Step 3: Test the Connection**

1. Open: `https://smartplate-mjdq.vercel.app/health`
   - Should show: `{"status":"OK","timestamp":"...","message":"SmartPlate API is running"}`

2. Open: `https://smartplate-beryl.vercel.app`
   - Should now connect to backend properly

## 🎯 **Complete Deployment Setup**

If you want to start fresh or deploy properly:

### **Option A: Two Separate Projects (Current Setup)**

**Frontend Project**:
- Repository: `TomWall1/smartplate`
- Root Directory: `frontend`
- Environment Variables:
  ```
  VITE_API_URL=https://your-backend-url.vercel.app
  ```

**Backend Project**:
- Repository: `TomWall1/smartplate`
- Root Directory: `backend`
- Environment Variables:
  ```
  SPOONACULAR_API_KEY=your_key_here
  COLES_API_KEY=your_rapidapi_key
  NODE_ENV=production
  ```

### **Option B: Monorepo Deployment (Recommended)**

1. **Create New Vercel Project**:
   - Import `TomWall1/smartplate`
   - Root Directory: `frontend`
   - This becomes your main app

2. **Add Serverless Functions**:
   - Create `frontend/api/` folder
   - Move backend routes to serverless functions
   - More complex but cleaner URLs

## 🔧 **Environment Variables Needed**

### **Backend Environment Variables**
```bash
SPOONACULAR_API_KEY=your_spoonacular_key
COLES_API_KEY=your_rapidapi_key
NODE_ENV=production
```

### **Frontend Environment Variables**
```bash
VITE_API_URL=https://your-backend-url.vercel.app
```

## ✅ **Verification Checklist**

- [ ] Backend health check works: `/health` endpoint
- [ ] Frontend can access backend: No CORS errors
- [ ] API calls succeed: Check browser network tab
- [ ] Demo mode works: If APIs fail, mock data loads

## 🚨 **Common Issues & Solutions**

### **CORS Errors**
- **Problem**: Frontend can't access backend
- **Solution**: Update CORS origins in `backend/server.js`
- **Check**: Backend is deployed with latest code

### **404 Errors**
- **Problem**: Wrong API URL in frontend
- **Solution**: Update `VITE_API_URL` environment variable
- **Check**: URL matches actual backend deployment

### **Environment Variables Not Working**
- **Problem**: Variables not loading
- **Solution**: Redeploy after adding variables
- **Check**: Variable names match exactly (case-sensitive)

## 📞 **Debug URLs**

1. **Backend Health**: `https://smartplate-mjdq.vercel.app/health`
2. **Backend Root**: `https://smartplate-mjdq.vercel.app/`
3. **Backend Deals**: `https://smartplate-mjdq.vercel.app/api/deals/current`
4. **Frontend**: `https://smartplate-beryl.vercel.app`

## 🎉 **Success Indicators**

Once fixed, you should see:
- ✅ No CORS errors in console
- ✅ "API" indicator (green wifi icon) in navigation
- ✅ Real recipe suggestions with API data
- ✅ Health check returns success response

## 💡 **Pro Tips**

1. **Use Vercel CLI** for easier deployments:
   ```bash
   npm i -g vercel
   vercel --prod
   ```

2. **Check logs** in Vercel dashboard for backend errors

3. **Test locally first**:
   ```bash
   npm run dev
   # Should work on localhost:3000 + localhost:3001
   ```

4. **Monitor API usage** once live to avoid hitting limits

The CORS fix should resolve your current issues immediately!