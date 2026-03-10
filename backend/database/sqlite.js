// SQLite adapter (local development)
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'products.db');

class SQLiteDatabase {
  constructor() {
    this.db = null;
  }

  open() {
    if (!this.db) {
      this.db = new Database(DB_PATH);
      this.db.pragma('journal_mode = WAL');
      this.migrate();
    }
    return this;
  }

  migrate() {
    const schema = require('fs').readFileSync(
      path.join(__dirname, 'schema.sql'),
      'utf8'
    );
    this.db.exec(schema);
  }

  run(sql, params = []) {
    return this.db.prepare(sql).run(params);
  }

  get(sql, params = []) {
    return this.db.prepare(sql).get(params);
  }

  all(sql, params = []) {
    return this.db.prepare(sql).all(params);
  }

  batchInsert(table, records) {
    if (records.length === 0) return;
    
    const columns = Object.keys(records[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const sql = `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
    
    const insert = this.db.prepare(sql);
    const insertMany = this.db.transaction((records) => {
      for (const record of records) {
        insert.run(columns.map(col => record[col]));
      }
    });
    
    insertMany(records);
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

const db = new SQLiteDatabase();
db.open();

module.exports = db;