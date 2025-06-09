require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');

const dealsRoutes = require('./routes/deals');
const recipesRoutes = require('./routes/recipes');
const usersRoutes = require('./routes/users');
const { updateAllDeals } = require('./services/dealService');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Routes
app.use('/api/deals', dealsRoutes);
app.use('/api/recipes', recipesRoutes);
app.use('/api/users', usersRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Schedule deal updates - runs every day at 6 AM
cron.schedule('0 6 * * *', async () => {
  console.log('Running scheduled deal update...');
  try {
    await updateAllDeals();
    console.log('Deal update completed successfully');
  } catch (error) {
    console.error('Deal update failed:', error);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});