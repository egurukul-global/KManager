const fs = require('fs');
let code = fs.readFileSync('src/pages/buckets.js', 'utf8');

const targetSave = `  const isPersonal = document.getElementById('bucketPersonal')?.checked;
  const bucketData = {
    name: document.getElementById('bucketName').value.trim(),
    type: document.getElementById('bucketType').value,
    currency: document.getElementById('bucketCurrency').value,
    balance: parseFloat(document.getElementById('bucketBalance').value) || 0,
    owner_user_id: isPersonal ? state.user?.id : null
  };`;

const replacementSave = `  const isPersonal = document.getElementById('bucketPersonal')?.checked;
  const isOrg = document.getElementById('bucketModal').dataset.isOrg === 'true';
  const bucketData = {
    name: document.getElementById('bucketName').value.trim(),
    type: document.getElementById('bucketType').value,
    currency: document.getElementById('bucketCurrency').value,
    balance: parseFloat(document.getElementById('bucketBalance').value) || 0,
    owner_user_id: isPersonal && !isOrg ? state.user?.id : null
  };
  
  if (isOrg) {
    bucketData.is_org_level = true;
    bucketData.team_id = null; // Org buckets don't belong to a team
  } else {
    bucketData.team_id = state.currentTeam.team_id;
  }`;

code = code.replace(targetSave, replacementSave);

const targetInsert = `      const { error } = await supabaseClient
        .from('buckets')
        .insert([{
          ...bucketData,
          team_id: state.currentTeam.team_id,
          created_by: state.user.id
        }]);`;

const replacementInsert = `      const insertData = { ...bucketData, created_by: state.user.id };
      if (!isOrg && !insertData.team_id) insertData.team_id = state.currentTeam.team_id;
      
      const { error } = await supabaseClient
        .from('buckets')
        .insert([insertData]);`;

code = code.replace(targetInsert, replacementInsert);

fs.writeFileSync('src/pages/buckets.js', code, 'utf8');
