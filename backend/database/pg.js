// PostgreSQL adapter (production)
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

class PostgreSQLDatabase {
  async query(text, params) {
    const client = await pool.connect();
    try {
      const res = await client.query(text, params);
      return res;
    } finally {
      client.release();
    }
  }

  async run(sql, params = []) {
    return this.query(sql, params);
  }

  async get(sql, params = []) {
    const result = await this.query(sql, params);
    return result.rows[0] || null;
  }

  async all(sql, params = []) {
    const result = await this.query(sql, params);
    return result.rows;
  }

  async batchInsert(table, records) {
    if (records.length === 0) return;
    
    const columns = Object.keys(records[0]);
    const values = records.map(r => columns.map(c => r[c]));
    
    // Build parameterized query
    const placeholders = values.map((_, i) => 
      `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`
    ).join(', ');
    
    const flatValues = values.flat();
    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} ON CONFLICT DO NOTHING`;
    
    await this.query(sql, flatValues);
  }

  async migrate() {
    const schema = fs.readFileSync(
      path.join(__dirname, 'schema.pg.sql'),
      'utf8'
    );
    await this.query(schema);
  }

  async close() {
    await pool.end();
  }
}

const db = new PostgreSQLDatabase();
module.exports = db;