import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\utils\reportPdf.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """  const map = new Map();

  // Helper to resolve category ID and Subcategory ID into a consistent key
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
          if (matchedSub) {
            resolvedSubName = matchedSub.name;
          }
        }
      }
    }
    
    if (includeSubcategory) {
      return resolvedCatName + (resolvedSubName ? ` / ${resolvedSubName}` : '');
    } else {
      return resolvedCatName;
    }
  }

  (budget.categories || []).forEach(cat => {
    // If it's an old budget line with no IDs, try to parse it
    let fallback = cat.category || cat.name;
    let cId = cat.categoryId;
    let sId = cat.subcategoryId;
    
    if (!cId && fallback) {
       // Legacy fallback grouping
       let cName = fallback;
       let sName = cat.subcategory;
       if (fallback.includes(' - ')) {
         const parts = fallback.split(' - ');
         cName = parts[0].trim();
         sName = parts[1].trim();
       } else if (fallback.includes('   ')) {
         const parts = fallback.split('   ');
         cName = parts[0].trim();
         sName = parts[1].trim();
       }
       
       let label = includeSubcategory ? (cName + (sName ? ` / ${sName}` : '')) : cName;
       const prev = map.get(label) || { budgeted: 0, actual: 0 };
       prev.budgeted += parseFloat(cat.usdAmount ?? cat.usd_amount) || 0;
       map.set(label, prev);
       return;
    }
    
    const label = getGroupKey(cId, sId, fallback);
    const prev = map.get(label) || { budgeted: 0, actual: 0 };
    prev.budgeted += parseFloat(cat.usdAmount ?? cat.usd_amount) || 0;
    map.set(label, prev);
  });

  filteredExpenses.forEach(exp => {
    let cId = exp.category_id;
    let sId = exp.subcategory_id;
    
    if (!cId) {
      // Legacy expense without category_id
      const fallback = exp.vendor_info || 'Unknown';
      const label = getGroupKey(null, null, fallback);
      const prev = map.get(label) || { budgeted: 0, actual: 0 };
      prev.actual += parseFloat(exp.usd_amount) || 0;
      map.set(label, prev);
      return;
    }
    
    const label = getGroupKey(cId, sId, exp.vendor_info);
    const prev = map.get(label) || { budgeted: 0, actual: 0 };
    prev.actual += parseFloat(exp.usd_amount) || 0;
    map.set(label, prev);
  });"""

new_logic = """  const map = new Map();

  const flattenedBudgetLines = [];
  (budget.categories || []).forEach(cat => {
     let fallback = cat.category || cat.name;
     let cName = fallback;
     let sName = cat.subcategory;
     if (fallback && fallback.includes(' - ')) {
       const parts = fallback.split(' - ');
       cName = parts[0].trim();
       sName = parts[1].trim();
     } else if (fallback && fallback.includes('   ')) {
       const parts = fallback.split('   ');
       cName = parts[0].trim();
       sName = parts[1].trim();
     }
     
     const items = Array.isArray(cat.items) && cat.items.length > 0 ? cat.items : null;
     const rate = parseFloat(cat.rate ?? cat.localRate ?? 0) || 0;
     const parentUsd = parseFloat(cat.usdAmount ?? cat.usd_amount ?? 0) || 0;
     
     if (items) {
       let itemsUsd = 0;
       items.forEach(item => {
         const itemName = typeof item === 'string' ? item : (item.name || '');
         if (!itemName) return;
         const itemTotal = parseFloat(typeof item === 'object' && item ? (item.total ?? item.usdAmount ?? 0) : 0) || 0;
         const usdAmount = rate > 0 ? itemTotal / rate : (parseFloat(item.usdAmount) || 0);
         const safeUsd = Number.isFinite(usdAmount) ? usdAmount : 0;
         itemsUsd += safeUsd;
         flattenedBudgetLines.push({ cName: cName, sName: itemName, usdAmount: safeUsd });
       });
       const remainder = parentUsd - itemsUsd;
       if (remainder > 0.005) {
         flattenedBudgetLines.push({ cName: cName, sName: null, usdAmount: remainder });
       }
     } else {
       flattenedBudgetLines.push({ cName: cName, sName: sName, usdAmount: parentUsd });
     }
  });

  flattenedBudgetLines.forEach(line => {
    let label = includeSubcategory ? (line.cName + (line.sName ? ` / ${line.sName}` : '')) : line.cName;
    const prev = map.get(label) || { budgeted: 0, actual: 0 };
    prev.budgeted += line.usdAmount;
    map.set(label, prev);
  });

  filteredExpenses.forEach(exp => {
    let cId = exp.category_id;
    let sId = exp.subcategory_id;
    
    let resolvedCat = 'Unknown';
    let resolvedSub = '';
    
    if (cId && teamCategories) {
      const matchedCat = teamCategories.find(c => c.id === cId);
      if (matchedCat) {
        resolvedCat = matchedCat.name;
        if (sId && matchedCat.subcategories) {
          const matchedSub = matchedCat.subcategories.find(s => s.id === sId);
          if (matchedSub) resolvedSub = matchedSub.name;
        }
      }
    } else {
      resolvedCat = exp.vendor_info || 'Unknown';
    }
    
    let label = includeSubcategory ? (resolvedCat + (resolvedSub ? ` / ${resolvedSub}` : '')) : resolvedCat;
    
    const prev = map.get(label) || { budgeted: 0, actual: 0 };
    prev.actual += parseFloat(exp.usd_amount) || 0;
    map.set(label, prev);
  });"""
content = content.replace(old_logic, new_logic)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("reportPdf.js nested budget items flattened")
