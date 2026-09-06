import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\utils\reportPdf.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_logic = """  (budget.categories || []).forEach(cat => {
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
    
    if (!catName) catName = 'Unknown';"""

new_logic = """  (budget.categories || []).forEach(cat => {
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
    
    if (!catName) catName = 'Unknown';"""
content = content.replace(old_logic, new_logic)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("reportPdf.js budget category lookup fixed")
