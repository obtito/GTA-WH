import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const W=1920,H=1080,FPS=24,DURATION=45;
const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const mix=(a,b,t)=>a+(b-a)*t;
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);if(query.has('capture'))document.body.classList.add('capture');
const renderer=new THREE.WebGLRenderer({canvas:$('view'),antialias:true,preserveDrawingBuffer:true,alpha:false});
renderer.setSize(W,H);renderer.setPixelRatio(1);renderer.setClearColor('#eae7de');renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const scene=new THREE.Scene();scene.background=new THREE.Color('#eae7de');
scene.add(new THREE.HemisphereLight('#fffaf0','#b5b7a4',2.4));
const sun=new THREE.DirectionalLight('#fff0d6',3.2);sun.position.set(-40,70,60);scene.add(sun);
const fill=new THREE.DirectionalLight('#d6e6f2',1.5);fill.position.set(50,25,-35);scene.add(fill);
const camera=new THREE.OrthographicCamera(-70,70,40,-40,.1,500);camera.position.set(0,53,120);camera.lookAt(0,25,0);
const main=new THREE.Group(),left=new THREE.Group();scene.add(main,left);
const materialMap=new Map();const report={fps:FPS,duration:DURATION,frame_count:FPS*DURATION,trajectory:'monotonic yaw; same angle for before/after; no pingpong or repeated frame loop',interpolation:'semantic group center/extent interpolation; material color blending; smooth opacity transition for different topology; no vertex-correspondence claim',groups:[]};
function semantic(o){let c=o;while(c){if(c.userData.semantic_group)return c.userData.semantic_group;c=c.parent;}const n=o.name;if(/Floor_0([1-5])/.test(n))return 'floor_0'+n.match(/Floor_0([1-5])/)[1];if(/0([1-5])_Roof/.test(n))return 'roof_0'+n.match(/0([1-5])_Roof/)[1];if(/Crown|crown|06_/.test(n))return 'crown';if(/Base|base|00_/.test(n))return 'base';if(/Plaque|plaque|匾|黄鹤|黃鶴/.test(n))return 'plaque';return 'detail';}
function flatten(root){root.updateMatrixWorld(true);const groups=new Map();root.traverse(o=>{if(!o.isMesh)return;const key=semantic(o);if(!groups.has(key))groups.set(key,new THREE.Group());const geo=o.geometry.clone();geo.applyMatrix4(o.matrixWorld);const mats=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{let r=m.clone();r.side=THREE.DoubleSide;r.transparent=false;r.opacity=1;r.userData.origColor=r.color?.clone();r.userData.origRoughness=r.roughness;r.userData.origMetalness=r.metalness;return r;});const mesh=new THREE.Mesh(geo,Array.isArray(o.material)?mats:mats[0]);mesh.name=o.name;mesh.frustumCulled=false;groups.get(key).add(mesh);});for(const [key,g]of groups){const b=new THREE.Box3().setFromObject(g);const c=b.getCenter(new THREE.Vector3()),s=b.getSize(new THREE.Vector3());g.children.forEach(m=>m.geometry.translate(-c.x,-c.y,-c.z));g.position.copy(c);g.userData={center:c,size:s,key};}return groups;}
function setAlpha(g,a){g.visible=a>.0001;g.traverse(o=>{if(!o.isMesh)return;for(const m of (Array.isArray(o.material)?o.material:[o.material])){m.opacity=a;m.transparent=a<.9999;m.depthWrite=a>.9999;}});}
function cloneGroups(groups){const out=new THREE.Group();for(const [,g]of groups){const cg=g.clone(true);cg.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone()});out.add(cg);}return out;}
function phaseWindow(key){if(key==='base'||key.startsWith('floor'))return [4,14];if(key.startsWith('roof'))return [10,22];if(key==='crown')return [17,27];return [22,29];}
const loader=new GLTFLoader();
try{
const baselineURI=window.EMBEDDED_BASELINE||'../assets/baseline.glb',refinedURI=window.EMBEDDED_REFINED||'../assets/refined.glb';
const [bl,fl]=await Promise.all([loader.loadAsync(baselineURI),loader.loadAsync(query.has('baselineOnly')?baselineURI:refinedURI)]);
const before=flatten(bl.scene),after=flatten(fl.scene);const original=cloneGroups(before);left.add(original);
for(const [key,g]of before){main.add(g);g.userData.target=after.get(key);}
for(const [key,g]of after){main.add(g);for(const m of g.children){for(const mat of(Array.isArray(m.material)?m.material:[m.material]))materialMap.set(mat.name,mat);}}
const allkeys=new Set([...before.keys(),...after.keys()]);for(const key of allkeys){let a=before.get(key),b=after.get(key);report.groups.push({key,before_meshes:a?.children.length||0,after_meshes:b?.children.length||0,before_bounds:a?{center:a.userData.center.toArray(),size:a.userData.size.toArray()}:null,after_bounds:b?{center:b.userData.center.toArray(),size:b.userData.size.toArray()}:null,window:phaseWindow(key)});}
const totalBounds=new THREE.Box3();for(const g of after.values())totalBounds.union(new THREE.Box3().setFromObject(g));const maxHeight=totalBounds.max.y;const floorY=Math.min(totalBounds.min.y,new THREE.Box3().setFromObject(original).min.y);
// Contact-disc grounding remains stable and never crosses model geometry.
const disc=new THREE.Mesh(new THREE.CircleGeometry(32,96),new THREE.MeshBasicMaterial({color:'#dedbcf',transparent:true,opacity:.7,depthWrite:false}));disc.rotation.x=-Math.PI/2;disc.position.y=floorY-.15;main.add(disc);const disc2=disc.clone();disc2.material=disc.material.clone();left.add(disc2);
let timeline=window.EMBEDDED_TIMELINE||{};if(!window.EMBEDDED_TIMELINE)try{timeline=await(await fetch('../timeline.json')).json()}catch{};
const events=(timeline.events||[]).filter(e=>e.at);const started=timeline.started_at;const ended=timeline.completed_at||timeline.model_completed_at||events.at(-1)?.at;const diff=started&&ended?Math.max(0,(Date.parse(ended)-Date.parse(started))/1000):null;
const fmt=seconds=>`${Math.floor(seconds/3600)}小时${Math.floor(seconds%3600/60)}分${Math.round(seconds%60)}秒`;
const shownTime=diff!==null?`已记录优化用时：${fmt(diff)}\n计时截至 ${new Date(ended).toLocaleTimeString('zh-CN',{hour12:false,timeZone:'Asia/Shanghai'})}（北京时间）`:'优化用时：以交付记录 timeline.json 为准';
$('time').textContent=shownTime;report.timing_snapshot={started_at:started,as_of:ended,elapsed_seconds:diff};
const phaseText=[['01 / STRUCTURE','体量与层级','首层、中段与顶层整体重排\n保持廊柱与檐层联动\n持续旋转观察空间关系'],['02 / ROOFLINE','檐线与屋面','屋面宽度、层级与起翘渐变\n保留连续建筑轮廓\n逐步转入新版本几何'],['03 / CROWN','重构冠顶','四向抱厦与主脊关系\n调整冠顶部件的比例\n恢复整体屋顶层次'],['04 / FINISH','材质与细部','瓦面、栏杆与构件色彩\n匾额与建筑细部更新\n呈现照片参照优化结果']];
function renderAt(t){t=Math.max(0,Math.min(DURATION-1/FPS,t));const split=smooth((t-29)/2);const intro=1-smooth((t-3.0)/1.0);const yaw=.55+t*.17; // >360 degrees over the film, strictly increasing.
for(const key of allkeys){const a=before.get(key),b=after.get(key),[start,end]=phaseWindow(key),p=smooth((t-start)/(end-start));if(a&&b){const ca=a.userData.center,cb=b.userData.center,sa=a.userData.size,sb=b.userData.size;const coherentMove=smooth((t-4)/10);const c=ca.clone().lerp(cb,coherentMove);const s=sa.clone().lerp(sb,coherentMove);for(const g of [a,b]){const os=g.userData.size;g.position.copy(c);g.scale.set(s.x/Math.max(.001,os.x),s.y/Math.max(.001,os.y),s.z/Math.max(.001,os.z));}const blend=smooth((p-.56)/.35);setAlpha(a,1-blend);setAlpha(b,blend);a.traverse(o=>{if(!o.isMesh)return;for(const m of(Array.isArray(o.material)?o.material:[o.material])){const target=materialMap.get(m.name);if(m.color&&target?.color)m.color.copy(m.userData.origColor).lerp(target.color,p);}});}else if(a)setAlpha(a,1-p);else if(b)setAlpha(b,p);}
main.rotation.y=yaw;left.rotation.y=yaw;main.position.x=mix(14,29,split)+intro*21;left.position.x=-29;main.position.y=6;left.position.y=6;const sc=mix(.82,.70,split);main.scale.setScalar(sc);left.scale.setScalar(.70);left.visible=split>.001;setAlpha(original,split);disc2.material.opacity=split*.7;
const halfH=Math.max(38,maxHeight*.64);camera.left=-halfH*W/H;camera.right=halfH*W/H;camera.top=halfH;camera.bottom=-halfH;camera.position.set(0,maxHeight*.55+30,130);camera.lookAt(0,maxHeight*.48,0);camera.updateProjectionMatrix();renderer.render(scene,camera);
$('photos').style.opacity=intro;$('photos').style.transform=`translateX(${-45*(1-intro)}px)`;$('photo-note').style.opacity=intro;$('phase').style.opacity=(1-intro)*(1-split);let pi=t<10?0:t<17?1:t<23?2:3;const v=phaseText[pi];$('phaseNum').textContent=v[0];$('phaseTitle').textContent=v[1];$('phaseText').textContent=v[2];$('compareLabels').style.opacity=split;$('centerline').style.opacity=split;$('bar').style.width=`${100*t/DURATION}%`;
$('caption').textContent=t<4?'正面 · 斜俯视 · 顶视｜三组真实照片交叉参照':t<29?'持续旋转，同一位置观察模型逐步优化':'优化前 / 优化后 · 相同镜头、相同角度持续旋转';
return{time:t,yaw,split,phase:pi,draw_calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}
window.renderAt=renderAt;window.animationReport=report;window.ready=true;$('loading').style.display='none';renderAt(0);
let playing=!query.has('capture'),start=performance.now(),offset=0;function animate(now){if(playing){let t=(offset+(now-start)/1000)%DURATION;renderAt(t)}requestAnimationFrame(animate)}requestAnimationFrame(animate);$('play').onclick=()=>{if(playing)offset=(offset+(performance.now()-start)/1000)%DURATION;else start=performance.now();playing=!playing};
}catch(e){window.failure=String(e.stack||e);$('loading').textContent='模型载入失败：'+e.message;console.error(e)}
