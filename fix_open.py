with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

old = """      if (select && select.innerHTML.includes('Step 8')) select.innerHTML = '<option value="">Step 9: filter \nfinished</option>';\n    } catch (err) {"""
# The line breaks might be weird. I'll just use a safer regex.
import re
content = re.sub(r"if \(select && select\.innerHTML\.includes\('Step 8'\)\) select\.innerHTML = '[^']+';\s*\} catch \(err\) \{", r"if (select && select.innerHTML.includes('Step 8')) select.innerHTML = '<option value=\"\">Step 9: filter finished</option>';\n      window.renderAssignedUsers();\n    } catch (err) {", content)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added render call")
