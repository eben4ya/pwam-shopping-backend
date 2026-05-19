# pwam-shopping-backend

REST API for the **Global Shopping List** — a PWAM demo showing how one backend serves multiple platforms (web + mobile) simultaneously.

Built with **Node.js**, **Express**, and **SQLite** (via `better-sqlite3`).

---

## Prerequisites

- Node.js ≥ 18
- npm

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and edit if needed
cp .env.example .env

# 3. Start the server
npm start
```

Server runs at `http://localhost:3000` (or the port you set in `.env`).

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `CORS_ORIGIN` | `*` | Allowed CORS origin (restrict in production) |
| `DB_PATH` | `shopping.db` | SQLite database file path |

> **Never commit `.env` to version control.** Use `.env.example` as the template.

---

## AI Integration

The backend exposes an AI-powered suggestion endpoint via [OpenRouter](https://openrouter.ai/), a unified API gateway that routes requests to free LLMs.

| Variable | Default | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | *(required)* | Get yours at https://openrouter.ai/keys |
| `OPENROUTER_MODEL` | `meta-llama/llama-3.3-70b-instruct:free` | Primary model |
| `OPENROUTER_FALLBACK_MODELS` | *(see `.env.example`)* | Comma-separated fallback models |

**How it works:**
1. Client sends `POST /ai/suggest` with a natural-language `prompt` (e.g., *"mau bikin rendang untuk 5 porsi"*).
2. The server calls the primary model via OpenRouter. If it is unavailable (429/503/404), it automatically retries with each fallback model in order.
3. The response is parsed and returned as a JSON array of up to 8 shopping items.
4. Requests are rate-limited to **10 per minute** per IP.

**AI Endpoint:**

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/ai/suggest` | `{ "prompt": "mau bikin rendang" }` | `{ "items": ["..."], "model": "..." }` |

---

## API Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/items` | — | Array of all items |
| `POST` | `/items` | `{ "name": "Apples" }` | Created item (201) |
| `PUT` | `/items/:id` | `{ "name": "...", "checked": true }` | Updated item |
| `DELETE` | `/items/:id` | — | `{ "message": "deleted", "id": 1 }` |

### Example with curl

```bash
# Get all items
curl http://localhost:3000/items

# Add an item
curl -X POST http://localhost:3000/items \
  -H "Content-Type: application/json" \
  -d '{"name":"Apples"}'

# Check off item 1
curl -X PUT http://localhost:3000/items/1 \
  -H "Content-Type: application/json" \
  -d '{"checked":true}'

# Delete item 1
curl -X DELETE http://localhost:3000/items/1
```

---

## Postman Demo (step-by-step)

1. `GET /items` → `[]` — empty list
2. `POST /items` with `{"name":"Apples"}` → item created
3. `GET /items` → `[{"id":1,"name":"Apples","checked":0}]`
4. `DELETE /items/1` → item removed
5. `GET /items` → `[]` — back to empty

---

## Project Structure

```
pwam-shopping-backend/
├── .env.example   ← copy to .env
├── .gitignore
├── db.js          ← SQLite connection & table setup
├── server.js      ← Express app & routes
├── ai.js          ← OpenRouter AI suggestion endpoint
└── package.json
```

---

## Ideas for Improvement

- Add user authentication (JWT)
- Add item quantity / price fields
- Replace SQLite with PostgreSQL for multi-user support
- Deploy to Railway, Render, or Fly.io
- Add input sanitization & rate limiting for production
