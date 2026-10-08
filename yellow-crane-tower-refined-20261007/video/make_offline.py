#!/usr/bin/env python3
"""Package local, editable animation as a double-clickable single HTML file."""
from pathlib import Path
import base64,json,re,hashlib
HERE=Path(__file__).resolve().parent;ROOT=HERE.parent
def data(path,mime):return 'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode()
html=(HERE/'continuous.html').read_text()
html=re.sub(r'<script type="importmap">.*?</script>','',html,flags=re.S)
html=html.replace('<script type="module" src="./continuous.mjs"></script>','')
for p in (ROOT/'references').glob('*.jpg'):html=html.replace('../references/'+p.name,data(p,'image/jpeg'))
module_paths={'core':'vendor/package/build/three.core.js','three':'vendor/package/build/three.module.js','utils':'vendor/package/examples/jsm/utils/BufferGeometryUtils.js','loader':'vendor/package/examples/jsm/loaders/GLTFLoader.js','main':'continuous.mjs'}
modules={k:(HERE/v).read_text() for k,v in module_paths.items()}
assets={k:data(ROOT/'assets'/f'{k}.glb','model/gltf-binary') for k in ['baseline','refined']}
timeline=json.loads((ROOT/'timeline.json').read_text())
bootstrap='window.EMBEDDED_BASELINE='+json.dumps(assets['baseline'])+';\nwindow.EMBEDDED_REFINED='+json.dumps(assets['refined'])+';\nwindow.EMBEDDED_TIMELINE='+json.dumps(timeline,ensure_ascii=False)+';\nconst sources='+json.dumps(modules,ensure_ascii=False)+';\n'+r'''
const blob=source=>URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
const core=blob(sources.core);
const three=blob(sources.three.replaceAll('./three.core.js',core));
const utils=blob(sources.utils);
const loader=blob(sources.loader.replaceAll('../utils/BufferGeometryUtils.js',utils));
const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports:{'three':three,'three/addons/loaders/GLTFLoader.js':loader}});document.head.appendChild(map);
const entry=document.createElement('script');entry.type='module';entry.src=blob(sources.main);document.body.appendChild(entry);
'''
html=html.replace('</body>','<script>'+bootstrap.replace('</script>','<\\/script>')+'</script></body>')
output=HERE/'连续旋转优化回放_离线.html';output.write_text(html)
manifest={'output':str(output),'bytes':output.stat().st_size,'runtime':'Three.js 0.180.0; all modules and images embedded','assets':{k:hashlib.sha256((ROOT/'assets'/f'{k}.glb').read_bytes()).hexdigest() for k in assets},'timeline':timeline}
(HERE/'offline-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print(output)
