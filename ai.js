const express = require('express');
const rateLimit = require('express-rate-limit');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();

const API_KEY = process.env.GEMINI_API_KEY;
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const FALLBACK_MODELS = (process.env.GEMINI_FALLBACK_MODELS
  ? process.env.GEMINI_FALLBACK_MODELS.split(',').map((s) => s.trim()).filter(Boolean)
  : ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']);

const MODEL_CHAIN = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== PRIMARY_MODEL)];

const SYSTEM_INSTRUCTION = `Kamu adalah asisten belanja untuk aplikasi Shopping List.
Selalu jawab dalam Bahasa Indonesia.
Balas HANYA dalam format JSON array of strings, contoh: ["Daging sapi 1.5 kg", "Santan kelapa 1 L"].
Jangan menambahkan komentar, penjelasan, atau teks lain di luar daftar.
Maksimal 8 item per daftar.`;

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Terlalu banyak permintaan AI. Coba lagi sebentar.' },
});

function isModelUnavailableError(err) {
  const status = err?.status || err?.statusCode;
  const msg = (err?.message || '').toLowerCase();
  if (status === 404 || status === 503 || status === 429) return true;
  return /not found|unavailable|overloaded|quota|deprecated|unsupported|does not exist/.test(msg);
}

async function callWithFallback(genAI, prompt) {
  let lastErr;
  for (const modelName of MODEL_CHAIN) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: { responseMimeType: 'application/json' },
      });
      const result = await model.generateContent(prompt);
      return { text: result.response.text(), modelUsed: modelName };
    } catch (err) {
      lastErr = err;
      console.warn(`[AI] model "${modelName}" failed: ${err.message}`);
      if (!isModelUnavailableError(err)) throw err;
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
    const genAI = new GoogleGenerativeAI(API_KEY);
    const { text, modelUsed } = await callWithFallback(genAI, prompt.trim());

    let items;
    try {
      items = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: 'AI mengembalikan format tidak valid' });
    }

    if (!Array.isArray(items)) {
      return res.status(502).json({ error: 'AI tidak mengembalikan daftar' });
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
