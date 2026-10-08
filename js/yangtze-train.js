// Procedural green passenger consist: one locomotive and seven coaches.
// Local +Z points forward; wheel treads touch local Y=0.
import * as THREE from 'three';
import { mat, put, UNIT, mergeStaticMeshes } from './lib.js';

export const TRAIN_SPACING = 24;
export const TRAIN_CARS = 8;

export function buildTrainModels() {
  const paint=mat('#31574c',{rough:.68,metal:.16});
  const cream=mat('#c9c4a5',{rough:.78,metal:.06});
  const glass=mat('#203941',{rough:.25,metal:.24});
  const roof=mat('#85918a',{rough:.74,metal:.18});
  const dark=mat('#2c3333',{rough:.85,metal:.22});
  const lamp=mat('#ddd9bc',{rough:.4,emissive:'#e9d5a3',emissiveIntensity:.45});
  const owned=new Set();
  const wheel=new THREE.CylinderGeometry(.44,.44,.16,8).rotateZ(Math.PI/2);owned.add(wheel);
  const hub=new THREE.CircleGeometry(.18,8);owned.add(hub);
  const models={};
  const box=(g,m,x,y,z,w,h,d)=>put(g,UNIT.box,m,{pos:[x,y,z],scale:[w,h,d]});
  const panel=(g,m,side,offset,y,z,h,d)=>{
    const geo=new THREE.PlaneGeometry(d,h);owned.add(geo);
    put(g,geo,m,{pos:[side*offset,y+h/2,z],rot:side*Math.PI/2});
  };
  const solid=(g,m,outline,length,z=0)=>{
    const shape=new THREE.Shape();outline.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    const geo=new THREE.ExtrudeGeometry(shape,{depth:length,steps:1,bevelEnabled:false}).translate(0,0,z-length/2);
    owned.add(geo);put(g,geo,m,{});
  };
  const runningGear=(g,locomotive)=>{
    box(g,dark,0,.83,0,2.7,.35,21.3);
    box(g,dark,0,.54,-1.7,1.4,.35,4.5);
    box(g,roof,0,.63,2.5,1.6,.26,2.0);
    for(const bogie of [-7.4,7.4]) {
      box(g,dark,0,.45,bogie,1.95,.35,3.0);
      for(const side of [-1,1]) {
        box(g,roof,side*.98,.42,bogie,.14,.15,2.7);
        for(const axle of [-.95,.95]) {
          // Axle/tread centres coincide with the bridge's 1.435 m gauge.
          put(g,wheel,dark,{pos:[side*.7175,.44,bogie+axle]});
          put(g,hub,roof,{pos:[side*.803,.44,bogie+axle],rot:side*Math.PI/2});
          box(g,dark,side*.98,.49,bogie+axle,.22,.27,.4);
        }
      }
    }
    for(const end of [-1,1]) {
      box(g,dark,0,1.04,end*11.55,.3,.24,.9);
      box(g,dark,0,1.01,end*11.9,.5,.29,.2);
      if(!locomotive) {
        box(g,dark,0,1.2,end*11.45,1.03,2.43,.9);
        for(const side of [-1,1])for(const z of [11.2,11.45,11.7])box(g,roof,side*.525,1.25,end*z,.04,2.3,.065);
        box(g,cream,0,1.28,end*11.19,.78,2.26,.045);
        box(g,glass,0,2.37,end*11.22,.51,.74,.025);
      }
    }
  };
  const coach=new THREE.Group();coach.name='coach';models.coach=coach;
  solid(coach,paint,[[-1.38,1.1],[1.38,1.1],[1.55,1.3],[1.55,3.8],[-1.55,3.8],[-1.55,1.3]],22);
  const roofProfile=[[-1.55,3.79],[1.55,3.79]];
  for(let i=0;i<=8;i++){const a=i*Math.PI/8;roofProfile.push([1.57*Math.cos(a),3.87+.48*Math.sin(a)]);}
  solid(coach,roof,roofProfile,22.1);
  runningGear(coach,false);
  for(const side of [-1,1]) {
    panel(coach,cream,side,1.557,2.3,0,1.24,21.5);
    panel(coach,cream,side,1.557,1.57,0,.075,21.7);
    for(let i=0;i<10;i++) {
      const z=-8.1+i*1.8;
      panel(coach,roof,side,1.58,2.43,z,.99,1.33);
      panel(coach,glass,side,1.603,2.49,z,.86,1.21);
      panel(coach,cream,side,1.622,2.94,z,.034,1.21);
    }
    for(const z of [-9.87,9.87]) {
      panel(coach,roof,side,1.578,1.23,z,2.45,.96);
      panel(coach,paint,side,1.603,1.29,z,2.33,.84);
      panel(coach,glass,side,1.624,2.48,z,.78,.59);
      box(coach,cream,side*1.642,2.11,z-.28,.025,.17,.06);
      box(coach,dark,side*1.46,.63,z,.45,.13,.85);
      box(coach,roof,side*1.5,.82,z,.38,.1,.85);
    }
  }
  for(const z of [-7,-3.5,0,3.5,7])box(coach,roof,0,4.3,z,.42,.13,.6);

  const loco=new THREE.Group();loco.name='locomotive';models.locomotive=loco;
  const sideProfile=[[-10.8,1.1],[11,1.1],[11,3.15],[10.4,4.2],[8.0,4.2],[7.5,3.8],[-10.8,3.8]];
  const shape=new THREE.Shape();sideProfile.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();
  const shell=new THREE.ExtrudeGeometry(shape,{depth:3.1,steps:1,bevelEnabled:false}).translate(0,0,-1.55).rotateY(Math.PI/2);
  owned.add(shell);put(loco,shell,paint,{});
  solid(loco,roof,roofProfile,18.2,-1.7);
  runningGear(loco,true);
  for(const side of [-1,1]) {
    box(loco,cream,side*1.563,2.47,-.5,.025,.48,20.5);
    box(loco,cream,side*1.563,1.51,0,.025,.08,21.2);
    box(loco,roof,side*1.568,1.28,7.0,.04,2.5,.93);
    box(loco,paint,side*1.6,1.34,7.0,.025,2.38,.81);
    box(loco,glass,side*1.58,3.08,9.2,.028,.89,1.6);
    box(loco,glass,side*1.625,2.82,7.0,.025,.58,.58);
    for(const z of [-7.2,-3.8,-.4,3.0]) {
      box(loco,dark,side*1.58,3.02,z,.034,.61,2.3);
      for(let i=0;i<4;i++)box(loco,roof,side*1.604,3.1+i*.12,z,.025,.035,2.2);
    }
    const windshield=new THREE.PlaneGeometry(1.1,.77);owned.add(windshield);
    put(loco,windshield,glass,{pos:[side*.67,3.62,10.755],rotX:-Math.atan2(.6,1.05)});
    box(loco,roof,side*.67,3.27,10.99,.75,.04,.035);
    box(loco,lamp,side*1.06,1.85,11.04,.34,.26,.07);
    box(loco,dark,side*.95,1.25,11.05,.44,.17,.12);
    box(loco,roof,side*1.48,3.92,8.77,.035,.055,2.1);
  }
  box(loco,cream,0,2.47,11.025,3.05,.48,.04);
  box(loco,dark,0,1.22,11.12,2.5,.28,.12);
  box(loco,lamp,0,4.05,10.45,.38,.12,.09);
  for(const z of [-5.5,0,4.5]) {
    box(loco,dark,0,4.32,z,1.25,.16,1.2);
    for(let i=0;i<5;i++)box(loco,roof,-.5+i*.25,4.48,z,.04,.025,1.1);
  }
  for(const model of Object.values(models)) {
    mergeStaticMeshes(model);
    for(const mesh of model.children){mesh.name=model.name+':'+mesh.material.color.getHexString();mesh.castShadow=true;mesh.receiveShadow=true;}
  }
  // The merged meshes own their new buffers. UNIT and cached materials stay shared.
  for(const geometry of owned)geometry.dispose();
  return models;
}

