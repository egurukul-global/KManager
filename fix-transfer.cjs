const fs = require('fs');
let transferJs = fs.readFileSync('src/pages/transfer.js', 'utf8');

transferJs = transferJs.replace(
  /const tag = isMemberBucket\(b\) \? ' · Member' : ' · Team';\r?\n\s+select\.innerHTML \+= `<option value="\$\{b\.id\}" data-currency="\$\{b\.currency\}">\$\{escapeHtml\(b\.name\)\}\$\{tag\} \(\$\{b\.currency\}\)<\/option>`;/g,
  "const tag = isMemberBucket(b) ? ' · Member' : ' · Team';\n    const teamName = b.teams?.name ? ` [${b.teams.name}]` : '';\n    select.innerHTML += `<option value=\"${b.id}\" data-currency=\"${b.currency}\">${escapeHtml(b.name)}${teamName}${tag} (${b.currency})</option>`;"
);

transferJs = transferJs.replace(
  /const tag = isMemberBucket\(b\) \? ' · Personal' : '';\r?\n\s+select\.innerHTML \+= `<option value="\$\{b\.id\}" data-currency="\$\{b\.currency\}">\$\{escapeHtml\(b\.name\)\}\$\{tag\} \(\$\{b\.currency\}\)<\/option>`;/g,
  "const tag = isMemberBucket(b) ? ' · Personal' : '';\n    const teamName = b.teams?.name ? ` [${b.teams.name}]` : '';\n    select.innerHTML += `<option value=\"${b.id}\" data-currency=\"${b.currency}\">${escapeHtml(b.name)}${teamName}${tag} (${b.currency})</option>`;"
);

fs.writeFileSync('src/pages/transfer.js', transferJs);
