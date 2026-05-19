const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const API_KEY = process.env.OPENROUTER_API_KEY;
const BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const REFERER = process.env.OPENROUTER_REFERER || 'http://localhost:3000';
const APP_TITLE = process.env.OPENROUTER_TITLE || 'PWAM Shopping List';

const PRIMARY_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-exp:free';

const FALLBACK_MODELS = (process.env.OPENROUTER_FALLBACK_MODELS
  ? process.env.OPENROUTER_FALLBACK_MODELS.split(',').map((s) => s.trim()).filter(Boolean)
  : [
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-chat-v3-0324:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
    ]);

const MODEL_CHAIN = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== PRIMARY_MODEL)];

const SYSTEM_INSTRUCTION = `Kamu adalah asisten belanja untuk aplikasi Shopping List.
Selalu jawab dalam Bahasa Indonesia.
Balas HANYA dalam format JSON array of strings, contoh: ["Daging sapi 1.5 kg", "Santan kelapa 1 L"].
Jangan menambahkan komentar, penjelasan, code fence, atau teks lain di luar daftar.
Maksimal 8 item per daftar.`;

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Terlalu banyak permintaan AI. Coba lagi sebentar.' },
});

function isModelUnavailableError(status, body) {
  if (status === 404 || status === 429 || status === 503 || status === 502) return true;
  const msg = (body || '').toLowerCase();
  return /not found|unavailable|overloaded|quota|rate limit|deprecated|unsupported|no endpoints/.test(msg);
}

function extractJsonArray(text) {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    const slice = s.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through */ }
  }
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
  } catch { /* ignore */ }
  return null;
}

async function callModel(modelName, prompt) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': REFERER,
      'X-Title': APP_TITLE,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty response from model');
  return text;
}

async function callWithFallback(prompt) {
  let lastErr;
  for (const modelName of MODEL_CHAIN) {
    try {
      const text = await callModel(modelName, prompt);
      return { text, modelUsed: modelName };
    } catch (err) {
      lastErr = err;
      console.warn(`[AI] model "${modelName}" failed: ${err.message}`);
      if (!isModelUnavailableError(err.status, err.body)) throw err;
    }
  }
  throw lastErr || new Error('Semua model AI gagal');
}

router.post('/suggest', limiter, async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({ error: 'AI belum dikonfigurasi di server' });
  }

  const { prompt } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
  }
  if (prompt.length > 500) {
    return res.status(400).json({ error: 'prompt terlalu panjang (max 500)' });
  }

  try {
    const { text, modelUsed } = await callWithFallback(prompt.trim());
    const items = extractJsonArray(text);

    if (!items) {
      console.error('[AI] could not parse response:', text.slice(0, 300));
      return res.status(502).json({ error: 'AI mengembalikan format tidak valid' });
    }

    const clean = items
      .filter((s) => typeof s === 'string' && s.trim())
      .map((s) => s.trim())
      .slice(0, 8);

    res.json({ items: clean, model: modelUsed });
  } catch (err) {
    console.error('AI error:', err.message);
    res.status(500).json({ error: 'Gagal memanggil AI' });
  }
});

module.exports = router;
