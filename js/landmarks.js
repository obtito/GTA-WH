// 地标层：17 处武汉地标，采用共享构件的程序化表现
// 高度口径:各构建器总高 ≈ data.js 的 heightM(供自动校验)
import * as THREE from 'three';
import { toV2, bearingToRot, makeRandom } from './geo.js';
import { LANDMARKS } from './data.js';
import { mat, put, UNIT, instancedBoxes, registerEnv } from './lib.js';
import { terrainHeight } from './world.js';
import { chineseHall, storiedPavilion, hipRoof, gableRoof, pedestal } from './arch.js';
import { localSite, facade, entranceSteps, plaque, dryBuilding, tileMaterial } from './landmark-details.js';
import { landmarkAnchor } from './sites.js';
import { waterAt } from './water-mask.js';
import { buildWhuCampus } from './whu-campus.js';

/* ============ 地标占地(供城市生成排他) ============
 * 单一事实来源迁到 js/sites.js(烘焙工具/程序化城市/运行时共用),
 * 这里原样转发,保持既有 import 不变。 */
export { SITE_R, landmarkSites } from './sites.js';

/* ============ 工具 ============ */
function groundAt(x, z) { return Math.max(terrainHeight(x, z), 0); }

/* ==================== 1. 黄鹤楼 ==================== */
// 五层飞檐攒尖,黄琉璃,葫芦宝顶,高 51.4 m(不含蛇山地形)
function mkHuangelou(g, x, z, ground, rot) {
  const platform = pedestal(46, 46, 6, '#cfc9b8');
  platform.position.set(x, ground, z);
  platform.rotation.y = rot;
  g.add(platform);

  const tower = storiedPavilion({
    floors: [
      { w: 33, d: 33, h: 8.6 }, { w: 29, d: 29, h: 7.6 },
      { w: 25, d: 25, h: 6.8 }, { w: 21, d: 21, h: 6.2 },
      { w: 17.5, d: 17.5, h: 5.6 },
    ],
    eaveW: 40,
    topRoof: 7.2,
    topType: 'jian',                      // 攒尖
    finial: true,
    postColor: '#8e2f22',
    wallColor: '#d8cdb8',
    roofColor: '#a87330',
    stoneColor: '#cfc9b8',
    bays: 7,
  });
  tower.position.set(x, ground + 6, z);
  tower.rotation.y = rot;
  g.add(tower);

  // 夜间金色泛光(黄色琉璃屋面自发光)
  const gold = new THREE.Color('#a87330');
  tower.traverse((o) => {
    if (o.isMesh && o.material?.color) {
      const c = o.material.color;
      if (Math.abs(c.r - gold.r) < 0.02 && Math.abs(c.g - gold.g) < 0.02 && Math.abs(c.b - gold.b) < 0.02) {
        o.material = o.material.clone();
        o.material.emissive = new THREE.Color('#7a5510');
        o.material.userData.nightGlow = .12;
      }
    }
  });
}

/* ==================== 2. 龟山电视塔 ==================== */
function mkTvtower(g, x, z, ground) {
  const site = localSite(g, x, z, ground);
  const white = mat('#cfd3d1', { rough: .78, env: .35 });
  const shaft = new THREE.LatheGeometry([[10,0],[8,22],[6,74],[4.4,128],[3.5,150],[2.5,196]].map(p=>new THREE.Vector2(...p)), 32);
  const body = new THREE.Mesh(shaft, white); body.name = 'continuous-tower-shaft'; site.add(body);
  put(site, UNIT.cyl, mat('#8c9290', { rough: .9 }), { scale: [29, 1.2, 29] });
  const profile = [[7,127],[12.5,129],[14,131],[14,137],[11,141],[5,145]];
  site.add(new THREE.Mesh(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)), 48), white));
  const glass = mat('#3c5966', { rough: .4, metal: .18 });
  site.add(new THREE.Mesh(new THREE.CylinderGeometry(14.08,14.08,3.6,48,1,true), glass));
  site.children.at(-1).position.y = 134;
  const frames = [];
  for (let i=0;i<32;i++) {
    const a=i*Math.PI/16;
    frames.push({x:Math.sin(a)*14.15,z:Math.cos(a)*14.15,y:132.2,w:.22,h:3.6,d:.3,rot:a});
  }
  site.add(instancedBoxes(frames,white));
  for (let i=0;i<6;i++) put(site,UNIT.cyl,mat(i%2?'#a4473e':'#d0d1cc',{rough:.75}),{
    pos:[0,196+i*4,0],scale:[2.3-i*.31,4,2.3-i*.31]});
  entranceSteps(site,12,7,1.2,14.5);
}

