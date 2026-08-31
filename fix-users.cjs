const fs = require('fs');
let bucketsJs = fs.readFileSync('src/pages/buckets.js', 'utf8');

const oldUsersData = `const { data: usersData } = await supabaseClient.from('users').select('id, name, email, role').order('name');`;
const newUsersData = `let { data: usersData, error: usersError } = await supabaseClient.from('users').select('id, name, email, role').order('name');
    if (usersError || !usersData || usersData.length === 0) {
      // Fallback if RLS blocks the user query: query via user_teams to get accessible users
      const { data: utData } = await supabaseClient.from('user_teams').select('users(id, name, email, role)');
      if (utData) {
        const unique = {};
        utData.forEach(ut => {
          if (ut.users && !unique[ut.users.id]) unique[ut.users.id] = ut.users;
        });
        usersData = Object.values(unique).sort((a,b) => (a.name||'').localeCompare(b.name||''));
      } else {
        usersData = [];
      }
    }`;

bucketsJs = bucketsJs.replace(oldUsersData, newUsersData);
fs.writeFileSync('src/pages/buckets.js', bucketsJs);
