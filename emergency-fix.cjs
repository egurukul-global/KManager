const fs = require('fs');
let code = fs.readFileSync('src/utils/teamAccess.js', 'utf8');

const target = `    const isAdmin = allowed.includes('admin');
    const isManager = allowed.includes('manager');`;

const newCode = `    let isAdmin = allowed.includes('admin');
    let isManager = allowed.includes('manager');
    
    // Emergency Fallback for Global Roles in case allowed_views parsing fails completely
    const role = String(state.user.role || '').toLowerCase();
    if (['admin', 'ceo', 'caoh'].includes(role)) { isAdmin = true; isManager = true; }
    if (['oh', 'fih', 'fin', 'fip', 'cao'].includes(role)) { isManager = true; }`;

code = code.replace(target, newCode);

fs.writeFileSync('src/utils/teamAccess.js', code, 'utf8');
