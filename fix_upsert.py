import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = r"await supabaseClient\.from\('bucket_access'\)\.upsert\(\[payload\], \{ onConflict: 'bucket_id,user_id' \}\);"
new = r"const { error: upsertErr } = await supabaseClient.from('bucket_access').upsert([payload], { onConflict: 'bucket_id,user_id' });\n      if (upsertErr) throw upsertErr;"
content = re.sub(old, new, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Upsert checked")
