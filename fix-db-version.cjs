const fs = require('fs');
let code = fs.readFileSync('src/db.js', 'utf8');

code = code.replace(
  "const LOCAL_DB_VERSION = 7;",
  "const LOCAL_DB_VERSION = 8;"
);

const upgradeBlock = `      if (oldVersion < 8) {
        if (!db.objectStoreNames.contains('app_roles')) {
          db.createObjectStore('app_roles', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('app_role_assignments')) {
          db.createObjectStore('app_role_assignments', { keyPath: 'id' });
        }
      }
    }
  });`;

code = code.replace(/    \}\n  \}\);/g, upgradeBlock);
fs.writeFileSync('src/db.js', code);
