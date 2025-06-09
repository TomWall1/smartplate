# SmartPlate

Smart meal planning app that finds recipes based on weekly supermarket deals in Australia.

## Features
- Weekly supermarket deal tracking (Woolworths & Coles)
- Recipe suggestions based on discounted ingredients
- Shopping list generation
- Dietary preferences and filtering
- Cost-effective meal planning

## Tech Stack
- Frontend: React with Vite
- Backend: Node.js with Express
- Database: PostgreSQL
- Deployment: Vercel

## Getting Started

### Install Dependencies
```bash
npm run install:all
```

### Development
```bash
npm run dev
```

This will start both frontend (localhost:3000) and backend (localhost:3001).

## Environment Variables

### Backend (.env)
```
DATABASE_URL=your_postgres_url
SPOONACULAR_API_KEY=your_spoonacular_key
WOOLWORTHS_API_KEY=your_woolworths_key
COLES_API_KEY=your_coles_rapidapi_key
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001
```
