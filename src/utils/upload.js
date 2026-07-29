// ==================== R2 RECEIPT UPLOAD / VIEW (via Supabase Edge Functions) ====================
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseClient } from '../db.js';

async function authHeaders() {
  const session = await supabaseClient.auth.getSession();
  const accessToken = session?.data?.session?.access_token || SUPABASE_ANON_KEY;
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: SUPABASE_ANON_KEY
  };
}

/**
 * Turn a stored receipt value into an R2 object key like:
 * receipts/123456-abcd-file.jpg
 * Also accepts older full URLs and extracts the key.
 */
export function extractReceiptObjectKey(stored) {
  if (!stored) return '';
  const s = String(stored).trim();
  if (!s) return '';
  if (s.startsWith('receipts/')) return s;
  if (!s.startsWith('http://') && !s.startsWith('https://')) return s.replace(/^\/+/, '');

  try {
    const u = new URL(s);
    const parts = u.pathname.replace(/^\//, '').split('/').filter(Boolean);
    const idx = parts.findIndex(p => p === 'receipts');
    if (idx >= 0) return parts.slice(idx).join('/');
    // path-style …/bucket/receipts/... already handled; else drop leading bucket segment
    if (parts.length >= 2) return parts.slice(1).join('/');
    return parts.join('/');
  } catch {
    return '';
  }
}

/**
 * True when the stored value is an http(s) link we can open as-is
 * (manual paste of an external URL, not our private R2 key).
 */
export function isExternalReceiptUrl(stored) {
  const s = String(stored || '').trim();
  if (!s.startsWith('http://') && !s.startsWith('https://')) return false;
  // Our R2 S3 endpoint URLs are private — treat as key, not openable public links
  if (s.includes('.r2.cloudflarestorage.com')) return false;
  if (s.includes('/receipts/')) return false;
  return true;
}

/**
 * Upload a receipt file to Cloudflare R2.
 * @returns {Promise<{ publicUrl: string, objectKey: string }>}
 * Save objectKey on the expense (receipt_url column).
 */
export async function uploadReceipt(file) {
  if (!file) throw new Error('No file selected');

  const filename = file.name || `receipt-${Date.now()}.jpg`;
  const contentType = file.type || 'application/octet-stream';

  try {
    const params = new URLSearchParams({ filename, contentType });
    const urlRes = await fetch(
      `${SUPABASE_URL}/functions/v1/get-upload-url?${params.toString()}`,
      { method: 'GET', headers: await authHeaders() }
    );

    if (!urlRes.ok) {
      let message = `Could not get upload URL (${urlRes.status})`;
      try {
        const errJson = await urlRes.json();
        if (errJson?.error) message = errJson.error;
      } catch {
        const errText = await urlRes.text().catch(() => '');
        if (errText) message = errText;
      }
      throw new Error(message);
    }

    const payload = await urlRes.json();
    const signedUrl = payload.signedUrl;
    const publicUrl = payload.publicUrl;
    let objectKey = payload.objectKey || '';

    if (!signedUrl) throw new Error('Upload URL response missing signedUrl');
    if (!objectKey && publicUrl) objectKey = extractReceiptObjectKey(publicUrl);
    if (!objectKey) throw new Error('Upload URL response missing objectKey');

    const putRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file
    });

    if (!putRes.ok) {
      throw new Error(`Receipt upload failed (${putRes.status})`);
    }

    return { publicUrl: publicUrl || objectKey, objectKey };
  } catch (err) {
    console.error('uploadReceipt:', err);
    throw err instanceof Error ? err : new Error(String(err?.message || err));
  }
}

/**
 * Get a temporary signed view URL for an R2 object key.
 * @param {string} objectKey e.g. receipts/123-file.jpg
 * @returns {Promise<string>} viewUrl
 */
export async function getReceiptUrl(objectKey) {
  const key = extractReceiptObjectKey(objectKey);
  if (!key) throw new Error('Missing receipt key');

  try {
    const params = new URLSearchParams({ key });
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/get-receipt-url?${params.toString()}`,
      { method: 'GET', headers: await authHeaders() }
    );

    if (!res.ok) {
      let message = `Could not get receipt URL (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson?.error) message = errJson.error;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }

    const payload = await res.json();
    if (!payload.viewUrl) throw new Error('Response missing viewUrl');
    return payload.viewUrl;
  } catch (err) {
    console.error('getReceiptUrl:', err);
    throw err instanceof Error ? err : new Error(String(err?.message || err));
  }
}

/**
 * Resolve whatever is stored on an expense into a temporary openable URL.
 */
export async function resolveReceiptViewUrl(stored) {
  const s = String(stored || '').trim();
  if (!s) return '';
  if (isExternalReceiptUrl(s)) return s;
  return getReceiptUrl(s);
}

export async function uploadReportPdf(blob, filename) {
  try {
    const contentType = 'application/pdf';
    const params = new URLSearchParams({ filename, contentType });
    const urlRes = await fetch(
      `${SUPABASE_URL}/functions/v1/get-upload-url?${params.toString()}`,
      { method: 'GET', headers: await authHeaders() }
    );

    if (!urlRes.ok) throw new Error(`Could not get upload URL (${urlRes.status})`);

    const payload = await urlRes.json();
    const signedUrl = payload.signedUrl;
    let objectKey = payload.objectKey || '';
    if (!objectKey && payload.publicUrl) {
      objectKey = extractReceiptObjectKey(payload.publicUrl);
    }

    if (!signedUrl || !objectKey) throw new Error('Missing upload credentials from Supabase Function');

    const putRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob
    });

    if (!putRes.ok) throw new Error(`R2 report upload failed (${putRes.status})`);

    return objectKey;
  } catch (err) {
    console.error('uploadReportPdf error:', err);
    throw err;
  }
}
