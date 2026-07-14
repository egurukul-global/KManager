import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const bucket = Deno.env.get('R2_BUCKET_NAME');

    if (!accessKeyId || !secretAccessKey || !accountId || !bucket) {
      return json({ error: 'Missing R2 secrets' }, 500);
    }

    const url = new URL(req.url);
    let objectKey = (url.searchParams.get('key') || '').trim();
    if (!objectKey) {
      return json({ error: 'Missing "key" parameter' }, 400);
    }

    // Allow accidental full URLs; normalize to object key
    if (objectKey.startsWith('http')) {
      try {
        const u = new URL(objectKey);
        const parts = u.pathname.replace(/^\//, '').split('/');
        const idx = parts.findIndex((p) => p === 'receipts');
        objectKey = idx >= 0 ? parts.slice(idx).join('/') : parts.slice(1).join('/');
      } catch {
        /* keep as-is */
      }
    }
    objectKey = objectKey.replace(/^\/+/, '');

    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const objectUrl = `${endpoint}/${bucket}/${objectKey}`;

    const client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: 'auto'
    });

    const signed = await client.sign(
      new Request(objectUrl, { method: 'GET' }),
      { aws: { signQuery: true } }
    );

    return json({ viewUrl: signed.url, objectKey });
  } catch (err) {
    console.error('get-receipt-url:', err);
    return json({ error: err?.message || 'Failed to create view URL' }, 500);
  }
});
