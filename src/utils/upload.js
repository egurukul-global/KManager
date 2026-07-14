// ==================== R2 RECEIPT UPLOAD (via Supabase Edge Function) ====================
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseClient } from '../db.js';

/**
 * Upload a receipt file to Cloudflare R2 using a signed URL from the
 * get-upload-url Supabase Edge Function.
 *
 * Calls: `${SUPABASE_URL}/functions/v1/get-upload-url`
 * Project ID is inside SUPABASE_URL in src/db.js
 * (example: https://nvhaetvreopkktlxxdwg.supabase.co → project ref = nvhaetvreopkktlxxdwg)
 *
 * @param {File} file
 * @returns {Promise<string>} publicUrl to save on the expense
 */
export async function uploadReceipt(file) {
  if (!file) throw new Error('No file selected');

  const filename = file.name || `receipt-${Date.now()}.jpg`;
  const contentType = file.type || 'application/octet-stream';

  try {
    const session = await supabaseClient.auth.getSession();
    const accessToken = session?.data?.session?.access_token || SUPABASE_ANON_KEY;

    const params = new URLSearchParams({ filename, contentType });

    const urlRes = await fetch(
      `${SUPABASE_URL}/functions/v1/get-upload-url?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY
        }
      }
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

    if (!signedUrl || !publicUrl) {
      throw new Error('Upload URL response missing signedUrl or publicUrl');
    }

    const putRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file
    });

    if (!putRes.ok) {
      throw new Error(`Receipt upload failed (${putRes.status})`);
    }

    return publicUrl;
  } catch (err) {
    console.error('uploadReceipt:', err);
    throw err instanceof Error ? err : new Error(String(err?.message || err));
  }
}
