with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

expose_block = """  // Expose functions to window
  window.openBucketModal = openBucketModal;
  window.toggleShowDeletedBuckets = toggleShowDeletedBuckets;
  window.saveBucket = saveBucket;
  window.loadBucketForEdit = loadBucketForEdit;
  window.confirmDeleteBucket = confirmDeleteBucket;
  window.restoreBucket = restoreBucket;"""

content = content.replace(expose_block, "")

# Insert it at the top of initBucketsPage
init_marker = "export async function initBucketsPage() {"
content = content.replace(init_marker, init_marker + "\n" + expose_block)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Expose block moved to top")
