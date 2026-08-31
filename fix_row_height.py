with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Reduce padding from 4px to 2px, and font-size from 0.85em to 0.8em
old_render = """<table style="width:100%; border-collapse: collapse; text-align: left; font-size: 0.85em;">
      <thead>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.2);">
          <th style="padding: 4px;">User</th>
          <th style="padding: 4px; text-align: center;">View Balance</th>
          <th style="padding: 4px; text-align: center;">Can Transfer</th>
          <th style="padding: 4px; text-align: center;">Save</th>
          <th style="padding: 4px; text-align: center;">Delete</th>
        </tr>
      </thead>
      <tbody>
        ${assigned.map(u => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 4px;">${escapeHtml(u.name || u.email)} <small style="color:#aaa;">(${escapeHtml(String(u.role).toUpperCase())})</small></td>
            <td style="padding: 4px; text-align: center;"><input type="checkbox" id="chk_view_${u.id}" ${u.can_view_balance ? 'checked' : ''} /></td>
            <td style="padding: 4px; text-align: center;"><input type="checkbox" id="chk_trans_${u.id}" ${u.can_transfer ? 'checked' : ''} /></td>
            <td style="padding: 4px; text-align: center;">
              <button onclick="window.saveRowAccess('${u.id}')" title="Save" style="background: none; border: none; color: #48bb78; cursor: pointer; font-size: 1.2em;"><i class="fas fa-check-square"></i></button>
            </td>
            <td style="padding: 4px; text-align: center;">
              <button onclick="window.removeRowAccess('${u.id}')" title="Remove" style="background: none; border: none; color: #f56565; cursor: pointer; font-size: 1.2em;"><i class="fas fa-times"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>"""

new_render = """<table style="width:100%; border-collapse: collapse; text-align: left; font-size: 0.8em;">
      <thead>
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.2);">
          <th style="padding: 2px;">User</th>
          <th style="padding: 2px; text-align: center;">View Balance</th>
          <th style="padding: 2px; text-align: center;">Can Transfer</th>
          <th style="padding: 2px; text-align: center;">Save</th>
          <th style="padding: 2px; text-align: center;">Delete</th>
        </tr>
      </thead>
      <tbody>
        ${assigned.map(u => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); height: 24px;">
            <td style="padding: 2px; margin: 0;">${escapeHtml(u.name || u.email)} <small style="color:#aaa;">(${escapeHtml(String(u.role).toUpperCase())})</small></td>
            <td style="padding: 2px; text-align: center; margin: 0;"><input type="checkbox" id="chk_view_${u.id}" ${u.can_view_balance ? 'checked' : ''} style="transform: scale(0.85); margin: 0;" /></td>
            <td style="padding: 2px; text-align: center; margin: 0;"><input type="checkbox" id="chk_trans_${u.id}" ${u.can_transfer ? 'checked' : ''} style="transform: scale(0.85); margin: 0;" /></td>
            <td style="padding: 2px; text-align: center; margin: 0;">
              <button onclick="window.saveRowAccess('${u.id}')" title="Save" style="background: none; border: none; color: #48bb78; cursor: pointer; font-size: 1.1em; padding: 0;"><i class="fas fa-check-square"></i></button>
            </td>
            <td style="padding: 2px; text-align: center; margin: 0;">
              <button onclick="window.removeRowAccess('${u.id}')" title="Remove" style="background: none; border: none; color: #f56565; cursor: pointer; font-size: 1.1em; padding: 0;"><i class="fas fa-times"></i></button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>"""

content = content.replace(old_render, new_render)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Row height reduced")
