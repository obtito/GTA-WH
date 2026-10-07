// node tools/bridge-check.mjs — all bridge geometry and deck alignment regressions.
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === 'three') return { url: ${JSON.stringify(new URL('../vendor/three.module.js', import.meta.url).href)}, shortCircuit: true };
    if (specifier.startsWith('three/addons/')) return { url: new URL(specifier.slice(13), ${JSON.stringify(new URL('../vendor/', import.meta.url).href)}).href, shortCircuit: true };
    return next(specifier, context);
  }
`), import.meta.url);

const [{buildBridges,bridgeHeightAt},{BRIDGES},{toV2},THREE]=await Promise.all([
  import('../js/bridges.js'),import('../js/data.js'),import('../js/geo.js'),import('three')
]);
const bridges=buildBridges();
assert.equal(bridges.group.children.length,5);
let triangles=0,instances=0;
for(const br of BRIDGES){
  const root=bridges.group.getObjectByName('bridge:'+br.id);
  assert(root);
  const deck=root.getObjectByName(br.kind==='truss'?'yb-road-deck':'bridge-deck');
  const p=deck.geometry.attributes.position;
  const [ax,az]=toV2(...br.axis[0]),[bx,bz]=toV2(...br.axis[1]);
  const n=root.userData.bridge.samples;
  for(let i=0;i<=n;i++){
    const t=i/n,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
    assert(Math.abs(bridgeHeightAt(x,z)-p.getY(i*4))<0.001,br.id+' deck alignment');
  }
  root.traverse(o=>{
    if(!o.geometry)return;
    const pos=o.geometry.attributes.position;
    for(const v of pos.array)assert(Number.isFinite(v));
    if(o.isInstancedMesh){
      instances+=o.count;
      const m=new THREE.Matrix4();
      for(let i=0;i<o.count;i++){o.getMatrixAt(i,m);assert(m.elements.every(Number.isFinite));assert(Math.abs(m.determinant())>1e-9);}
    }
    triangles+=(o.geometry.index?.count||pos.count)/3*(o.isInstancedMesh?o.count:1);
  });
  assert(root.getObjectByName('bridge-guardrails'));
  assert(root.getObjectByName('bridge-lane-markings'));
}
for(const update of bridges.updates)update(1/60);
bridges.setNight(1);
const before=bridgeHeightAt(...toV2(...BRIDGES[0].axis[0]));
buildBridges();
assert.equal(bridgeHeightAt(...toV2(...BRIDGES[0].axis[0])),before);
console.log(`Bridge checks passed: 5 continuous decks, ${instances} instances, ${Math.round(triangles)} triangles; heights, finite geometry and rebuilding verified.`);
