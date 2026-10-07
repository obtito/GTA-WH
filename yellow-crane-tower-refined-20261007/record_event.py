from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import json,sys
ROOT=Path(__file__).resolve().parent
def record(phase,**data):
    p=ROOT/'timeline.json';doc=json.loads(p.read_text())
    now=datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds')
    row={'at':now,'phase':phase,**data};doc['events'].append(row)
    doc['updated_at']=now
    p.write_text(json.dumps(doc,ensure_ascii=False,indent=2));print(json.dumps(row,ensure_ascii=False),flush=True)
if __name__=='__main__':record(sys.argv[1])
