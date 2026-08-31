import json

transcript_path = r'C:\Users\dell\.gemini\antigravity\brain\99d4fcbb-fee3-4d00-89b9-02233394336e\.system_generated\logs\transcript_full.jsonl'

found_content = []

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            if data.get('type') == 'GENERIC':
                output = data.get('content', '')
                if 'File Path: `file:///c:/Users/dell/Documents/GitHub/KManager-test/src/pages/transfer.js`' in output:
                    if 'Showing lines 1 to 800' in output:
                        found_content.append(output)
        except:
            pass

if not found_content:
    print('Could not find view_file for transfer.js')
    exit(1)

content = found_content[0]

# Extract the lines
lines = content.split('\n')
original_lines = []
start_parsing = False
for line in lines:
    if line.startswith('1: '):
        start_parsing = True
    
    if start_parsing:
        if line.startswith('The above content does NOT show'):
            break
        # strip the line number and colon
        idx = line.find(': ')
        if idx != -1 and line[:idx].isdigit():
            original_lines.append(line[idx+2:])
        else:
            original_lines.append(line)

with open('src/pages/transfer_restored.js', 'w', encoding='utf-8') as f:
    f.write('\n'.join(original_lines))

print('Restored transfer.js to', len(original_lines), 'lines')
