const fs = require('fs');
let code = fs.readFileSync('src/styles.css', 'utf8');

code = code.replace(
  /\.ok-shell-theme\.light \.team-switcher select\{/g,
  '.ok-shell-theme.light .team-switcher select, .ok-shell-theme.light #viewModeSelect{'
);
code = code.replace(
  /\.ok-shell-theme\.light \.team-switcher select option\{/g,
  '.ok-shell-theme.light .team-switcher select option, .ok-shell-theme.light #viewModeSelect option{'
);
fs.writeFileSync('src/styles.css', code, 'utf8');
console.log('Fixed CSS in styles.css');
