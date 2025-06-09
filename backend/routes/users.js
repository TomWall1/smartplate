const express = require('express');
const router = express.Router();

// Get user preferences (session-based for MVP)
router.get('/preferences', (req, res) => {
  // For MVP, we'll use localStorage on frontend
  // This endpoint is placeholder for when we add user accounts
  res.json({ message: 'User accounts not implemented yet' });
});

// Update user preferences
router.post('/preferences', (req, res) => {
  // For MVP, we'll use localStorage on frontend
  // This endpoint is placeholder for when we add user accounts
  res.json({ message: 'User accounts not implemented yet' });
});

// Create user account
router.post('/register', (req, res) => {
  res.json({ message: 'User registration not implemented yet' });
});

// User login
router.post('/login', (req, res) => {
  res.json({ message: 'User login not implemented yet' });
});

module.exports = router;