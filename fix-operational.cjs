const fs = require('fs');
let code = fs.readFileSync('src/utils/transferHelpers.js', 'utf8');

code = code.replace(
  "export function isOperationalBucket(bucket) {\n  return bucket && !bucket.owner_user_id;\n}",
  "export function isOperationalBucket(bucket) {\n  return bucket && !bucket.owner_user_id && !bucket.is_org_level;\n}"
);

fs.writeFileSync('src/utils/transferHelpers.js', code);
