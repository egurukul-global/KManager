const fs = require("fs");
let c = fs.readFileSync("src/pages/expenses.js", "utf8");

const oldCode = `function validateAndWarnExpense(payload, excludeId, onSuccess) {
  const budget = getBudgetById(payload.budget_id);
  const bucket = getBucketById(payload.bucket_id);
  const categoryLabel = payload.vendor_info?.replace("budget_cat:", "") || "";
  const categoryOption = {
    label: categoryLabel,
    categoryId: payload.category_id,
    budgetedUsd: (budget?.categories || []).find(c => {
      const n = (c.name || c.category || "").toLowerCase();
      const target = categoryLabel.toLowerCase();
      const sub = (c.subcategory || "").toLowerCase();
      return n === target || `${n} \u2014 ${sub}` === target;
    })?.usdAmount ?? (budget?.categories || []).find(c => {
      const n = (c.name || c.category || "").toLowerCase();
      const target = categoryLabel.toLowerCase();
      const sub = (c.subcategory || "").toLowerCase();
      return n === target || `${n} \u2014 ${sub}` === target;
    })?.usd_amount ?? 0
  };`;

const newCode = `function validateAndWarnExpense(payload, excludeId, onSuccess) {
  const budget = getBudgetById(payload.budget_id);
  const bucket = getBucketById(payload.bucket_id);
  // Get category label: prefer category_id lookup, fall back to vendor_info
  let categoryLabel = payload.vendor_info?.replace("budget_cat:", "") || "";
  if (!categoryLabel && payload.category_id) {
    const cat = (teamCategoriesCache || []).find(c => c.id === payload.category_id);
    if (cat) categoryLabel = cat.name;
  }
  const categoryOption = {
    label: categoryLabel,
    categoryId: payload.category_id,
    budgetedUsd: 0
  };
  // Find matching budget category by name
  if (budget && categoryLabel) {
    const match = (budget.categories || []).find(c => {
      const n = (c.name || c.category || "").toLowerCase();
      const target = categoryLabel.toLowerCase();
      const sub = (c.subcategory || "").toLowerCase();
      return n === target || `${n} \u2014 ${sub}` === target;
    });
    if (match) categoryOption.budgetedUsd = match.usdAmount || match.usd_amount || 0;
  }`;

c = c.replace(oldCode, newCode);
fs.writeFileSync("src/pages/expenses.js", c);
console.log("Fixed validateAndWarnExpense");