/* ==================== 3. 晴川阁 ==================== */
function mkQingchuan(g, x, z, ground, rot) {
  const pav = storiedPavilion({
    floors: [{ w: 16, d: 11, h: 6.5 }, { w: 13, d: 9, h: 5.5 }],
    eaveW: 19,
    topRoof: 5.5,
    topType: 'gable-hip',
    finial: false,
    postColor: '#8e2f22',
    wallColor: '#c9b6a2',
    roofColor: '#3a4045',
    stoneColor: '#cfc9b8',
    bays: 5,
  });
  pav.position.set(x, ground, z);
  pav.rotation.y = rot;
  g.add(pav);
  const court=localSite(g,x,z,ground,rot);
  entranceSteps(court,10,5,1.2,8);
  plaque(court,'晴川阁',4,.9,0,5.4,5.7);
  for(const xx of [-15,15])put(court,UNIT.box,mat('#b8b2a2',{rough:.95}),{pos:[xx,0,-2],scale:[.7,1.2,25]});
}

/* ==================== 4. 江汉关大楼 ==================== */
function mkJianghanguan(g, x, z, ground, rot) {
  const site = localSite(g,x,z,ground,rot);
  const stone = mat('#c2b9a4',{rough:.9}), trim=mat('#d7cebb',{rough:.85});
  put(site,UNIT.box,stone,{scale:[40,24,22]});
  facade(site,{w:40,d:22,h:24,floors:4,bays:10,trim:'#d7cebb'});
  for (const y of [0,6,18,24]) put(site,UNIT.box,trim,{pos:[0,y,0],scale:[41.5,.5,23.5]});
  const cols=[];
  for(const side of [-1,1]) for(let i=0;i<11;i++) cols.push({x:-19+i*3.8,z:side*12,y:.5,w:.7,h:22.8,d:.7});
  site.add(instancedBoxes(cols,trim));
  put(site,UNIT.box,mat('#47514e',{rough:.85}),{pos:[0,24.5,0],scale:[39,1.5,21]});
  put(site,UNIT.box,stone,{pos:[0,26,0],scale:[9,12,9]});
  for(const y of [26,28,36.5,38]) put(site,UNIT.box,trim,{pos:[0,y,0],scale:[10,.5,10]});
  const dial=mat('#e0d9c7',{rough:.82,emissive:'#70654b',emissiveIntensity:0}).clone();
  dial.userData.nightGlow=.75;
  const dark=mat('#313733',{rough:.9});
  for(const a of [0,Math.PI/2,Math.PI,-Math.PI/2]) {
    const face=localSite(site,Math.sin(a)*4.64,Math.cos(a)*4.64,32.5,a);
    face.name='clock-face';
    face.add(new THREE.Mesh(new THREE.CircleGeometry(2.3,48),dial));
    face.add(new THREE.Mesh(new THREE.TorusGeometry(2.35,.15,6,48),trim));
    for(let i=0;i<12;i++) {
      const angle=i*Math.PI/6;
      put(face,UNIT.box,dark,{pos:[Math.sin(angle)*1.93,Math.cos(angle)*1.93-.12,.06],scale:[.11,.26,.05],rotZ:-angle});
    }
    put(face,UNIT.box,dark,{pos:[0,0,.13],scale:[.14,1.65,.08],rotZ:-Math.PI/3});
    put(face,UNIT.box,dark,{pos:[0,0,.16],scale:[.2,1.15,.08],rotZ:Math.PI/4});
    put(face,UNIT.sphere,dark,{pos:[0,0,.22],scale:[.25,.25,.12]});
  }
  put(site,UNIT.box,stone,{pos:[0,38.5,0],scale:[7,1.5,7]});
  put(site,UNIT.cone4,mat('#49534d',{rough:.84}),{pos:[0,40,0],scale:[8.5,5,8.5],rot:Math.PI/4});
  put(site,UNIT.cyl,dark,{pos:[0,45,0],scale:[.18,1.3,.18]});
  entranceSteps(site,12,5,.8,12.5);
  plaque(site,'江汉关',7,.9,0,5.1,12.1);
}

