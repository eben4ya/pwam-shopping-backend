require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./db');
const aiRouter = require('./ai');

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.use('/ai', aiRouter);

app.get('/items', async (req, res) => {
  try {
    const { rows } = await db.execute('SELECT * FROM items');
    res.json(rows);
  } catch (err) {
    console.error('GET /items error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

app.post('/items', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const ins = await db.execute({
      sql: 'INSERT INTO items (name, checked) VALUES (?, 0)',
      args: [name.trim()],
    });
    const { rows } = await db.execute({
      sql: 'SELECT * FROM items WHERE id = ?',
      args: [Number(ins.lastInsertRowid)],
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /items error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

app.put('/items/:id', async (req, res) => {
  const { id } = req.params;
  const { name, checked } = req.body;
  try {
    const existing = await db.execute({
      sql: 'SELECT * FROM items WHERE id = ?',
      args: [id],
    });
    if (existing.rows.length === 0) return res.status(404).json({ error: 'item not found' });
    const cur = existing.rows[0];
    const newName = name !== undefined ? name.trim() : cur.name;
    const newChecked = checked !== undefined ? (checked ? 1 : 0) : cur.checked;

    await db.execute({
      sql: 'UPDATE items SET name = ?, checked = ? WHERE id = ?',
      args: [newName, newChecked, id],
    });
    const updated = await db.execute({
      sql: 'SELECT * FROM items WHERE id = ?',
      args: [id],
    });
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('PUT /items error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

app.delete('/items/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await db.execute({
      sql: 'SELECT * FROM items WHERE id = ?',
      args: [id],
    });
    if (existing.rows.length === 0) return res.status(404).json({ error: 'item not found' });
    await db.execute({ sql: 'DELETE FROM items WHERE id = ?', args: [id] });
    res.status(200).json({ message: 'deleted', id: Number(id) });
  } catch (err) {
    console.error('DELETE /items error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
