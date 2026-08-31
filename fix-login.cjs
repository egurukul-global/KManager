const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  "const data = await secureLogin(email, password);",
  "sessionStorage.removeItem('kmanager_view_mode');\n    state.activeViewContext = null;\n    const data = await secureLogin(email, password);"
);

fs.writeFileSync('src/main.js', code);
