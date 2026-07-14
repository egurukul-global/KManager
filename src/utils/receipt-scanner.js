// ==================== RECEIPT OCR (Tesseract.js — browser only) ====================
import { createWorker } from 'tesseract.js';

/**
 * Run OCR on an image File/Blob.
 * @param {File|Blob} imageFile
 * @param {(pct: number, status: string) => void} [onProgress] 0–100
 * @returns {Promise<{ text: string, confidence: number }>}
 */
export async function scanReceipt(imageFile, onProgress) {
  if (!imageFile) throw new Error('No image selected');

  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (!onProgress) return;
      const pct = typeof m.progress === 'number' ? Math.round(m.progress * 100) : 0;
      onProgress(pct, m.status || '');
    }
  });

  try {
    const { data } = await worker.recognize(imageFile);
    const text = String(data?.text || '').trim();
    const confidence = Number(data?.confidence) || 0;
    return { text, confidence };
  } finally {
    await worker.terminate().catch(() => {});
  }
}

/**
 * Parse OCR text into expense-ish fields.
 * @param {string} text
 * @returns {{ merchant: string|null, date: string|null, total: number|null, rawText: string, confidenceNote: string }}
 */
export function parseReceipt(text) {
  const rawText = String(text || '');
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  return {
    merchant: extractMerchant(lines),
    date: extractDate(rawText, lines),
    total: extractTotal(rawText, lines),
    rawText,
    confidenceNote: ''
  };
}

function extractMerchant(lines) {
  for (const line of lines.slice(0, 8)) {
    if (line.length < 2 || line.length > 40) continue;
    if (/^\d+([.,]\d+)?$/.test(line)) continue;
    if (/total|subtotal|tax|amount|change|cash|card|visa|mastercard|debit|credit/i.test(line)) continue;
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line)) continue;
    if (/^https?:/i.test(line)) continue;
    // Prefer lines with letters
    if (/[A-Za-z]{2,}/.test(line)) {
      return line.replace(/\s{2,}/g, ' ').slice(0, 20);
    }
  }
  return lines[0] ? lines[0].slice(0, 20) : null;
}

function extractDate(rawText, lines) {
  const patterns = [
    /\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b/, // YYYY-MM-DD
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/, // MM/DD/YYYY or DD/MM/YYYY
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2})\b/ // MM/DD/YY
  ];

  const candidates = [];
  for (const re of patterns) {
    let m;
    const r = new RegExp(re.source, 'g');
    while ((m = r.exec(rawText)) !== null) {
      candidates.push(m);
    }
  }

  for (const m of candidates) {
    const iso = normalizeToIsoDate(m);
    if (iso) return iso;
  }

  // Fallback: scan bottom lines (dates often near footer)
  for (const line of [...lines].reverse().slice(0, 12)) {
    for (const re of patterns) {
      const m = line.match(re);
      if (m) {
        const iso = normalizeToIsoDate(m);
        if (iso) return iso;
      }
    }
  }
  return null;
}

function normalizeToIsoDate(m) {
  if (!m) return null;
  let y;
  let mo;
  let d;
  if (m[0].match(/^\d{4}/)) {
    y = Number(m[1]);
    mo = Number(m[2]);
    d = Number(m[3]);
  } else {
    const a = Number(m[1]);
    const b = Number(m[2]);
    y = Number(m[3]);
    if (y < 100) y += 2000;
    // Prefer MM/DD when first part > 12 can't be month → swap
    if (a > 12 && b <= 12) {
      d = a;
      mo = b;
    } else {
      mo = a;
      d = b;
    }
  }
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  // Reject absurd future dates (> 1 year ahead) or very old (> 20y)
  const now = new Date();
  if (dt.getFullYear() < now.getFullYear() - 20) return null;
  if (dt.getFullYear() > now.getFullYear() + 1) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function extractTotal(rawText, lines) {
  const labeled = [
    /(?:grand\s*)?total[\s:]*[$₹€£]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))/i,
    /(?:amount\s*(?:due|payable)?|balance\s*due|net\s*amount)[\s:]*[$₹€£]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))/i,
    /[$₹€£]\s*([0-9]{1,3}(?:,[0-9]{3})*\.[0-9]{2})\s*$/im
  ];

  for (const re of labeled) {
    const m = rawText.match(re);
    if (m) {
      const n = parseMoney(m[1]);
      if (n != null) return n;
    }
  }

  // Bottom numbers with decimals (likely totals)
  const moneyRe = /[$₹€£]?\s*([0-9]{1,6}(?:[.,][0-9]{2}))\b/g;
  const bottom = lines.slice(-15).join('\n');
  let best = null;
  let m;
  while ((m = moneyRe.exec(bottom)) !== null) {
    const n = parseMoney(m[1]);
    if (n != null && n > 0) best = n;
  }
  return best;
}

function parseMoney(str) {
  if (!str) return null;
  let s = String(str).trim();
  // European 1.234,56 → 1234.56
  if (/^\d{1,3}(\.\d{3})+,\d{2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0 || n > 1e7) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Full pipeline: OCR → parse.
 * On weak OCR still returns parsed fields (may be null) with a warning flag.
 */
export async function scanAndParseReceipt(imageFile, onProgress) {
  const { text, confidence } = await scanReceipt(imageFile, onProgress);
  const parsed = parseReceipt(text);
  const lowConfidence = confidence > 0 && confidence < 55;
  const emptyParse = !parsed.merchant && !parsed.date && parsed.total == null;

  return {
    ...parsed,
    confidence,
    ocrFailed: !text,
    lowConfidence: lowConfidence || emptyParse,
    warning: !text
      ? 'Could not read text from this image. Enter details manually.'
      : lowConfidence || emptyParse
        ? 'OCR was unsure — please check Item, Date, and Amount.'
        : null
  };
}
