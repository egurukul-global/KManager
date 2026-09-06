// fix-encoding.cjs — targeted mojibake repair for transfer.js
const fs = require('fs');
const p = 'src/pages/transfer.js';
let s = fs.readFileSync(p, 'utf8');

// UTF-8 bytes mis-decoded as cp1252, mapped back to the real characters
const map = {
  '\u00E2\u20AC\u201D': '\u2014', // â€"  -> —
  '\u00E2\u20AC\u00A6': '\u2026', // â€¦  -> …
  '\u00C2\u00B7': '\u00B7',       // Â·   -> ·
  '\u00E2\u203A\u201D': '\u26D4', // â›"  -> ⛔
  '\u00F0\u0178\u201C\u017D': '\uD83D\uDCCE', // ðŸ"Ž -> 📎
  '\u00F0\u0178\u201D\u201E': '\uD83D\uDD04', // ðŸ"„ -> 🔄
  '\u00F0\u0178\u2019\u00B0': '\uD83D\uDCB0', // ðŸ'° -> 💰
  '\u00F0\u0178\u201C\u00A4': '\uD83D\uDCE4', // ðŸ"¤ -> 📤
  '\u00E2\u008F\u00B3': '\u23F3'  // â³  -> ⏳
};

let total = 0;
for (const [bad, good] of Object.entries(map)) {
  const n = s.split(bad).length - 1;
  if (n) { s = s.split(bad).join(good); total += n; console.log('replaced', n, 'x', JSON.stringify(bad), '->', good); }
}
fs.writeFileSync(p, s, 'utf8');
console.log('done. total replacements:', total);

// verify: any remaining suspicious sequences?
const left = (s.match(/[^\x00-\x7F]+/g) || []).filter(r => map[r] === undefined);
console.log('remaining non-ascii runs (should all be real emoji/dashes):');
[...new Set(left)].forEach(r => console.log(' ', JSON.stringify(r)));