/* ==================== 5. 江汉路步行街(入口牌坊 + 铜像) ==================== */
function mkJianghanlu(g, x, z, ground, rot) {
  // Historic shop fronts frame a pedestrian lane rather than an invented monumental gateway.
  for(let i=-8;i<=8;i++) for(const side of [-1,1]) {
    const along=i*23,off=side*25;
    const px=x+Math.cos(rot)*along+Math.sin(rot)*off,pz=z-Math.sin(rot)*along+Math.cos(rot)*off;
    if(!dryBuilding(px,pz,21,16,rot))continue;
    const h=12+(Math.abs(i)%3)*2.5,site=localSite(g,px,pz,groundAt(px,pz),rot);
    put(site,UNIT.box,mat(i%2?'#a3765f':'#b8ae96',{rough:.91}),{scale:[21,h,16]});
    facade(site,{w:21,d:16,h,floors:3,bays:5,trim:'#d6cbb4'});
    put(site,UNIT.box,mat('#766951',{rough:.88}),{pos:[0,h,0],scale:[22,.5,17]});
    put(site,UNIT.box,mat('#454b47',{rough:.9}),{pos:[0,3.5,-side*8.6],scale:[18,.3,1.6]});
  }
  const site=localSite(g,x,z,ground,rot);
  plaque(site,'江汉路步行街',10,1.1,0,4.3,0);
  for(const xx of [-6,6]) put(site,UNIT.cyl,mat('#585b50',{rough:.84}),{pos:[xx,0,0],scale:[.22,5.6,.22]});
  // Seated bronze figure: body, head and limbs form one supported silhouette.
  const bronze=mat('#6f684b',{rough:.7,metal:.38});
  put(site,UNIT.box,mat('#9c9482',{rough:.9}),{pos:[8,0,0],scale:[3,.45,1.3]});
  put(site,UNIT.cyl,bronze,{pos:[8,.45,0],scale:[.75,1.3,.6]});
  put(site,UNIT.sphere,bronze,{pos:[8,1.9,0],scale:[.48,.6,.48]});
  for(const dx of [-.25,.25]) put(site,UNIT.box,bronze,{pos:[8+dx,.45,.45],scale:[.2,.7,.22]});
}

/* ==================== 6. 汉口江滩(堤 + 芦苇 + 灯柱) ==================== */
function mkJiangtan(g, x, z, ground) {
  const rot=bearingToRot(128),len=1400;
  const paving=mat('#a39e8d',{rough:.96}),rail=mat('#606b63',{rough:.8});
  const railItems=[],benches=[],points=[];
  for(let i=0;i<46;i++) {
    const along=(i/45-.5)*len;
    const cx=x+Math.cos(rot)*along,cz=z-Math.sin(rot)*along;
    let shore=null;
    // Walk across the bank normal until the visible river begins, then retreat by the full path width.
    for(let off=-600;off<=1600;off+=10) {
      if(waterAt(cx+Math.sin(rot)*off,cz+Math.cos(rot)*off)){shore=off;break;}
    }
    if(shore===null)continue;
    for(let k=0;k<=36;k++) {
      const off=shore-20-k*10,px=cx+Math.sin(rot)*off,pz=cz+Math.cos(rot)*off;
      if(dryBuilding(px,pz,34,20,rot)){points.push([px,pz]);break;}
    }
  }
  if(points.length)g.userData.anchor=points[Math.floor(points.length/2)];
  // Connect adjacent stations with aligned strips, removing the stepped box edges.
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(length>55)continue;
    const angle=Math.atan2(a[1]-b[1],b[0]-a[0]);
    const px=(a[0]+b[0])/2,pz=(a[1]+b[1])/2,yy=groundAt(px,pz);
    if(!dryBuilding(px,pz,length+.2,12,angle))continue;
    const path=put(g,UNIT.box,paving,{pos:[px,yy,pz],scale:[length+.2,.22,12],rot:angle});
    path.name='dry-promenade';
    const n=Math.ceil(length/5);
    for(let j=0;j<=n;j++) {
      const along=(j/n-.5)*length;
      railItems.push({x:px+Math.cos(angle)*along+Math.sin(angle)*5.5,
        z:pz-Math.sin(angle)*along+Math.cos(angle)*5.5,y:yy+.22,w:.12,h:1.1,d:.12});
    }
    railItems.push({x:px+Math.sin(angle)*5.5,z:pz+Math.cos(angle)*5.5,y:yy+1.27,w:length,h:.12,d:.12,rot:angle});
    if(i%3===0) {
      const bx=px-Math.sin(angle)*4,bz=pz-Math.cos(angle)*4;
      benches.push({x:bx,z:bz,y:yy+.3,w:3,h:.45,d:.7,rot:angle});
      put(g,UNIT.cyl,rail,{pos:[bx+2,yy,bz],scale:[.2,5,.2]});
      put(g,UNIT.sphere,mat('#d2c7a8',{rough:.8}),{pos:[bx+2,yy+5,bz],scale:[.6,.5,.6]});
    }
  }
  if(railItems.length)g.add(instancedBoxes(railItems,rail));
  if(benches.length)g.add(instancedBoxes(benches,mat('#7b654e',{rough:.93})));
}

