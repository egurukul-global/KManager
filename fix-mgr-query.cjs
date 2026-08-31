const fs = require('fs');
let code = fs.readFileSync('src/pages/manager-expenses.js', 'utf8');

// Fix 1: The query
code = code.replace(
  /\.select\('id, date, item, usd_amount, local_amount, currency, receipt_url, budget_id, category_id, bucket_id, is_reviewed, is_submitted, team_id, teams\(name\), budgets\(name\), categories\(name\)'\)/g,
  ".select('id, date, item, usd_amount, local_amount, currency, receipt_url, budget_id, category_id, bucket_id, is_reviewed, is_submitted, team_id, teams(name)')"
);

// Fix 2: The render mappings (it was breaking trying to do exp.budgets.name)
code = code.replace(/exp\.teams\?\.name/g, "exp.teams && exp.teams.name ? exp.teams.name : 'Unknown'");
code = code.replace(/exp\.budgets\?\.name/g, "exp.budget_id"); // Temporary, we will fix this properly below
code = code.replace(/exp\.categories\?\.name/g, "exp.category_id || exp.vendor_info");

fs.writeFileSync('src/pages/manager-expenses.js', code);
