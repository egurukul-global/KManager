with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """    document.getElementById('bucketName').value = bucket.name;
    document.getElementById('bucketType').value = bucket.type;
    document.getElementById('bucketCurrency').value = bucket.currency;
    document.getElementById('bucketBalance').value = bucket.balance;
    const personalEl = document.getElementById('bucketPersonal');
    if (personalEl) {
      personalEl.checked = bucket.owner_user_id === state.user?.id;
    }"""

new_block = """    document.getElementById('bucketName').value = bucket.name;
    document.getElementById('bucketType').value = bucket.type;
    document.getElementById('bucketCurrency').value = bucket.currency;
    document.getElementById('bucketBalance').value = bucket.balance;
    const personalEl = document.getElementById('bucketPersonal');
    if (personalEl) {
      personalEl.checked = bucket.owner_user_id === state.user?.id;
    }
    const modalEl = document.getElementById('bucketModal');
    if (modalEl) {
      if (bucket.is_org_level) {
        modalEl.dataset.isOrg = 'true';
      } else {
        delete modalEl.dataset.isOrg;
      }
    }"""

content = content.replace(old_block, new_block)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added dataset.isOrg to loadBucketData")
