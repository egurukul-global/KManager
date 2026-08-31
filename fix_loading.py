import re

with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_text = r"select\.innerHTML = '<option value=\"\">Loading users\.\.\.</option>';"
new_text = r"select.innerHTML = '<option value=\"\">Loading users... (Wait)</option>';\n    setTimeout(() => { if(select.innerHTML.includes('Wait')) select.innerHTML = '<option value=\"\">Timeout! ' + (typeof supabaseClient !== 'undefined' ? 'Supabase OK' : 'No Supabase') + '</option>'; }, 2000);"

content = re.sub(old_text, new_text, content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Timeout added")