export function buildYangtzeTrain(info,railY,start,end,group,updates) {
  const prototypes=buildTrainModels(),train=new THREE.Group();train.name='yb-train';group.add(train);
  const length=info.L*(end-start),cycle=length+TRAIN_CARS*TRAIN_SPACING+28;
  const centre=new THREE.Vector3(info.ax+info.dx*info.L*(start+end)/2,railY((start+end)/2)+2.5,info.az+info.dz*info.L*(start+end)/2);
  for(const [role,prototype] of Object.entries(prototypes))for(const piece of prototype.children) {
    const mesh=new THREE.InstancedMesh(piece.geometry,piece.material,role==='coach'?7:1);
    mesh.name='yb-train:'+piece.name;mesh.userData.role=role;
    mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.boundingSphere=new THREE.Sphere(centre.clone(),length/2+32);
    train.add(mesh);
  }
  const dummy=new THREE.Object3D(),speed=18;let head=length*.45,paused=false;
  const sample=(along,target,across=3.25,height=0)=>{
    const t=start+along/info.L;
    return target.set(info.ax+info.dx*info.L*t+info.px*across,railY(t)+.33+height,info.az+info.dz*info.L*t+info.pz*across);
  };
  const render=()=>{
    let coaches=0,locomotives=0;
    for(let i=0;i<TRAIN_CARS;i++) {
      const along=head-i*TRAIN_SPACING;
      if(along<12||along>length-12)continue;
      const t=start+along/info.L,t2=Math.min(end,t+.001),role=i===0?'locomotive':'coach';
      sample(along,dummy.position);
      dummy.rotation.set(-Math.atan2(railY(t2)-railY(t),(t2-t)*info.L),info.bearing,0,'YXZ');dummy.updateMatrix();
      const slot=i===0?locomotives++:coaches++;
      for(const mesh of train.children)if(mesh.userData.role===role)mesh.setMatrixAt(slot,dummy.matrix);
    }
    for(const mesh of train.children){mesh.count=mesh.userData.role==='coach'?coaches:locomotives;mesh.instanceMatrix.needsUpdate=true;}
  };
  const update=dt=>{
    if(paused)return;
    head=(head+Math.max(0,dt)*speed)%cycle;
    render();
  };
  // Opening films share this track frame and can seek without waiting for a render tick.
  train.userData.motion={
    length,cycle,speed,
    getHead:()=>head,
    setHead(distance){
      if(!Number.isFinite(distance))throw new TypeError('Train head distance must be finite');
      head=((distance%cycle)+cycle)%cycle;
      render();
    },
    getPaused:()=>paused,
    setPaused(value){paused=Boolean(value);},
    sample,
  };
  update(0);updates.push(update);return train;
}
