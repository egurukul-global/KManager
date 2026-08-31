with open('src/utils/navPermissions.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("return ['admin', 'caoh', 'oh', 'ceo'].includes(state.user?.role);", "return ['admin', 'caoh', 'oh', 'ceo', 'fih'].includes(state.user?.role);")
content = content.replace("if (!['admin', 'oh', 'caoh'].includes(role)) hide = true;", "if (!['admin', 'oh', 'caoh', 'fih'].includes(role)) hide = true;")

with open('src/utils/navPermissions.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("FIH added to admin checks")
