import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if "const filterDesc = Object.entries(log.filters || {}).filter(([k,v])=>v).map(([k,v])=>{" in line:
        skip = True
        
    if skip:
        if "    </tr>`;" in line:
            skip = False
            # Insert the new block
            new_lines.append("""    return `<tr>
      <td style="white-space: nowrap;">${d}</td>
      <td><strong>${log._rName || '—'}</strong></td>
      <td style="font-size: 0.85em; color: #555;">${log._filterDesc}</td>
      <td>${statusPill}</td>
      <td style="font-size: 0.85em; color: #d9534f; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.error_message || ''}">${log.error_message || ''}</td>
      <td style="white-space: nowrap; display:flex; gap:4px;">${actions}</td>
    </tr>`;\n""")
        continue
        
    new_lines.append(line)

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("expense-reports.js row HTML fixed")
