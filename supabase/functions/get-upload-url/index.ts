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
    const publicBase = Deno.env.get('R2_PUBLIC_BASE_URL'); // e.g. https://pub-xxxx.r2.dev

    if (!accessKeyId || !secretAccessKey || !accountId || !bucket) {
      return json({
        error: 'Missing R2 secrets (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, CLOUDFLARE_ACCOUNT_ID, R2_BUCKET_NAME)'
      }, 500);
    }

    const url = new URL(req.url);
    const filename = (url.searchParams.get('filename') || 'receipt').trim();
    const contentType = (url.searchParams.get('contentType') || 'application/octet-stream').trim();

    const safeName = filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 120) || 'receipt';
    const objectKey = `receipts/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;

    // R2 S3 API endpoint (your account):
    // https://[CLOUDFLARE_ACCOUNT_ID].r2.cloudflarestorage.com
    // Example: https://3ff08c36f84c1decc68eb0def3053e6e.r2.cloudflarestorage.com
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const objectUrl = `${endpoint}/${bucket}/${objectKey}`;

    const client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      region: 'auto'
    });

    const signed = await client.sign(
      new Request(objectUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType }
      }),
      { aws: { signQuery: true } }
    );

    const signedUrl = signed.url;
    const base = (publicBase || `${endpoint}/${bucket}`).replace(/\/$/, '');
    const publicUrl = `${base}/${objectKey}`;

    return json({ signedUrl, publicUrl });
  } catch (err) {
    console.error('get-upload-url:', err);
    return json({ error: err?.message || 'Failed to create upload URL' }, 500);
  }
});
