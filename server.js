require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.get('/items', (req, res) => {
  const items = db.prepare('SELECT * FROM items').all();
  res.json(items);
});

app.post('/items', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const result = db.prepare('INSERT INTO items (name, checked) VALUES (?, 0)').run(name.trim());
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

app.put('/items/:id', (req, res) => {
  const { id } = req.params;
  const { name, checked } = req.body;
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'item not found' });

  const newName = name !== undefined ? name.trim() : item.name;
  const newChecked = checked !== undefined ? (checked ? 1 : 0) : item.checked;

  db.prepare('UPDATE items SET name = ?, checked = ? WHERE id = ?').run(newName, newChecked, id);
  const updated = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  res.json(updated);
});

app.delete('/items/:id', (req, res) => {
  const { id } = req.params;
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
  if (!item) return res.status(404).json({ error: 'item not found' });

  db.prepare('DELETE FROM items WHERE id = ?').run(id);
  res.status(200).json({ message: 'deleted', id: Number(id) });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
