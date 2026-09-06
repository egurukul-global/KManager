import sys
import re

file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Modal Report Name default
old_modal = """        <div class="form-group" style="margin-bottom: 15px;">
          <label style="font-weight:bold;">Report Name (Optional)</label>
          <input type="text" id="rptSec_reportName" placeholder="e.g. Q3 Executive Summary" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
        </div>"""

new_modal = """        <div class="form-group" style="margin-bottom: 15px;">
          <label style="font-weight:bold;">Report Name</label>
          <input type="text" id="rptSec_reportName" value="Expense Report" style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
        </div>"""
content = content.replace(old_modal, new_modal)

# 2. Table Headers & Colspan
old_headers = """            <thead>
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

new_headers = """            <thead>
              <tr>
                <th>Date</th>
                <th>Report Name</th>
                <th>Filters</th>
                <th style="text-align:center;">Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody id="reportLogsTableBody">
              <tr><td colspan="5" class="empty-state">Loading logs...</td></tr>"""
content = content.replace(old_headers, new_headers)

# 3. Empty states colspan fixes
content = content.replace('<tr><td colspan="6" style="text-align:center;color:red;">Error loading logs</td></tr>', '<tr><td colspan="5" style="text-align:center;color:red;">Error loading logs</td></tr>')
content = content.replace('<tr><td colspan="6" style="text-align:center;">No reports found.</td></tr>', '<tr><td colspan="5" style="text-align:center;">No reports found.</td></tr>')
content = content.replace('<tr><td colspan="6" style="text-align:center;">No reports found matching criteria.</td></tr>', '<tr><td colspan="5" style="text-align:center;">No reports found matching criteria.</td></tr>')


# 4. Row Renderer
old_row_renderer = """  tbody.innerHTML = filteredLogs.map(log => {
    let statusPill = '';
    if (log.status === 'completed') statusPill = '<span class="status-pill success">Completed</span>';
    else if (log.status === 'failed') statusPill = '<span class="status-pill danger">Failed</span>';
    else statusPill = '<span class="status-pill info">Running...</span>';
    
    let actions = '';
    if (log.status === 'completed' && log.file_url) {
      actions = `<button class="primary small" onclick="window.downloadReportPdf('${log.file_url}')">PDF</button>
                 <button class="secondary small" onclick="window.downloadReportCsv('${log.id}')">CSV</button>
                 <button class="danger small" style="margin-left:8px; padding: 2px 6px;" title="Delete" onclick="window.deleteReportLog('${log.id}')">&times;</button>`;
    } else if (log.status === 'in_progress') {
      actions = `<button class="danger small" onclick="window.cancelReportLog('${log.id}')">Cancel</button>`;
    } else {
      actions = `<button class="danger small" style="margin-left:8px; padding: 2px 6px;" title="Delete" onclick="window.deleteReportLog('${log.id}')">&times;</button>`;
    }
    
    const d = new Date(log.created_at).toLocaleString();
    return `<tr>
      <td style="white-space: nowrap;">${d}</td>
      <td><strong>${log._rName || '-'}</strong></td>
      <td style="font-size: 0.85em; color: #555;">${log._filterDesc}</td>
      <td>${statusPill}</td>
      <td style="font-size: 0.85em; color: #d9534f; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${log.error_message || ''}">${log.error_message || ''}</td>
      <td style="white-space: nowrap; display:flex; gap:4px;">${actions}</td>
    </tr>`;
  }).join('');"""

new_row_renderer = """  tbody.innerHTML = filteredLogs.map(log => {
    let statusPill = '';
    if (log.status === 'completed') statusPill = '<span style="color:var(--success); font-size:1.2rem; font-weight:bold;" title="Completed">&#10003;</span>';
    else if (log.status === 'failed') statusPill = `<span style="color:var(--danger); font-size:1.2rem; font-weight:bold; cursor:help;" title="${log.error_message || 'Failed'}">&#10068;</span>`;
    else statusPill = '<span style="color:var(--info); font-size:1.2rem; font-weight:bold;" title="Running...">&#8987;</span>';
    
    let actions = '';
    if (log.status === 'completed' && log.file_url) {
      actions = `<button class="primary small" onclick="window.downloadReportPdf('${log.file_url}')">PDF</button>
                 <button class="secondary small" onclick="window.downloadReportCsv('${log.id}')">CSV</button>
                 <button class="danger small" style="margin-left:8px; padding: 2px 6px;" title="Delete" onclick="window.deleteReportLog('${log.id}')">&times;</button>`;
    } else if (log.status === 'in_progress') {
      actions = `<button class="danger small" onclick="window.cancelReportLog('${log.id}')">Cancel</button>`;
    } else {
      actions = `<button class="danger small" style="margin-left:8px; padding: 2px 6px;" title="Delete" onclick="window.deleteReportLog('${log.id}')">&times;</button>`;
    }
    
    const d = new Date(log.created_at).toLocaleString();
    return `<tr>
      <td style="white-space: nowrap;">${d}</td>
      <td><strong>${log._rName || '-'}</strong></td>
      <td style="font-size: 0.85em; color: #555;">${log._filterDesc}</td>
      <td style="text-align:center;">${statusPill}</td>
      <td style="white-space: nowrap; display:flex; gap:4px;">${actions}</td>
    </tr>`;
  }).join('');"""
content = content.replace(old_row_renderer, new_row_renderer)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("expense-reports.js cleanup applied")
