// Video-only compatible morph layers. Saved model stages remain unchanged.
// References: CloudAI-X threejs-animation (morph targets / interpolation),
// threejs-shaders (uniform-driven mix of two render targets).
import * as THREE from 'three';
export const ease = t => {t=THREE.MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10)};
const old=[{r:17.5,y:3,h:8.2},{r:15.4,y:11.2,h:8},{r:13.5,y:19.2,h:7.8},{r:11.8,y:27,h:7.6},{r:10.2,y:34.6,h:8}];
const next=[{r:15,y:2.2,h:10.2},{r:13.8,y:12.4,h:7.1},{r:12.6,y:19.5,h:6.6},{r:11.4,y:26.1,h:6.5},{r:9.5,y:32.6,h:7.4}];
const mix=THREE.MathUtils.lerp,clamp=THREE.MathUtils.clamp;
function category(o,stage,centre){
 let roof=-1,level=-1,arm=false,entry=false;
 for(let n=o;n;n=n.parent){let m=n.name.match(/^(?:code-)?roof-(\d+)$/);if(m)roof=Number(m[1])-1;m=n.name.match(/^storey-(\d+)$/);if(m)level=Number(m[1])-1;if(n.name.startsWith('cardinal-gable'))arm=true;if(n.name==='entry-canopy')entry=true;if(n.name==='finial')return {kind:'finial',level:-1};if(n.name==='foundation')return {kind:'foundation',level:-1};}
 if(roof>=0)return {kind:arm?'roof-arm':'roof',level:roof};
 if(entry)return {kind:'entry',level:-1};
 if(level>=0)return {kind:'body',level};
 if(stage===0){if(centre.y>=46)return {kind:'finial',level:-1};for(let i=4;i>=0;i--)if(centre.y>=old[i].y-.1)return {kind:'body',level:i};}
 return {kind:'foundation',level:-1};
}
function boundary(x,z,r,octagon){const length=Math.hypot(x,z);if(length<1e-7)return r;const ax=Math.abs(x)/length,az=Math.abs(z)/length;
 if(!octagon)return Math.min(r/Math.max(ax,az),1.76*r/(ax+az));
 const theta=Math.atan2(x,z),d=theta-Math.round(theta/(Math.PI/4))*Math.PI/4;return r*Math.cos(Math.PI/8)/Math.cos(d);
}
function mapStructural(p,part,fromOld){
 const a=(fromOld?old:next)[part.level],b=(fromOld?next:old)[part.level];
 if(part.kind==='body'){const ratio=boundary(p.x,p.z,b.r,!fromOld)/boundary(p.x,p.z,a.r,fromOld);return new THREE.Vector3(p.x*ratio,b.y+(p.y-a.y)*b.h/a.h,p.z*ratio);}
 if(part.kind==='roof'||part.kind==='roof-arm'){
  const ar=a.r+(fromOld?3.2:3.1),br=b.r+(fromOld?3.1:3.2),length=Math.hypot(p.x,p.z),theta=Math.atan2(p.x,p.z);
  const roofBoundary=(r,oct)=>oct?boundary(p.x,p.z,r,true):r*length/Math.max(1e-7,Math.abs(p.x),Math.abs(p.z));
  const ab=roofBoundary(ar,fromOld),bb=roofBoundary(br,!fromOld),innerA=part.level===4?0:(fromOld?a.r*.63:ar*.59),innerB=part.level===4?0:(fromOld?br*.59:b.r*.63);
  const u=clamp((1-length/Math.max(ab,1e-7))/(1-innerA/ar),0,1),radius=bb*(1-u*(1-innerB/br));
  const ay=a.y+a.h-(fromOld?.35:.65),by=b.y+b.h-(fromOld?.65:.35),ah=part.level===4?(fromOld?5.6:7):(fromOld?2.8:3.15),bh=part.level===4?(fromOld?7:5.6):(fromOld?3.15:2.8);
  const delta=theta-Math.round(theta/(Math.PI/4))*Math.PI/4,octEdge=Math.min(1,Math.abs(Math.tan(delta)/Math.tan(Math.PI/8))),squareEdge=Math.min(Math.abs(p.x),Math.abs(p.z))/Math.max(1e-7,Math.abs(p.x),Math.abs(p.z));
  const surface=(base,rise,oct)=>base+rise*u*u+(oct?.65*Math.pow(1-u,6):.22*Math.pow(1-u,8))+(oct?1.1*Math.pow(octEdge,6)*Math.pow(1-u,4):1.55*Math.pow(squareEdge,8)*Math.pow(1-u,3));
  const residual=part.kind==='roof-arm'?0:clamp(p.y-surface(ay,ah,fromOld),-.22,.22);
  return new THREE.Vector3(Math.sin(theta)*radius,surface(by,bh,!fromOld)+residual,Math.cos(theta)*radius);
 }
 if(part.kind==='finial'){return new THREE.Vector3(p.x,fromOld?46.35+(p.y-47.85)*(51.4-46.35)/(51.4-47.85):47.85+(p.y-46.35)*(51.4-47.85)/(51.4-46.35),p.z);}
 if(part.kind==='foundation'&&fromOld)return new THREE.Vector3(p.x,Math.min(p.y,2.2),p.z);
 return p.clone();
}
function mapEave(p,part,fromFinal){if(part.kind!=='roof')return p.clone();const floor=next[part.level],a=floor.r+3.1,inner=part.level===4?0:a*.59,r=Math.max(Math.abs(p.x),Math.abs(p.z));const u=clamp((1-r/a)/(1-inner/a),0,1);const side=r>1e-7?Math.min(Math.abs(p.x),Math.abs(p.z))/r:0;const influence=Math.pow(side,8)*Math.pow(1-u,3);return new THREE.Vector3(p.x,p.y+(fromFinal?-1:1)*1.15*influence,p.z);}
function bake(root,stage,mapPoint){
 const buckets=new Map();root.updateMatrixWorld(true);const temp=new THREE.Matrix4();
 root.traverse(o=>{if(!o.isMesh)return;const materials=Array.isArray(o.material)?o.material:[o.material];const indexed=o.geometry.index?o.geometry.toNonIndexed():o.geometry;const groups=Array.isArray(o.material)?(indexed.groups.length?indexed.groups:[{start:0,count:indexed.attributes.position.count,materialIndex:0}]):[{start:0,count:indexed.attributes.position.count,materialIndex:0}];
 for(let inst=0;inst<(o.isInstancedMesh?o.count:1);inst++){
  let world=o.matrixWorld;if(o.isInstancedMesh){o.getMatrixAt(inst,temp);world=new THREE.Matrix4().multiplyMatrices(o.matrixWorld,temp)}const normalMatrix=new THREE.Matrix3().getNormalMatrix(world);const centre=new THREE.Vector3().setFromMatrixPosition(world);if(!o.isInstancedMesh){o.geometry.computeBoundingBox();centre.copy(o.geometry.boundingBox.getCenter(new THREE.Vector3())).applyMatrix4(world)}const part=category(o,stage,centre);
  for(const g of groups){const material=materials[g.materialIndex||0],key=part.kind+part.level+':'+material.uuid;let b=buckets.get(key);if(!b)buckets.set(key,b={positions:[],normals:[],uvs:[],mapped:[],part,material});
   for(let i=g.start;i<g.start+g.count;i++){const p=new THREE.Vector3().fromBufferAttribute(indexed.attributes.position,i).applyMatrix4(world),n=new THREE.Vector3().fromBufferAttribute(indexed.attributes.normal,i).applyMatrix3(normalMatrix).normalize();b.positions.push(p.x,p.y,p.z);b.normals.push(n.x,n.y,n.z);const uv=indexed.attributes.uv;b.uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);const m=mapPoint(p,part);b.mapped.push(m.x,m.y,m.z);}
  }
 }
 });
 const baked=new THREE.Group();baked.name='video-morph-'+stage;
 for(const b of buckets.values()){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(b.uvs,2));geo.morphAttributes.position=[new THREE.Float32BufferAttribute(b.mapped,3)];const end=new THREE.BufferGeometry();end.setAttribute('position',geo.morphAttributes.position[0]);end.computeVertexNormals();geo.morphAttributes.normal=[end.attributes.normal];const mesh=new THREE.Mesh(geo,b.material);mesh.name=b.part.kind+'-'+b.part.level;mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;baked.add(mesh);}
 return baked;
}
export function createProgressiveTransition(view,roots){
 const width=view.renderer.domElement.width,height=view.renderer.domElement.height;
 const targets=[new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,samples:4}),new THREE.WebGLRenderTarget(width,height,{type:THREE.HalfFloatType,samples:4})];
 const blendScene=new THREE.Scene(),blendCamera=new THREE.Camera(),uniforms={imageA:{value:targets[0].texture},imageB:{value:targets[1].texture},weight:{value:0},backgroundLinear:{value:view.scene.background.clone()}};
 const blend=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,toneMapped:true,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:`
 uniform sampler2D imageA;uniform sampler2D imageB;uniform float weight;uniform vec3 backgroundLinear;varying vec2 vUv;
 void main(){
  vec4 a=texture2D(imageA,vUv),b=texture2D(imageB,vUv);
  vec3 ca=a.rgb/max(a.a,.0001),cb=b.rgb/max(b.a,.0001);
  #ifdef TONE_MAPPING
   ca=toneMapping(ca);cb=toneMapping(cb);
  #endif
  gl_FragColor=vec4(mix(mix(backgroundLinear,ca,a.a),mix(backgroundLinear,cb,b.a),weight),1.0);
  #include <colorspace_fragment>
 }
 `}));blendScene.add(blend);
 // #include directives must begin on a line for the Three.js chunk resolver.
 blend.material.fragmentShader=blend.material.fragmentShader.replace(';#include',';\n#include');
 const direct=roots.map((r,i)=>i===0?bake(r,0,p=>p.clone()):r.clone(true));
 const pairs=[
  [bake(roots[0],0,(p,c)=>mapStructural(p,c,true)),bake(roots[1],1,(p,c)=>mapStructural(p,c,false))],
  [bake(roots[1],1,p=>p.clone()),bake(roots[2],2,p=>p.clone())],
  [bake(roots[2],2,(p,c)=>mapEave(p,c,false)),bake(roots[3],3,(p,c)=>mapEave(p,c,true))]
 ];
 function setRoot(root){if(view.root!==root){view.scene.remove(view.root);view.root=root;view.scene.add(root)}}
 function influence(root,value){root.children.forEach(mesh=>mesh.morphTargetInfluences[0]=value)}
 function stageAt(t){for(const [i,start,end]of[[0,2.4,7.4],[1,7.9,12.4],[2,12.9,17.5]]){if(t<start)return {stage:i};if(t<end)return {pair:i,progress:ease((t-start)/(end-start))};}return {stage:3};}
 function renderAt(t){const state=stageAt(t);if(state.stage!==undefined){setRoot(direct[state.stage]);view.renderer.setRenderTarget(null);view.renderer.render(view.scene,view.camera);return state;}
  const [from,to]=pairs[state.pair],p=state.progress;influence(from,p);influence(to,1-p);const background=view.scene.background,clear=view.renderer.getClearColor(new THREE.Color()),alpha=view.renderer.getClearAlpha();view.scene.background=null;view.renderer.setClearColor(0,0);
  for(const [i,root]of[from,to].entries()){setRoot(root);view.renderer.setRenderTarget(targets[i]);view.renderer.render(view.scene,view.camera);}view.scene.background=background;view.renderer.setClearColor(clear,alpha);uniforms.weight.value=p;view.renderer.setRenderTarget(null);view.renderer.render(blendScene,blendCamera);return state;
 }
 return {renderAt,stageAt,pairs,direct};
}
export function orbitAt(t){const speed=Math.PI*2/22;let yaw=t*speed,height=38;if(t>=22)return {yaw:(t-22)*Math.PI/4,height:50};if(t>=19){const u=(t-19)/3;yaw=19*speed+3*speed*u+3*(Math.PI/4-speed)*(u*u*u-u*u);height=mix(38,50,ease(u));}return {yaw,height};}