/* ==================== 7. 湖北省博物馆 ==================== */
function mkMuseum(g, x, z, ground, rot) {
  const site=localSite(g,x,z,ground,rot+Math.PI/2);
  const stone=mat('#c6bda7',{rough:.9}), glass=mat('#405956',{rough:.48,metal:.12});
  put(site,UNIT.box,stone,{scale:[150,3.4,76]});
  for(const side of [-1,0,1]) {
    const w=side?34:64,d=side?28:34,h=side?12:20,cx=side*53;
    const block=localSite(site,cx,0,3.4);
    put(block,UNIT.box,side?stone:glass,{scale:[w,h,d]});
    facade(block,{w,d,h,floors:side?2:3,bays:side?6:10,trim:'#aaa68f'});
    const roof=gableRoof({w:w+8,d:d+10,rise:side?4.5:9,color:'#454b43',ridgeColor:'#303831'});
    roof.position.y=h;block.add(roof);
    put(block,UNIT.box,mat('#8b805e',{rough:.82}),{pos:[0,h-.6,0],scale:[w+3,.6,d+3]});
  }
  entranceSteps(site,26,12,3.4,38);
  plaque(site,'湖北省博物馆',15,1.5,0,18.4,17.2);
  // A small suspended bronze-bell display in the forecourt.
  const bronze=mat('#69735b',{metal:.3,rough:.72}),frame=mat('#514436',{rough:.85});
  for(const xx of [-12,12]) put(site,UNIT.box,frame,{pos:[xx,3.4,29],scale:[.5,4.6,.5]});
  put(site,UNIT.box,frame,{pos:[0,7.7,29],scale:[25,.5,.6]});
  for(let i=0;i<9;i++) {
    put(site,UNIT.cyl,frame,{pos:[(i-4)*2.5,6.5,29],scale:[.12,1.2,.12]});
    put(site,UNIT.cyl,bronze,{pos:[(i-4)*2.5,4.8,29],scale:[1.2,1.9,.9]});
  }
}

/* ==================== 8. 楚河汉街 ==================== */
function mkHanjie(g, x, z, ground, rot) {
  const rand=makeRandom(2026),len=1500;
  for(let along=-len/2;along<len/2;along+=34) {
    let px,pz,off=-34,found=false;
    for(let k=0;k<=5;k++) {
      off=-34-k*12;px=x+Math.cos(rot)*along+Math.sin(rot)*off;pz=z-Math.sin(rot)*along+Math.cos(rot)*off;
      if(dryBuilding(px,pz,26,20,rot)){found=true;break;}
    }
    if(!found)continue;
    const h=11+rand()*7,site=localSite(g,px,pz,groundAt(px,pz),rot);
    put(site,UNIT.box,mat(rand()>.5?'#a16952':'#bfb59c',{rough:.93}),{scale:[26,h,20]});
    facade(site,{w:26,d:20,h,floors:3,bays:6,trim:'#d8ccb4'});
    put(site,UNIT.box,mat('#847a67',{rough:.88}),{pos:[0,h,0],scale:[27,.6,21]});
    put(site,UNIT.box,mat('#424c48',{rough:.85}),{pos:[0,3.3,10.7],scale:[24,.25,1.8]});
    if(Math.round(along/34)%5===0)plaque(site,'楚河汉街',7,.9,0,3.6,10.2);
  }
}

