require('dotenv').config();

const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('./db');
const aiRouter = require('./ai');

const app = express();
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

app.use(cors({
  origin: CORS_ORIGIN,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

app.use('/ai', aiRouter);

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

app.post('/auth/google', async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'idToken required' });

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    const { sub: google_id, email, name, picture } = ticket.getPayload();

    await db.execute({
      sql: `
        INSERT INTO users (google_id, email, name, picture)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(google_id) DO UPDATE
          SET email = excluded.email,
              name  = excluded.name,
              picture = excluded.picture
      `,
      args: [google_id, email, name, picture ?? null],
    });

    const userRes = await db.execute({
      sql: 'SELECT * FROM users WHERE google_id = ?',
      args: [google_id],
    });
    const user = userRes.rows[0];
    const token = jwt.sign({ userId: Number(user.id) }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: { id: Number(user.id), email: user.email, name: user.name, picture: user.picture },
    });
  } catch (err) {
    console.error('Google token verification failed:', err.message);
    res.status(401).json({ error: 'invalid google token' });
  }
});

app.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.execute({
      sql: 'SELECT id, email, name, picture FROM users WHERE id = ?',
      args: [req.userId],
    });
    if (rows.length === 0) return res.status(404).json({ error: 'user not found' });
    const u = rows[0];
    res.json({ id: Number(u.id), email: u.email, name: u.name, picture: u.picture });
  } catch (err) {
    console.error('GET /auth/me error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

app.get('/items', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.execute({
      sql: 'SELECT * FROM items WHERE user_id = ?',
      args: [req.userId],
    });
    res.json(rows);
  } catch (err) {
    console.error('GET /items error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

app.post('/items', requireAuth, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const ins = await db.execute({
      sql: 'INSERT INTO items (name, checked, user_id) VALUES (?, 0, ?)',
      args: [name.trim(), req.userId],
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

app.put('/items/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, checked } = req.body;
  try {
    const existing = await db.execute({
      sql: 'SELECT * FROM items WHERE id = ? AND user_id = ?',
      args: [id, req.userId],
    });
    if (existing.rows.length === 0) return res.status(404).json({ error: 'item not found' });
    const cur = existing.rows[0];
    const newName = name !== undefined ? name.trim() : cur.name;
    const newChecked = checked !== undefined ? (checked ? 1 : 0) : cur.checked;

    await db.execute({
      sql: 'UPDATE items SET name = ?, checked = ? WHERE id = ? AND user_id = ?',
      args: [newName, newChecked, id, req.userId],
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

app.delete('/items/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await db.execute({
      sql: 'SELECT * FROM items WHERE id = ? AND user_id = ?',
      args: [id, req.userId],
    });
    if (existing.rows.length === 0) return res.status(404).json({ error: 'item not found' });
    await db.execute({
      sql: 'DELETE FROM items WHERE id = ? AND user_id = ?',
      args: [id, req.userId],
    });
    res.status(200).json({ message: 'deleted', id: Number(id) });
  } catch (err) {
    console.error('DELETE /items error:', err.message);
    res.status(500).json({ error: 'database error' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const vercelAction = async (action) => {
  const { VERCEL_TOKEN, VERCEL_TEAM_ID, VERCEL_PROJECT_ID_FE, VERCEL_PROJECT_ID_BE } = process.env;

  if (!VERCEL_TOKEN || !VERCEL_TEAM_ID || !VERCEL_PROJECT_ID_FE || !VERCEL_PROJECT_ID_BE) {
    return { error: 'Vercel env vars not configured' };
  }

  const callProject = async (projectId) => {
    const r = await fetch(
      `https://api.vercel.com/v1/projects/${projectId}/${action}?teamId=${VERCEL_TEAM_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
  };

  const [fe, be] = await Promise.all([
    callProject(VERCEL_PROJECT_ID_FE),
    callProject(VERCEL_PROJECT_ID_BE),
  ]);

  return { fe, be };
};

app.post('/vercel/pause', async (req, res) => {
  try {
    const result = await vercelAction('pause');
    if (result.error) return res.status(500).json({ error: result.error });
    const { fe, be } = result;
    res.status(fe.ok && be.ok ? 200 : 502).json({
      frontend: { projectId: process.env.VERCEL_PROJECT_ID_FE, ...fe },
      backend: { projectId: process.env.VERCEL_PROJECT_ID_BE, ...be },
    });
  } catch (err) {
    console.error('POST /vercel/pause error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/vercel/resume', async (req, res) => {
  try {
    const result = await vercelAction('unpause');
    if (result.error) return res.status(500).json({ error: result.error });
    const { fe, be } = result;
    res.status(fe.ok && be.ok ? 200 : 502).json({
      frontend: { projectId: process.env.VERCEL_PROJECT_ID_FE, ...fe },
      backend: { projectId: process.env.VERCEL_PROJECT_ID_BE, ...be },
    });
  } catch (err) {
    console.error('POST /vercel/resume error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
