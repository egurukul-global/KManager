import os, filecmp, json

d1 = r'C:\Users\dell\Documents\GitHub\KManager'
d2 = r'C:\Users\dell\Documents\GitHub\KManager-test'

diffs = []
right_only = []
left_only = []

def comp(dcmp, path=""):
    for f in dcmp.diff_files:
        diffs.append(os.path.join(path, f).replace('\\', '/'))
    for f in dcmp.right_only:
        right_only.append(os.path.join(path, f).replace('\\', '/'))
    for f in dcmp.left_only:
        left_only.append(os.path.join(path, f).replace('\\', '/'))
        
    for subdir, sub_dcmp in dcmp.subdirs.items():
        comp(sub_dcmp, os.path.join(path, subdir))

dcmp = filecmp.dircmp(d1, d2, ignore=['node_modules', '.git', '.agents', 'graphify-out', 'scratch', 'sql', 'tests'])
comp(dcmp)

out = {
    'changed_files': diffs,
    'new_in_test': right_only,
    'removed_in_test': left_only
}

with open('diff_output.json', 'w') as f:
    json.dump(out, f, indent=2)
