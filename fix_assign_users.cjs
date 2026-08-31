const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

const correctAssignUsers = `    let { data: usersData, error: usersError } = await supabaseClient.from('users').select('id, name, email, role').order('name');
    
    const { data: accessData } = await supabaseClient.from('bucket_access').select('user_id, users(id, name, email, role)').eq('bucket_id', bucketId);

    if (usersError || !usersData || usersData.length === 0) {
      // Fallback if RLS blocks the user query: query via user_teams and app_role_assignments
      const { data: utData } = await supabaseClient.from('user_teams').select('users(id, name, email, role)');
      const { data: araData } = await supabaseClient.from('app_role_assignments').select('users(id, name, email, role)');
      
      const unique = {};
      if (utData) {
        utData.forEach(ut => {
          if (ut.users && !unique[ut.users.id]) unique[ut.users.id] = ut.users;
        });
      }
      if (araData) {
        araData.forEach(ar => {
          if (ar.users && !unique[ar.users.id]) unique[ar.users.id] = ar.users;
        });
      }
      if (accessData) {
        accessData.forEach(a => {
          if (a.users && !unique[a.users.id]) unique[a.users.id] = a.users;
        });
      }
      usersData = Object.values(unique).sort((a,b) => (a.name||'').localeCompare(b.name||''));
    }
    
    const assignedIds = new Set(accessData?.map(a => a.user_id) || []);
    allAssignUsers = usersData.map(u => ({ ...u, assigned: assignedIds.has(u.id) }));
    
    window.filterAssignUsers();`;

code = code.replace(/    let \{ data: usersData[\s\S]*?window\.filterAssignUsers\(\);\n/, correctAssignUsers + '\n');
fs.writeFileSync('src/pages/buckets.js', code);
console.log('Fixed assign users fallback');