/* ==================== 9. 汉秀剧场(红灯笼) ==================== */
function mkLantern(g, x, z, ground) {
  const site=localSite(g,x,z,ground);
  const red=mat('#9b3429',{rough:.72,emissive:'#641d11',emissiveIntensity:0});
  red.userData.nightGlow=.6;
  const rib=mat('#663126',{rough:.79}),rim=mat('#8f7955',{metal:.15,rough:.76});
  put(site,UNIT.cyl,mat('#898b85',{rough:.92}),{scale:[96,6,96]});
  const profile=[[34,6],[38,12],[43,26],[45,43],[44,59],[40,73],[33,84]];
  const body=new THREE.Mesh(new THREE.LatheGeometry(profile.map(p=>new THREE.Vector2(...p)),64),red);
  body.name='lantern-envelope';site.add(body);
  for(let i=0;i<32;i++) {
    const a=i*Math.PI/16;
    const pts=profile.map(([r,y])=>new THREE.Vector3(Math.sin(a)*(r+.35),y,Math.cos(a)*(r+.35)));
    site.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,.38,5,false),rib));
  }
  for(const [r,y] of [[34,7],[43.8,30],[44.4,55],[33,84]]) {
    const band=new THREE.Mesh(new THREE.TorusGeometry(r,.65,6,64),rim);band.rotation.x=Math.PI/2;band.position.y=y;site.add(band);
  }
  put(site,UNIT.cyl,rim,{pos:[0,84,0],scale:[67,2.2,67]});
  put(site,UNIT.cyl,mat('#51433a',{rough:.87}),{pos:[0,86.2,0],scale:[58,3.8,58]});
  const entry=localSite(site,0,35.4,6);
  put(entry,UNIT.box,mat('#344951',{rough:.4,metal:.12}),{scale:[28,7,.5]});
  facade(entry,{w:28,d:.7,h:7,floors:1,bays:8,trim:'#b8a485'});
  plaque(entry,'汉秀剧场',11,1.2,0,7.4,.7);
  entranceSteps(site,28,8,6,48);
}

/* ==================== 10. 武汉绿地中心(475 m) ==================== */
function mkGreenland(g, x, z, ground, rot) {
  // 三瓣流线:旋转收分的 Lathe 塔身 + 塔冠
  const profile = [];
  const P = [[0, 31], [40, 30], [90, 28], [140, 26], [190, 23.5], [240, 21], [290, 18], [340, 14.5], [380, 11.5], [410, 9], [430, 6.5], [448, 3.4], [460, 1.2], [466, 0]];
  for (const [y, r] of P) profile.push(new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(profile, 28);
  const glass = mat('#a9c6d4', { rough: 0.18, metal: 0.6, env: 1.35 });
  const mesh = new THREE.Mesh(geo, glass);
  mesh.position.set(x, ground, z);
  mesh.rotation.y = rot;
  mesh.castShadow = true;
  mesh.userData.nightGlow = 0;
  g.add(mesh);
  // 塔冠天线
  put(g, UNIT.cyl, mat('#8d949a', { metal: 0.6, rough: 0.3 }), { pos: [x, ground + 466, z], scale: [1.6, 10, 1.6] });
  // 裙房
  put(g, UNIT.box, mat('#b9c4c9', { rough: 0.6, metal: 0.15 }), { pos: [x, ground, z], scale: [68, 18, 56], rot });
  const podium=localSite(g,x,z,ground,rot);
  facade(podium,{w:68,d:56,h:18,floors:3,bays:12,trim:'#8d9b9e',glass:'#4d6570'});
}

/* ==================== 11. 武汉大学(老斋舍 + 樱顶老图书馆) ==================== */
function mkWhu(g, x, z) {
  buildWhuCampus(g,x,z);
}

/* ==================== 12. 磨山楚天台 ==================== */
function mkChutiantai(g, x, z, ground, rot) {
  // 高台 + 三层楼阁
  const plat = pedestal(38, 30, 8, '#b8b2a2');
  plat.position.set(x, ground, z);
  plat.rotation.y=rot;
  g.add(plat);
  const pav = storiedPavilion({
    floors: [{ w: 24, d: 17, h: 7 }, { w: 20, d: 14, h: 6 }, { w: 16, d: 11, h: 5.5 }],
    eaveW: 28,
    topRoof: 9.5,
    topType: 'jian',
    finial: true,
    postColor: '#8e2f22',
    wallColor: '#e0d6c2',
    roofColor: '#3d5a45',
    stoneColor: '#b8b2a2',
    bays: 5,
  });
  pav.position.set(x, ground + 8, z);
  pav.rotation.y=rot;
  plaque(pav,'楚天台',5,1,0,5.4,9);
  g.add(pav);
  const court=localSite(g,x,z,ground,rot);entranceSteps(court,15,16,8,15.2);
}

/* ==================== 13. 光谷广场·星河 ==================== */
function mkXinghe(g, x, z, ground) {
  const site=localSite(g,x,z,ground);
  const silver=mat('#a8afae',{metal:.58,rough:.42,env:.75});
  put(site,UNIT.cyl,mat('#8d9090',{rough:.94}),{scale:[190,.8,190]});
  const plinth=new THREE.Mesh(new THREE.TorusGeometry(67,.55,6,80),mat('#b5b3a7',{rough:.9}));
  plinth.rotation.x=Math.PI/2;plinth.position.y=.85;site.add(plinth);
  for(let i=0;i<5;i++) {
    const pts=[];
    for(let k=0;k<=48;k++) {
      const t=k/48,a=i*Math.PI*2/5+t*Math.PI*1.35,r=64-45*Math.sin(t*Math.PI);
      pts.push(new THREE.Vector3(Math.cos(a)*r,.8+34.2*Math.sin(t*Math.PI),Math.sin(a)*r));
    }
    const ribbon=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),64,.8,8,false),silver);
    ribbon.name='spiral-sculpture';site.add(ribbon);
  }
}

