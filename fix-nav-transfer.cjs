const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

code = code.replace(
  "if (page === 'manager-finance' && isFin) { /* let it show */ } else { hide = true; }",
  "if ((page === 'manager-finance' || page === 'transfer') && isFin) { /* let it show */ } else { hide = true; }"
);
code = code.replace(
  "if (page === 'manager-finance' && isFin) { /* let it show */ } else { hide = true; }",
  "if ((page === 'manager-finance' || page === 'transfer') && isFin) { /* let it show */ } else { hide = true; }"
);

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
console.log('Fixed nav permissions for transfer menu');
