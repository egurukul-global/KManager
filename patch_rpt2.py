import sys
file_path = r'C:\Users\dell\Documents\GitHub\KManager-test\src\pages\expense-reports.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_th = """              <tr>
                <th>Date Generated</th>
                <th>Budget</th>
                <th>Status</th>
                <th>Action</th>
              </tr>"""

new_th = """              <tr>
                <th>Date Generated</th>
                <th>Filters</th>
                <th>Status</th>
                <th>Errors</th>
                <th>Action</th>
              </tr>"""

content = content.replace(old_th, new_th)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("expense-reports.js table header fixed")
