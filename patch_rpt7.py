import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\utils\reportPdf.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_catPerf = """  (budget.categories || []).forEach(cat => {
    let label;
    if (includeSubcategory) {
      label = (cat.category || cat.name) + (cat.subcategory ? ` / ${cat.subcategory}` : '');
    } else {
      label = cat.category || cat.name;
    }
    const prev = map.get(label) || { budgeted: 0, actual: 0 };
    prev.budgeted += parseFloat(cat.usdAmount ?? cat.usd_amount) || 0;
    map.set(label, prev);
  });"""

new_catPerf = """  (budget.categories || []).forEach(cat => {
    let catName = cat.category || cat.name;
    let subName = cat.subcategory;
    
    // If we only have IDs, look up the names in teamCategories
    if (!catName && cat.categoryId && teamCategories) {
      const matchedCat = teamCategories.find(c => c.id === cat.categoryId);
      if (matchedCat) {
        catName = matchedCat.name;
        if (cat.subcategoryId && matchedCat.subcategories) {
          const matchedSub = matchedCat.subcategories.find(s => s.id === cat.subcategoryId);
          if (matchedSub) subName = matchedSub.name;
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
  });"""

content = content.replace(old_catPerf, new_catPerf)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("reportPdf.js budget category lookup patched")
