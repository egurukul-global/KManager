import sys

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Table Headers
old_headers = """            <thead>
              <tr>
                <th>Date Generated</th>
                <th>Filters</th>
                <th>Status</th>
                <th>Errors</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="reportLogsTableBody">
              <tr><td colspan="4" class="empty-state">Loading logs...</td></tr>"""

new_headers = """            <thead>
              <tr>
                <th>Date</th>
                <th>Report Name</th>
                <th>Filters</th>
                <th>Status</th>
                <th>Errors</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="reportLogsTableBody">
              <tr><td colspan="6" class="empty-state">Loading logs...</td></tr>"""
content = content.replace(old_headers, new_headers)

# 2. Update Table Rows
old_row = """    const d = new Date(log.created_at).toLocaleString();
    let nameHtml = log._rName ? `<strong>${log._rName}</strong><br>` : '';
    return `<tr>
      <td>${d}</td>
      <td>${statusPill}</td>
      <td style="font-size: 0.85em; color: #555;">${nameHtml}${log._filterDesc}</td>
      <td style="font-size: 0.85em; color: #d9534f; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.error_message || ''}">${log.error_message || ''}</td>
      <td>${actions}</td>
    </tr>`;"""

new_row = """    const d = new Date(log.created_at).toLocaleString();
    return `<tr>
      <td style="white-space: nowrap;">${d}</td>
      <td><strong>${log._rName || '—'}</strong></td>
      <td style="font-size: 0.85em; color: #555;">${log._filterDesc}</td>
      <td>${statusPill}</td>
      <td style="font-size: 0.85em; color: #d9534f; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.error_message || ''}">${log.error_message || ''}</td>
      <td style="white-space: nowrap;">${actions}</td>
    </tr>`;"""
content = content.replace(old_row, new_row)

# 3. Update empty states
old_empty1 = """    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:red;">Error loading logs</td></tr>';"""
new_empty1 = """    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:red;">Error loading logs</td></tr>';"""
content = content.replace(old_empty1, new_empty1)

old_empty2 = """    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No reports found.</td></tr>';"""
new_empty2 = """    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No reports found.</td></tr>';"""
content = content.replace(old_empty2, new_empty2)

old_empty3 = """    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No reports found matching criteria.</td></tr>';"""
new_empty3 = """    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No reports found matching criteria.</td></tr>';"""
content = content.replace(old_empty3, new_empty3)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("expense-reports.js columns fixed")
