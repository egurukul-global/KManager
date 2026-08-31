const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

// Update viewSelectorContainer to include team-switcher class and match exact select inline styles
const regex = /<div id="viewSelectorContainer" style="display:none; flex: 1; align-items: center; gap: 6px;">\s*<span style="font-size:0.7em; text-transform:uppercase; opacity:0.7; font-weight:bold;">View<\/span>\s*<select id="viewModeSelect" onchange="window.switchViewMode\(this.value\)" style="flex:1; padding:2px 6px; font-size:0.8em; height:24px; border:1px solid rgba\(255,255,255,0.2\); border-radius:4px; background:rgba\(0,0,0,0.2\); color:white; cursor:pointer;">/m;

const newHTML = `<div id="viewSelectorContainer" class="team-switcher" style="display:none; flex: 1; align-items: center; gap: 6px; padding:0; border:none;">
    <span style="font-size:0.7em; text-transform:uppercase; opacity:0.7; font-weight:bold; letter-spacing:0.5px;">View</span>
    <select id="viewModeSelect" onchange="window.switchViewMode(this.value)" style="flex:1; padding:2px 6px; font-size:0.8em; height:24px; border:1px solid rgba(255,255,255,0.2); border-radius:4px; background:rgba(0,0,0,0.2); color:white; cursor:pointer;">`;

if (regex.test(code)) {
  code = code.replace(regex, newHTML);
  fs.writeFileSync('src/main.js', code, 'utf8');
  console.log('Fixed viewSelectorContainer classes');
} else {
  console.log('Regex failed');
}
