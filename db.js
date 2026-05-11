const Database = require('better-sqlite3');

const db = new Database(process.env.DB_PATH || 'shopping.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT    NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0
  )
`);

module.exports = db;
