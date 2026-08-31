const fs = require('fs');
let doc = fs.readFileSync('docs/database_documentation.md', 'utf8');
if (!doc.includes('allowed_views')) {
  doc = doc.replace(
    '- **users.default_login_view**:',
    '- **users.allowed_views**: (TEXT[]) Array of allowed view contexts (team, manager, admin).\n- **users.default_login_view**:'
  );
  fs.writeFileSync('docs/database_documentation.md', doc, 'utf8');
}
