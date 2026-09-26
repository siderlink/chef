import json

with open('C:/Users/computer/.gemini/antigravity-ide/brain/425f7e8f-57e7-4d73-9d43-ab44d23a8467/.system_generated/logs/transcript.jsonl', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for line in lines[-20:]:
    if not line.strip(): continue
    try:
        obj = json.loads(line)
        if obj.get('source') == 'MODEL' and obj.get('content'):
            print(obj['content'][:500])
    except:
        pass
