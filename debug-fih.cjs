const fs = require('fs');
let code = fs.readFileSync('src/utils/teamAccess.js', 'utf8');

const target = `    const isAdmin = allowed.includes('admin');
    const isManager = allowed.includes('manager');`;

const debugCode = `    const isAdmin = allowed.includes('admin');
    const isManager = allowed.includes('manager');
    if (state.user.email === 'fih@k.com') {
      console.log('DEBUG FIH', { allowed, isAdmin, isManager });
      if (window.showToast) window.showToast('DEBUG: ' + JSON.stringify(allowed) + ' admin:' + isAdmin + ' mgr:' + isManager, 'info');
    }`;

code = code.replace(target, debugCode);

fs.writeFileSync('src/utils/teamAccess.js', code, 'utf8');
