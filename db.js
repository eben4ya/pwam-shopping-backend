const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const ready = (async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      google_id TEXT UNIQUE NOT NULL,
      email     TEXT NOT NULL,
      name      TEXT NOT NULL,
      picture   TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      name    TEXT    NOT NULL,
      checked INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER REFERENCES users(id)
    )
  `);
  const cols = await db.execute('PRAGMA table_info(items)');
  if (!cols.rows.find((c) => c.name === 'user_id')) {
    await db.execute('ALTER TABLE items ADD COLUMN user_id INTEGER REFERENCES users(id)');
  }
})().catch((err) => {
  console.error('DB init error:', err.message);
});

module.exports = db;
module.exports.ready = ready;
