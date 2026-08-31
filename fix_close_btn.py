with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_box = """                <div style="display: flex; gap: 8px;">
                  <button type="button" class="sq-btn primary" style="padding: 4px 12px; font-size: 0.85em;" onclick="window.saveBucketAccess()">+ Assign</button>
                </div>
              </div>
            </div>
          </div>
          
          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px;">
            <button type="button" class="sq-btn secondary" style="padding: 6px 16px; font-size: 0.9em;" onclick="document.getElementById('assignUsersModal').classList.remove('active')">Close</button>
          </div>"""

new_box = """                <div style="display: flex; gap: 8px;">
                  <button type="button" class="sq-btn primary" style="padding: 4px 12px; font-size: 0.85em;" onclick="window.saveBucketAccess()">+ Assign</button>
                  <button type="button" class="sq-btn secondary" style="padding: 4px 12px; font-size: 0.85em;" onclick="document.getElementById('assignUsersModal').classList.remove('active')">Close</button>
                </div>
              </div>
            </div>
          </div>"""

content = content.replace(old_box, new_box)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Close button moved")
