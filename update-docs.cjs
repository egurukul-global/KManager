const fs = require('fs');
const docPath = 'docs/database_documentation.md';
if (fs.existsSync(docPath)) {
  let doc = fs.readFileSync(docPath, 'utf8');
  if (!doc.includes('default_login_view')) {
    doc += `\n### Context-Based Views\n- **users.default_login_view**: (TEXT) The default UI context for the user ('team', 'manager', 'admin'). Defaults to 'team'.\n`;
    fs.writeFileSync(docPath, doc, 'utf8');
    console.log('Updated database documentation.');
  }
} else {
  console.log('docs/database_documentation.md does not exist.');
}
