// 独立黄鹤楼：全部几何现场生成，不读取模型、贴图或旧建筑构件。
import * as THREE from 'three';

export function buildYellowCraneTower() {
  const tower = new THREE.Group();
  tower.name = 'yellow-crane-code';
  tower.userData.source = 'procedural-only';
  const stone = new THREE.MeshStandardMaterial({ color: '#d2c9b5', roughness: .9 });
  const red = new THREE.MeshStandardMaterial({ color: '#963e2d', roughness: .78 });
  const cream = new THREE.MeshStandardMaterial({ color: '#dfcaa0', roughness: .9 });
  const dark = new THREE.MeshStandardMaterial({ color: '#352b25', roughness: .82 });
  const gold = new THREE.MeshStandardMaterial({ color: '#b88736', roughness: .72, metalness: 0 });
  gold.emissive.set('#76511b'); gold.emissiveIntensity = 0; gold.userData.nightGlow = .16;
  function mesh(geometry, material, x=0, y=0, z=0, parent=tower) {
    const m = new THREE.Mesh(geometry, material); m.position.set(x,y,z);
    m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  }
  function box(w,h,d,x,y,z,material,parent=tower) {
    return mesh(new THREE.BoxGeometry(w,h,d),material,x,y+h/2,z,parent);
  }
  function octagon(radius,h,y,material) {
    const m=mesh(new THREE.CylinderGeometry(radius,radius,h,8),material,0,y+h/2);
    m.rotation.y=Math.PI/8; return m;
  }
  // 八个檐面分别采样：弯曲瓦面、抬升翼角、瓦垄和连续檐边。
  function roof(outer,inner,y,rise,level) {
    const root=new THREE.Group(); root.name=`code-roof-${level}`; tower.add(root);
    const point=(side,t,u)=>{
      const a=(side-.5)*Math.PI/4,b=(side+.5)*Math.PI/4;
      const r=outer+(inner-outer)*u;
      return new THREE.Vector3(r*((1-t)*Math.sin(a)+t*Math.sin(b)),
        y+rise*u*u+.65*Math.pow(1-u,6)+1.1*Math.pow(Math.abs(2*t-1),6)*Math.pow(1-u,4),
        r*((1-t)*Math.cos(a)+t*Math.cos(b)));
    };
    function line(points,radius,material) {
      mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),8,radius,3,false),material,0,0,0,root);
    }
    for(let side=0;side<8;side++) {
      const positions=[],indices=[]; const n=10;
      for(let j=0;j<=n;j++)for(let i=0;i<=n;i++)positions.push(...point(side,i/n,j/n).toArray());
      for(let j=0;j<n;j++)for(let i=0;i<n;i++) {
        const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;
        indices.push(a,b,c,b,d,c);
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geo.setIndex(indices);geo.computeVertexNormals();mesh(geo,gold,0,0,0,root);
      line(Array.from({length:17},(_,i)=>point(side,i/16,0)),.13,gold);
      line(Array.from({length:17},(_,i)=>point(side,0,i/16)),.16,gold);
      for(let k=1;k<10;k++)line(Array.from({length:13},(_,i)=>point(side,k/10,i/12)),.045,gold);
    }
  }
  box(46,1,46,0,0,0,stone);box(41,1.2,41,0,1,0,stone);octagon(22,.8,2.2,stone);
  for(let side=0;side<4;side++) {
    const stair=new THREE.Group();stair.rotation.y=side*Math.PI/2;tower.add(stair);
    for(let i=0;i<10;i++)box(9,.3*(i+1),1.1,0,0,27-i*.65,stone,stair);
  }
  const floors=[{r:17.5,y:3,h:8.2},{r:15.4,y:11.2,h:8},{r:13.5,y:19.2,h:7.8},{r:11.8,y:27,h:7.6},{r:10.2,y:34.6,h:8}];
  floors.forEach(({r,y,h},level)=>{
    octagon(r,.45,y,stone);octagon(r*.73,h-.6,y+.45,cream);
    for(let side=0;side<8;side++) {
      const face=new THREE.Group();face.rotation.y=side*Math.PI/4;tower.add(face);
      const distance=r*Math.cos(Math.PI/8),width=2*r*Math.sin(Math.PI/8);
      for(let k=0;k<=4;k++) {
        const x=-width/2+k*width/4;
        mesh(new THREE.CylinderGeometry(.23,.29,h-.4,10),red,x,y+h/2,distance,face);
        box(.7,.25,.75,x,y+h-1,distance,cream,face);
        box(1.1,.22,.9,x,y+h-.65,distance,red,face);
      }
      box(width,.32,.4,0,y+h-.4,distance,red,face);
      for(const railY of [.35,1.25])box(width,.16,.2,0,y+railY,distance,cream,face);
      for(let k=0;k<=12;k++)box(.12,.9,.15,-width/2+k*width/12,y+.4,distance,red,face);
      const wallZ=distance*.73+.05;
      for(let k=-1;k<=1;k++) {
        box(width*.18,h*.5,.12,k*width*.23,y+2,wallZ,dark,face);
        for(let j=-1;j<=1;j++)box(.08,h*.5,.15,k*width*.23+j*width*.045,y+2,wallZ+.08,red,face);
      }
    }
    roof(r+3.2,level===4?0:r*.63,y+h-.35,level===4?5.6:2.8,level+1);
  });
  // 宝顶上端严格落在 51.4 米。
  mesh(new THREE.SphereGeometry(.95,20,14),gold,0,48.8);
  mesh(new THREE.SphereGeometry(.6,20,14),gold,0,50);
  mesh(new THREE.CylinderGeometry(.08,.13,.8,10),gold,0,51);
  if(typeof document!=='undefined') {
    const c=document.createElement('canvas');c.width=512;c.height=160;const ctx=c.getContext('2d');
    ctx.fillStyle='#25231f';ctx.fillRect(0,0,512,160);ctx.strokeStyle='#d5ad51';ctx.lineWidth=8;ctx.strokeRect(8,8,496,144);
    ctx.fillStyle='#e7c773';ctx.font='bold 108px KaiTi, STKaiti, serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('黄鹤楼',256,85);
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;
    const signMaterial=new THREE.MeshStandardMaterial({map:texture,roughness:.8});
    for(const side of [0,Math.PI]) {
      const sign=new THREE.Group();sign.rotation.y=side;tower.add(sign);
      box(5.4,1.7,.18,0,39.5,10.2*Math.cos(Math.PI/8)+.3,signMaterial,sign);
    }
  }
  return tower;
}
