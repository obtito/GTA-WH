from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from scene_tools import *
from record_event import record
setup_studio()
if '--render-only' not in sys.argv:export_asset(ROOT/'assets'/'baseline.glb')
seconds=render(ROOT/'stages'/'before.png',percent=70)
record('V1同机位基线导出完成',render_seconds=seconds)
