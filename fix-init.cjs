const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  `      if (Date.now() - lastActivity > window.INACTIVITY_LIMIT) {
        await window.forceLogout();
        return;
      }
    }

  } else {`,
  `      if (Date.now() - lastActivity > window.INACTIVITY_LIMIT) {
        await window.forceLogout();
        return;
      }
    }
    await initializeApp();
  } else {`
);

fs.writeFileSync('src/main.js', code, 'utf8');
