const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || 'shopping.db';
const dbDir = path.dirname(dbPath);
if (dbDir !== '.') fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT    NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0
  )
`);

module.exports = db;
