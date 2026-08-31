with open('src/pages/buckets.js', 'r', encoding='utf-8') as f:
    content = f.read()

import_statement = "import { isFinanceGlobalAdmin } from '../utils/appRoles.js';\nimport { state } from '../state.js';"
content = content.replace("import { state } from '../state.js';", import_statement)

with open('src/pages/buckets.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Import fixed")
