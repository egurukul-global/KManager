const fs = require('fs');
let code = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

const target = `  const ts = document.querySelector('.team-switcher');
  if (ts) ts.style.display = viewMode === 'team' ? 'flex' : 'none';`;

const replacement = `  // Hide the Team dropdown when not in Team view, but DO NOT hide the View dropdown!
  const teamDropdown = document.getElementById('teamSelect');
  if (teamDropdown) {
    const tsContainer = teamDropdown.closest('.team-switcher');
    if (tsContainer) {
      tsContainer.style.display = viewMode === 'team' ? 'flex' : 'none';
    }
  }`;

code = code.replace(target, replacement);

fs.writeFileSync('src/utils/navPermissions.js', code, 'utf8');