/* ==================== 14. 归元寺 ==================== */
function mkGuiyuan(g, x, z, ground, rot) {
  const site=localSite(g,x,z,ground,rot);
  const stone=mat('#c8bea6',{rough:.92});
  put(site,UNIT.box,stone,{scale:[104,.35,132]});
  const hall=chineseHall({w:26,d:18,pedestalH:2.4,bodyH:8.5,roofRise:6,roofType:'gable-hip',
    stoneColor:'#cfc9b8',postColor:'#8e2f22',wallColor:'#d8cdb8',roofColor:'#3a4045',bays:5});
  hall.position.set(0,.35,-42);site.add(hall);
  const pav=storiedPavilion({floors:[{w:16,d:12,h:5.5},{w:13,d:10,h:4.5}],eaveW:19,topRoof:5,
    topType:'gable-hip',finial:false,postColor:'#8e2f22',wallColor:'#d8cdb8',roofColor:'#3a4045',bays:5});
  pav.position.set(-32,.35,-8);site.add(pav);
  const side=localSite(site,34,-8,.35);
  put(side,UNIT.box,stone,{scale:[14,8,40]});facade(side,{w:14,d:40,h:8,floors:1,bays:3});
  const roof=gableRoof({w:18,d:44,rise:3.4,color:'#3a4045'});roof.position.y=8;side.add(roof);
  const gate=chineseHall({w:18,d:7,pedestalH:1,bodyH:5,roofRise:3.2,roofType:'gable',rails:false,
    wallColor:'#d8cdb8',roofColor:'#3a4045',bays:3});gate.position.set(0,.35,56);site.add(gate);
  plaque(gate,'归元禅寺',5,1,0,5.8,4.2);
  for(const xx of [-51,51]) put(site,UNIT.box,stone,{pos:[xx,.35,0],scale:[.8,3.2,132]});
  put(site,UNIT.box,stone,{pos:[0,.35,-65],scale:[104,3.2,.8]});
  for(const xx of [-32,32]) put(site,UNIT.box,stone,{pos:[xx,.35,65],scale:[39,3.2,.8]});
  const bronze=mat('#65664b',{rough:.7,metal:.3});
  put(site,UNIT.cyl,bronze,{pos:[0,.35,0],scale:[3.6,1.8,3.6]});
  put(site,UNIT.cyl,bronze,{pos:[0,2.15,0],scale:[4.4,.3,4.4]});
  entranceSteps(site,16,7,2.75,-29);
}

