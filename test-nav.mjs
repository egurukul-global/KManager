import { JSDOM } from 'jsdom';
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8') + '<div id="adminNav"></div>';
const dom = new JSDOM(html);
global.window = dom.window;
global.document = dom.window.document;

global.state = {
  user: { role: 'oh' },
  currentTeam: { has_budget_access: false },
  userTeamAccess: { access_level: 'member' }
};

// We need to run the logic of applyNavPermissions
const navPermissionsCode = fs.readFileSync('src/utils/navPermissions.js', 'utf8');

console.log("Simulating FIH...");
