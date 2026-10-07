// node tools/water-clearance.mjs — audit actual baked roof triangles against rendered water.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { footprintOverlapsWater, waterAt, WATER_FOOTPRINTS, RIVER_SURFACE_POINTS, BRANCH_SURFACES, yangtzeWidth } from '../js/water-mask.js';
const bin=readFileSync(new URL('../data/city.bin',import.meta.url));
const buffer=bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength);
const meta=JSON.parse(readFileSync(new URL('../data/city-meta.json',import.meta.url)));
let roofs=0, overlap=0;
for(const b of Object.values(meta.buckets)){
  let o=b.offset;
  const p=new Float32Array(buffer,o,b.vCount*3);o+=b.vCount*12;
  const n=new Float32Array(buffer,o,b.vCount*3);o+=b.vCount*12+b.vCount*8+b.vCount*3;o=(o+3)&~3;
  const idx=new Uint32Array(buffer,o,b.iCount);
  for(let i=0;i<idx.length;i+=3){
    const a=idx[i],b=idx[i+1],c=idx[i+2];
    if(n[a*3+1]<0.9||n[b*3+1]<0.9||n[c*3+1]<0.9)continue;
    const poly=[a,b,c].map(v=>[p[v*3],p[v*3+2]]);
    const area=Math.abs((poly[1][0]-poly[0][0])*(poly[2][1]-poly[0][1])-(poly[1][1]-poly[0][1])*(poly[2][0]-poly[0][0]));
    if(area<0.001)continue;
    roofs++;if(footprintOverlapsWater(poly))overlap++;
  }
}
assert.equal(overlap,0,`${overlap} baked roof triangles overlap visible water`);
assert(roofs>10000);
// Boundary crossing, containment and dry-land regressions.
const tri=WATER_FOOTPRINTS[0],mid=tri.reduce((a,p)=>[a[0]+p[0]/3,a[1]+p[1]/3],[0,0]);
assert(waterAt(...mid));
assert(footprintOverlapsWater([[mid[0]-1,mid[1]-1],[mid[0]+1,mid[1]-1],[mid[0],mid[1]+1]]));
assert(!footprintOverlapsWater([[1e6,1e6],[1e6+1,1e6],[1e6,1e6+1]]));
console.log(`Water clearance passed: ${meta.count} buildings, ${roofs} roof triangles, zero visible-water overlaps.`);

import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === 'three') return { url: ${JSON.stringify(new URL('../vendor/three.module.js', import.meta.url).href)}, shortCircuit: true };
    if (specifier.startsWith('three/addons/')) return { url: new URL(specifier.slice(13), ${JSON.stringify(new URL('../vendor/', import.meta.url).href)}).href, shortCircuit: true };
    return next(specifier, context);
  }
`), import.meta.url);

const [{buildWater},THREE]=await Promise.all([import('../js/world.js'),import('../vendor/three.module.js')]);
const water=buildWater(new THREE.MeshBasicMaterial());
let ti=0;
for(const mesh of water.children.filter(m=>m.name==='river'||m.name.startsWith('branch:'))){
  const p=mesh.geometry.attributes.position,idx=mesh.geometry.index.array;
  for(let i=0;i<idx.length;i+=3){
    const expected=WATER_FOOTPRINTS[ti++];
    for(let j=0;j<3;j++){
      const v=idx[i+j];
      assert(Math.abs(p.getX(v)-expected[j][0])<0.003);
      assert(Math.abs(p.getZ(v)-expected[j][1])<0.003);
    }
  }
}
console.log(`Rendered river/branch mesh matches all ${ti} shared water-mask triangles.`);
// Imported landmark towers bypass city.bin; include their full model footprints in this audit.
await import('./tower-clearance.mjs');