/* ==================== 15. 古琴台 ==================== */
function mkGuqintai(g, x, z, ground, rot) {
  const site=localSite(g,x,z,ground,rot);
  site.add(pedestal(18,14,1.6,'#cfc9b8'));
  const wood=mat('#813b2c',{rough:.87});
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3;
    put(site,UNIT.cyl,wood,{pos:[Math.cos(a)*4.4,1.6,Math.sin(a)*4.4],scale:[.7,4.6,.7]});
  }
  const positions=[],uvs=[],indices=[],rings=10;
  for(let j=0;j<=rings;j++) for(let i=0;i<=6;i++) {
    const t=j/rings,r=6.8*(1-t),a=i*Math.PI/3;
    const yy=6.2+2.65*Math.pow(t,1.65)+.36*Math.pow(1-t,8);
    positions.push(Math.cos(a)*r,yy,Math.sin(a)*r);uvs.push(Math.cos(a)*r/.75,Math.sin(a)*r/1.6);
    if(j<rings&&i<6){const p=j*7+i;indices.push(p,p+8,p+7,p,p+1,p+8);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();
  site.add(new THREE.Mesh(geo,tileMaterial('#424740')));
  put(site,UNIT.sphere,mat('#89754b',{rough:.8}),{pos:[0,8.9,0],scale:[.35,.35,.35]});
  put(site,UNIT.box,wood,{pos:[0,6,4.5],scale:[8.7,.3,.35]});plaque(site,'古琴台',2.8,.7,0,5.3,4.72);
  put(site,UNIT.box,mat('#b8b2a2',{rough:.95}),{pos:[0,1.6,0],scale:[3,.7,1.2]});
  for(const xx of [-1,1]) put(site,UNIT.box,wood,{pos:[xx,1.6,0],scale:[.25,.7,1]});
  entranceSteps(site,8,4,1.6,7.2);
}

/* ==================== 16. 昙华林(教堂 + 老宅) ==================== */
function mkTanhualin(g, x, z, ground, rot) {
  const rand = makeRandom(1861);
  // 教堂(罗马式:巴西利卡 + 钟塔)
  const church = new THREE.Group();
  const cw = mat('#d8d0be', { rough: 0.9 });
  put(church, UNIT.box, cw, { pos: [0, 0, 0], scale: [10, 9, 22] });
  const roofC = gableRoof({ w: 12, d: 24, rise: 3.6, color: '#5a5248' });
  roofC.position.y = 9;
  church.add(roofC);
  put(church, UNIT.box, cw, { pos: [0, 0, 13], scale: [7, 15, 7] });
  put(church, UNIT.cone4, mat('#4a4440'), { pos: [0, 15, 13], scale: [8, 7, 8], rot: Math.PI / 4 });
  put(church, UNIT.box, mat('#5a5248'), { pos: [0, 22.4, 13], scale: [0.5, 2.5, 0.5] });
  facade(church,{w:10,d:22,h:9,floors:1,bays:3,trim:'#b9ae97'});
  const belfry=localSite(church,0,13,0);
  facade(belfry,{w:7,d:7,h:15,floors:3,bays:2,trim:'#c5baa4'});
  put(church,UNIT.box,mat('#524941'),{pos:[0,23.3,13],scale:[2,.3,.5]});
  church.position.set(x, ground, z);
  church.rotation.y = rot;
  g.add(church);
  // 老宅街屋(青砖 + 红砖混合)
  const items = [];
  for (let i = 0; i < 14; i++) {
    const d = (i - 6.5) * 42;
    const side = i % 2 ? 1 : -1;
    const px = x + Math.cos(rot) * d + Math.sin(rot) * side * 26;
    const pz = z - Math.sin(rot) * d + Math.cos(rot) * side * 26;
    if(!dryBuilding(px,pz,20,16,rot))continue;
    items.push({
      x: px, z: pz, y: Math.max(terrainHeight(px, pz), 0), w: 18, h: 6 + rand() * 5, d: 14,
      rot: rot + (rand() - 0.5) * 0.1,
      tint: ['#7a6a58', '#a45c48', '#c9bda8', '#8a8070'][(rand() * 4) | 0],
    });
  }
  const houses = instancedBoxes(items, mat('#ffffff', { rough: 0.95 }), { uvU: 18, uvV: 8 });
  if (houses) g.add(houses);
  for(const house of items) {
    const detail=localSite(g,house.x,house.z,house.y,house.rot);
    facade(detail,{w:18,d:14,h:house.h,floors:2,bays:4,trim:'#bdb19b'});
    const roof=gableRoof({w:20,d:16,rise:2,color:'#56554b',segX:8,segZ:6});roof.position.y=house.h;detail.add(roof);
    put(detail,UNIT.box,mat('#655642'),{pos:[0,2.8,7.5],scale:[16,.2,1.2]});
  }
}

/* ==================== 17. 辛亥革命红楼 ==================== */
function mkHonglou(g, x, z, ground, rot) {
  const red = mat('#9a3b2c', { rough: 0.9 });
  // 主楼两层 + 门廊柱式 + 红瓦四坡顶
  put(g, UNIT.box, red, { pos: [x, ground, z], scale: [40, 11, 16], rot });
  const roof = hipRoof({ w: 44, d: 20, rise: 4.2, ridgeLen: 18, color: '#7a3020', ridge: true, segX: 12, segZ: 10 });
  roof.position.set(x, ground + 11, z);
  roof.rotation.y = rot;
  g.add(roof);
  // 门廊(8 柱)
  const cols = [];
  for (let i = 0; i < 8; i++) {
    const off = -14 + i * 4;
    cols.push({
      x: x + Math.cos(rot) * off + Math.sin(rot) * 9,
      z: z - Math.sin(rot) * off + Math.cos(rot) * 9,
      y: ground - 0.4, w: 1.4, h: 10.4, d: 1.4,
    });
  }
  const cm = instancedBoxes(cols, mat('#d8d2c0', { rough: 0.8 }), { uvU: 4, uvV: 10 });
  if (cm) g.add(cm);
  put(g, UNIT.box, mat('#8a3526'), {
    pos: [x + Math.sin(rot) * 9, ground + 10, z + Math.cos(rot) * 9], scale: [32, 1.4, 5], rot,
  });
  const center=localSite(g,x,z,ground,rot);
  facade(center,{w:40,d:16,h:11,floors:2,bays:10,trim:'#d4c8b0'});
  plaque(center,'武昌起义纪念馆',10,1.1,0,9,11.7);
  entranceSteps(center,20,6,1,11.7);
  // 两侧翼楼
  for (const side of [-1, 1]) {
    put(g, UNIT.box, red, {
      pos: [x + Math.cos(rot) * 34 * side, ground, z - Math.sin(rot) * 34 * side], scale: [24, 9, 13], rot,
    });
    const wing=localSite(g,x+Math.cos(rot)*34*side,z-Math.sin(rot)*34*side,ground,rot);
    facade(wing,{w:24,d:13,h:9,floors:2,bays:6,trim:'#d4c8b0'});
    const roof=hipRoof({w:26,d:15,rise:3,ridgeLen:14,color:'#713d2c',segX:10,segZ:8});roof.position.y=9;wing.add(roof);
  }
}

/* ==================== 汇总 ==================== */
const BUILDERS = {
  huanghelou: mkHuangelou,
  tvtower: mkTvtower,
  qingchuan: mkQingchuan,
  jianghanguan: mkJianghanguan,
  street: mkJianghanlu,
  jiangtan: mkJiangtan,
  museum: mkMuseum,
  hanjie: mkHanjie,
  lantern: mkLantern,
  supertall: mkGreenland,
  whu: mkWhu,
  chutiantai: mkChutiantai,
  xinghe: mkXinghe,
  guiyuan: mkGuiyuan,
  guqintai: mkGuqintai,
  tanhualin: mkTanhualin,
  honglou: mkHonglou,
};

export function buildLandmarks() {
  const group = new THREE.Group();
  group.name = 'landmarks';
  for (const lm of LANDMARKS) {
    const fn = BUILDERS[lm.model];
    if (!fn) continue;
    const [x, z] = landmarkAnchor(lm);
    const ground = groundAt(x, z);
    const rot = lm.params?.rot != null ? bearingToRot(lm.params.rot) : 0;
    const sub = new THREE.Group();
    sub.name = 'lm:' + lm.id;
    sub.userData.lm = lm;
    sub.userData.anchor = [x,z];
    sub.userData.viewRotation = rot + (lm.model === 'museum' ? Math.PI / 2 : 0);
    fn(sub, x, z, ground, rot);
    sub.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    sub.updateWorldMatrix(true,true);
    const bounds=new THREE.Box3().setFromObject(sub);
    sub.userData.bounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
    group.add(sub);
  }
  return {
    group,
    setNight(nk) {
      // userData.nightGlow 标记的材质随夜色点亮(黄鹤楼金顶/汉秀红灯笼/江汉关钟面)
      group.traverse((o) => {
        if (o.isMesh && o.material?.emissive && o.material.userData && 'nightGlow' in o.material.userData) {
          o.material.emissiveIntensity = o.material.userData.nightGlow * nk;
        }
      });
    },
  };
}
