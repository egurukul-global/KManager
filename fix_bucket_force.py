with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "class=\"badge badge-info\">${bucket.currency"
end_marker = "${canDelete ? btnIconDelete"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx != -1 and end_idx != -1:
    new_html = """class="badge badge-info">${bucket.currency || '???'}</span>
              ${canEdit ? `<button type="button" class="btn-icon" onclick="window.loadBucketForEdit('${bucket.id}')" title="Edit Bucket" aria-label="Edit Bucket" style="background: none; border: none; color: #48bb78; cursor: pointer; font-size: 1.1em; padding: 4px;"><i class="fas fa-check-square"></i></button>` : ''}
              ${bucket.is_org_level && isFinanceGlobalAdmin() ? `<button type="button" class="btn-icon" onclick="window.openAssignUsersModal('${bucket.id}', '${safeName}')" title="Assign Users" aria-label="Assign Users" style="background: #3b82f6; border: none; color: white; cursor: pointer; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 0.9em; margin-right: 8px;"><i class="fas fa-plus"></i></button>` : ''}
              """
    content = content[:start_idx] + new_html + content[end_idx:]
    with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced Users text with blue button")
else:
    print(f"Could not find markers! start={start_idx}, end={end_idx}")
