/**
 * database/db.js
 * Database adapter router.
 * Uses PostgreSQL in production (USE_POSTGRESQL=true or NODE_ENV=production),
 * SQLite for local development.
 */

const usePG = process.env.USE_POSTGRESQL === 'true' || process.env.NODE_ENV === 'production';

if (usePG) {
  module.exports = require('./pg');
} else {
  module.exports = require('./sqlite');
}
