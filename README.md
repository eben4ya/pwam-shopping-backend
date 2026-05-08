# pwam-shopping-backend

Express.js + SQLite backend for the PWAM Global Shopping List demo.

## Setup

```bash
npm install
npm start
```

Server runs at `http://localhost:3000`.

## API Endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/items` | — | Get all items |
| POST | `/items` | `{ "name": "Apples" }` | Create item |
| PUT | `/items/:id` | `{ "name": "Apples", "checked": true }` | Update item |
| DELETE | `/items/:id` | — | Delete item |

## Postman Demo (step-by-step)

1. `GET /items` → `[]` (empty list)
2. `POST /items` with `{"name":"Apples"}` → item created
3. `GET /items` → `[{"id":1,"name":"Apples","checked":0}]`
4. `DELETE /items/1` → item deleted
5. `GET /items` → `[]` (back to empty)
