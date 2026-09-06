import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\utils\reportHelpers.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_agg = """export function aggregateSpendByCategory(filteredExpenses, teamCategories, includeSubcategory = false) {
  const map = new Map();
  filteredExpenses.forEach(exp => {
    let label;
    if (includeSubcategory) {
      label = getExpenseCategoryLabel(exp, teamCategories);
    } else {
      if (exp.category_id && teamCategories) {
        const cat = teamCategories.find(c => c.id === exp.category_id);
        label = cat ? cat.name : (exp.vendor_info || 'Unknown');
      } else {
        label = exp.vendor_info || 'Unknown';
      }
    }
    const prev = map.get(label) || { actual: 0, count: 0 };
    prev.actual += parseFloat(exp.usd_amount) || 0;
    prev.count += 1;
    map.set(label, prev);
  });
  return [...map.entries()]
    .sort((a, b) => b[1].actual - a[1].actual)
    .map(([category, data]) => ({ category, ...data }));
}"""

new_agg = """export function aggregateSpendByCategory(filteredExpenses, teamCategories, includeSubcategory = false) {
  const map = new Map();
  
  function getGroupKey(catId, subId, fallbackName) {
    if (!catId) return fallbackName || 'Unknown';
    let resolvedCatName = 'Unknown';
    let resolvedSubName = '';
    if (teamCategories) {
      const matchedCat = teamCategories.find(c => c.id === catId);
      if (matchedCat) {
        resolvedCatName = matchedCat.name;
        if (subId && matchedCat.subcategories) {
          const matchedSub = matchedCat.subcategories.find(s => s.id === subId);
          if (matchedSub) resolvedSubName = matchedSub.name;
        }
      }
    }
    if (includeSubcategory) {
      return resolvedCatName + (resolvedSubName ? ` / ${resolvedSubName}` : '');
    } else {
      return resolvedCatName;
    }
  }

  filteredExpenses.forEach(exp => {
    let label;
    let cId = exp.category_id;
    let sId = exp.subcategory_id;
    
    if (!cId) {
      label = getGroupKey(null, null, exp.vendor_info || 'Unknown');
    } else {
      label = getGroupKey(cId, sId, exp.vendor_info);
    }
    
    const prev = map.get(label) || { actual: 0, count: 0 };
    prev.actual += parseFloat(exp.usd_amount) || 0;
    prev.count += 1;
    map.set(label, prev);
  });
  return [...map.entries()]
    .sort((a, b) => b[1].actual - a[1].actual)
    .map(([category, data]) => ({ category, ...data }));
}"""

content = content.replace(old_agg, new_agg)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("reportHelpers.js grouping fixed")
