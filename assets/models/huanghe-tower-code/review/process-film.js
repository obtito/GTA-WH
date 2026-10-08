// Presentation only: saved code-model geometry and the final orbit stay unchanged.
import {createProgressiveTransition, ease, orbitAt} from './morph-transition.js';

export function createProcessFilm({views, roots, THREE}, canvas, photo, timeLabel) {
  const W = 1920, H = 1080, DURATION = 30;
  const palette = {paper:'#eae7de', ink:'#243734', muted:'#758079', gold:'#a68150', line:'#d0cec4'};
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d');
  const lerp=THREE.MathUtils.lerp;
  const ramp=(t,a,b)=>ease((t-a)/(b-a));
  // A procedural contact shadow grounds the tower without a horizon or hard cast shadow.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
  const sc=shadowCanvas.getContext('2d'),gradient=sc.createRadialGradient(64,64,4,64,64,64);
  gradient.addColorStop(0,'rgba(86,80,60,.22)');gradient.addColorStop(.45,'rgba(86,80,60,.10)');gradient.addColorStop(1,'rgba(86,80,60,0)');
  sc.fillStyle=gradient;sc.fillRect(0,0,128,128);
  const shadowTexture=new THREE.CanvasTexture(shadowCanvas);
  for(const view of views){
    for(const obj of [...view.scene.children])if(obj!==view.root)view.scene.remove(obj);
    view.scene.background=new THREE.Color(palette.paper);
    view.renderer.setSize(1080,1080,false);view.renderer.setPixelRatio(1);
    view.renderer.shadowMap.enabled=false;view.renderer.toneMappingExposure=1.05;
    view.camera.aspect=1;view.camera.updateProjectionMatrix();
    view.scene.add(new THREE.HemisphereLight('#fffaf0','#b5b7a4',2.1));
    const key=new THREE.DirectionalLight('#fff2dc',2.7);key.position.set(-40,70,60);view.scene.add(key);
    const fill=new THREE.DirectionalLight('#e0ecf7',1.3);fill.position.set(50,25,-35);view.scene.add(fill);
    const contact=new THREE.Mesh(new THREE.PlaneGeometry(78,78),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false}));
    contact.rotation.x=-Math.PI/2;contact.position.y=-.035;view.scene.add(contact);
  }
  const transition=createProgressiveTransition(views[1],roots);
  views[0].scene.remove(views[0].root);views[0].root=transition.direct[0].clone(true);views[0].scene.add(views[0].root);
  const stages=[
    {start:2.4,end:7.9,code:'01  /  STRUCTURE',title:['重塑楼体','与层级关系'],body:['规则八角平面逐渐展开为折角方形。','重建五层比例与四面骑楼。'],detail:'轮廓、层高与屋面同步演变'},
    {start:7.9,end:12.9,code:'02  /  DETAIL',title:['补入瓦垄','与回廊细部'],body:['栏杆、斗拱和门窗逐渐融入。','让红柱、绿枋与金色屋面建立层次。'],detail:'瓦垄 · 回纹栏杆 · 彩绘额枋'},
    {start:12.9,end:18,code:'03  /  ROOFLINE',title:['校正飞檐','与山花轮廓'],body:['沿屋面逐渐抬升檐角。','合并实例、简化曲面，保留建筑层次。'],detail:'檐线渐变 · 几何与绘制开销优化'},
    {start:18,end:22,code:'04  /  REVIEW',title:['从实景观察','回到整体对照'],body:['楼体、飞檐与细节完成三轮迭代。',`代码几何优化实际历时 ${timeLabel}。`],detail:'保存阶段之间的连续演变回放'}
  ];
  function text(s,x,y,size=24,color=palette.ink,weight=400,serif=false){ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${serif?'"Songti SC", "STSong", serif':'"PingFang SC", sans-serif'}`;ctx.fillText(s,x,y);}
  function rule(x,y,w,color=palette.gold){ctx.fillStyle=color;ctx.fillRect(x,y,w,2);}
  function alpha(a,draw){if(a<=0)return;ctx.save();ctx.globalAlpha=a;draw();ctx.restore();}
  function model(view,x,y,size,opacity=1){alpha(opacity,()=>ctx.drawImage(view.renderer.domElement,x,y,size,size));}
  function cameraAt(view,yaw,height){view.camera.position.set(Math.sin(yaw)*127,height,Math.cos(yaw)*127);view.camera.lookAt(0,24,0);}
  function phaseCopy(t){
    for(let i=0;i<stages.length;i++){
      const s=stages[i],a=ramp(t,s.start,s.start+.6)*(1-ramp(t,s.end-.4,s.end));
      alpha(a*(1-ramp(t,19.3,20.5)),()=>{
        const x=80,dy=(1-a)*12;
        text(s.code,x,298+dy,18,palette.gold,500);rule(x,325+dy,60);
        text(s.title[0],x,400+dy,48,palette.ink,500,true);
        text(s.title[1],x,468+dy,48,palette.ink,500,true);
        s.body.forEach((line,n)=>text(line,x,548+n*42+dy,25,palette.muted));
        text(s.detail,x,683+dy,19,palette.gold);
        const state=transition.stageAt(t);
        if(state.pair!==undefined){rule(x,728+dy,340,palette.line);rule(x,728+dy,340*state.progress);text(`${Math.round(state.progress*100).toString().padStart(2,'0')}%`,x+363,734+dy,17,palette.gold);}
      });
    }
  }
  function frame(time){
    const t=THREE.MathUtils.clamp(time,0,DURATION),orbit=orbitAt(t),split=ramp(t,19,22);
    for(const view of views)cameraAt(view,orbit.yaw,orbit.height);
    const state=transition.renderAt(t);
    if(split>0)views[0].renderer.render(views[0].scene,views[0].camera);
    ctx.fillStyle=palette.paper;ctx.fillRect(0,0,W,H);
    // The model image moves and shrinks continuously before the preserved 22–30 s orbit.
    model(views[1],lerp(930,1050,split),lerp(120,190,split),lerp(820,740,split));
    model(views[0],lerp(-40,130,split),190,740,split);
    text('YELLOW CRANE TOWER  /  CODE STUDY',76,48,17,palette.gold,500);
    text('黄鹤楼 · 从代码到形制',76,115,52,palette.ink,500,true);
    text('实景参考 · 三轮迭代 · 连续演变',78,157,21,palette.muted);
    ctx.textAlign='right';text('武汉 · 中国',1844,68,19,palette.muted);text('2026.10.07',1844,100,17,palette.muted);ctx.textAlign='left';
    const intro=1-ramp(t,2.1,2.9);
    alpha(intro,()=>{
      const x=80,y=231,w=420,h=560;
      ctx.save();ctx.shadowColor='rgba(55,57,45,.10)';ctx.shadowBlur=22;ctx.shadowOffsetY=9;ctx.fillStyle='#f5f2e9';ctx.fillRect(x-9,y-9,w+18,h+62);ctx.restore();
      ctx.drawImage(photo,x,y,w,h);
      text('实景参照',x+8,y+h+35,20,palette.ink,500,true);
      text('从真实轮廓出发',80,884,23,palette.muted);
    });
    phaseCopy(t);
    alpha(1-ramp(t,19,20),()=>{ctx.textAlign='center';text(t<2.4?'待优化代码基线':'旋转中连续迭代',1340,225,20,palette.muted);ctx.textAlign='left';});
    alpha(ramp(t,21.5,22),()=>{
      ctx.textAlign='center';text('优化前',500,246,25,palette.ink,500,true);text('优化后',1420,246,25,palette.ink,500,true);
      text('规则八角塔 · 代码基线',500,280,17,palette.muted);text('折角楼体 · 复合飞檐 · 回廊细部',1420,280,17,palette.muted);ctx.textAlign='left';
    });
    alpha(split,()=>{ctx.fillStyle=palette.line;ctx.fillRect(960,318,1,541);});
    ctx.textAlign='center';
    const caption=t<2.4?'以真实照片为参照，观察体量与屋檐的关系':t<18?'旋转不中断，结构与细节逐渐成形':t<22?'由单塔演变，平滑展开为前后对照':`几何优化 ${timeLabel}  ·  纯代码生成  ·  同步多角度对照`;
    text(caption,960,946,23,palette.ink);ctx.textAlign='left';
    rule(76,991,1768,palette.line);rule(76,991,1768*t/DURATION);
    text('阶段回放 · 实景照片 MonsieurRoi / CC BY-SA 3.0 · 尺寸与未见背面为参考推定',76,1030,16,palette.muted);
    ctx.textAlign='right';text(`${Math.min(30,Math.floor(t)).toString().padStart(2,'0')} / 30 s`,1844,1030,17,palette.muted);ctx.textAlign='left';
    return {time:t,split,orbit,...state};
  }
  return {frame,transition,orbitAt,width:W,height:H,duration:DURATION,fps:24};
}
