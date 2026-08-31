let allowed = '["team", "manager", "admin"]';
if (typeof allowed === 'string') allowed = allowed.replace(/[{}]/g, '').split(',');
console.log("JSON string result:", allowed);
console.log("Includes manager?", allowed.includes('manager'));

let allowed2 = '{team,manager,admin}';
if (typeof allowed2 === 'string') allowed2 = allowed2.replace(/[{}]/g, '').split(',');
console.log("Postgres string result:", allowed2);
console.log("Includes manager?", allowed2.includes('manager'));
