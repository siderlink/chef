import json

with open('C:/Users/computer/.gemini/antigravity-ide/brain/425f7e8f-57e7-4d73-9d43-ab44d23a8467/.system_generated/logs/transcript.jsonl', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for line in lines[-50:]:
    if not line.strip(): continue
    try:
        obj = json.loads(line)
        if obj.get('source') == 'SYSTEM' and 'TaskName: Check Browser Console Errors' in obj.get('content', ''):
            print("Found Subagent Output:", obj['content'])
            break
    except Exception as e:
        pass
else:
    print("Not found yet")
