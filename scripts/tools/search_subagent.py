import json
import os

transcript_path = 'C:/Users/computer/.gemini/antigravity-ide/brain/425f7e8f-57e7-4d73-9d43-ab44d23a8467/.system_generated/logs/transcript.jsonl'
with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        if 'browser_subagent' in line:
            obj = json.loads(line)
            if 'browser_subagent' in obj.get('content', ''):
                print(obj['content'][:500])
