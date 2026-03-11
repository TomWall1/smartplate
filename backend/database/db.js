/**
 * database/db.js
 * Routes to either SQLite (local dev) or PostgreSQL (production)
 */

// Determine which database to use
const usePostgreSQL = 
  process.env.USE_POSTGRESQL === 'true' || 
  process.env.NODE_ENV === 'production';

if (usePostgreSQL) {
  console.log('[DB] Using PostgreSQL adapter');
  module.exports = require('./pg');
} else {
  console.log('[DB] Using SQLite adapter');
  module.exports = require('./sqlite');
}
