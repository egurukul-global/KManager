import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\utils\reportPdf.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """  const map = new Map();

  (budget.categories || []).forEach(cat => {
    let catName = cat.category || cat.name;
    let subName = cat.subcategory;
    
    // Always prefer IDs if available (new category system)
    if (cat.categoryId && teamCategories) {
      const matchedCat = teamCategories.find(c => c.id === cat.categoryId);
      if (matchedCat) {
        catName = matchedCat.name;
        if (cat.subcategoryId && matchedCat.subcategories) {
          const matchedSub = matchedCat.subcategories.find(s => s.id === cat.subcategoryId);
          if (matchedSub) {
            subName = matchedSub.name;
          } else {
            subName = undefined; // Subcategory might have been deleted/changed, but id doesn't match
          }
        } else {
          subName = undefined; // No subcategory ID
        }
      }
    }
    
    // Also handle case where it's an old string with ' - '
    if (catName && !subName && catName.includes(' - ')) {
      const parts = catName.split(' - ');
      catName = parts[0].trim();
      subName = parts[1].trim();
    }
    // And '   '
    if (catName && !subName && catName.includes('   ')) {
      const parts = catName.split('   ');
      catName = parts[0].trim();
      subName = parts[1].trim();
    }
    
    if (!catName) catName = 'Unknown';
    
    let label;
    if (includeSubcategory) {
      label = catName + (subName ? ` / ${subName}` : '');
    } else {
      label = catName;
    }
    
    const prev = map.get(label) || { budgeted: 0, actual: 0 };
    prev.budgeted += parseFloat(cat.usdAmount ?? cat.usd_amount) || 0;
    map.set(label, prev);
  });

  filteredExpenses.forEach(exp => {
    let label;
    if (includeSubcategory) {
      const fullLabel = getExpenseCategoryLabel(exp, teamCategories);
      label = fullLabel.replace(' → ', ' / ');
    } else {
      if (exp.category_id && teamCategories) {
        const cat = teamCategories.find(c => c.id === exp.category_id);
        label = cat ? cat.name : (exp.vendor_info || 'Unknown');
      } else {
        label = exp.vendor_info || 'Unknown';
      }
    }
    const prev = map.get(label) || { budgeted: 0, actual: 0 };
    prev.actual += parseFloat(exp.usd_amount) || 0;
    map.set(label, prev);
  });

  [...map.entries()].sort((a,b) => a[0].localeCompare(b[0])).forEach(([label, data]) => {"""

new_logic = """  const map = new Map();

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
  });

  [...map.entries()].sort((a,b) => a[0].localeCompare(b[0])).forEach(([label, data]) => {"""
content = content.replace(old_logic, new_logic)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("reportPdf.js grouping fixed")
