import os, json, shutil

test_dir = r'C:\Users\dell\Documents\GitHub\KManager-test'
prod_dir = r'C:\Users\dell\Documents\GitHub\KManager'

with open('diff_output.json', 'r') as f:
    data = json.load(f)

changed_files = data.get('changed_files', [])
new_files = data.get('new_in_test', [])

def should_copy(file_path):
    # Ignore root fix scripts
    if '/' not in file_path and '\\' not in file_path:
        if file_path.startswith('fix') or file_path.startswith('check') or file_path.startswith('find'):
            return False
        if file_path.endswith('.cjs') or file_path.endswith('.py') or file_path.endswith('.sql') or file_path.endswith('.ps1'):
            if file_path not in ['vite.config.js']:
                return False
                
    # Ignore build artifacts and temp stuff
    if file_path.startswith('dist/') or file_path.startswith('dist\\'):
        return False
    if file_path.startswith('supabase/.temp'):
        return False
    if file_path in ['.claude', '.opencode', '.xclaude', 'diff_output.json', 'diff.py']:
        return False
        
    return True

to_copy = []
for f in changed_files + new_files:
    if should_copy(f):
        to_copy.append(f)

copied_count = 0
for f in to_copy:
    src = os.path.join(test_dir, f)
    dst = os.path.join(prod_dir, f)
    
    if os.path.isdir(src):
        os.makedirs(dst, exist_ok=True)
    elif os.path.isfile(src):
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(src, dst)
        copied_count += 1
        print(f"Copied: {f}")

print(f"\nTotal files copied: {copied_count}")
