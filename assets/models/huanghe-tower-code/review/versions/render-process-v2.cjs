const {chromium}=require('/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const fs=require('fs');const path=require('path');
const dir='/Users/Admin/Desktop/gta-wh/assets/models/huanghe-tower-code/review';
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{const page=await browser.newPage({viewport:{width:1680,height:900},deviceScaleFactor:1});page.on('pageerror',e=>console.error('PAGEERROR',e.message));await page.goto('http://127.0.0.1:8140/assets/models/huanghe-tower-code/review.html');await page.waitForFunction(()=>window.__ready);
const info=await page.evaluate(()=>{const {roots,THREE}=window.__review;return roots.map(root=>{let triangles=0,meshes=0;root.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);meshes++;}});return{triangles,meshes,bounds:new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray()};});});fs.writeFileSync(dir+'/stats.json',JSON.stringify(info,null,2));
const timing=JSON.parse(fs.readFileSync(dir+'/timing.json','utf8'));const secs=Math.round((new Date(timing.modeling_finished_utc)-new Date(timing.modeling_started_utc))/1000);const timeLabel=`${Math.floor(secs/60)} 分 ${secs%60} 秒`;
console.log('Recording 30-second stage replay; modeling wall time:',timeLabel,'stats:',info[3]);
const video=await page.evaluate(async({timeLabel,triangles,meshes})=>{
 const {views,roots,angle,render}=window.__review;const canvas=document.getElementById('video'),ctx=canvas.getContext('2d');const photo=document.querySelector('.photo');document.body.classList.add('video-mode');
 const clips=[{end:3,before:0,after:0,kicker:'01 / 照片诊断',title:'从规则八角塔，转向实景结构',beforeLabel:'优化前代码模型',afterLabel:'待优化基线',notes:'观察差异：楼体折角、四面骑楼、复合飞檐、砖红栏杆'},
 {end:8,before:0,after:1,kicker:'02 / 第 1 轮 · 结构',title:'重建折角方形楼体与四面骑楼',beforeLabel:'优化前 · 规则八角塔',afterLabel:'第 1 轮 · 楼体与飞檐',notes:'五层楼体重新配比；屋面由主坡面和四向骑楼组合'},
 {end:13,before:0,after:2,kicker:'03 / 第 2 轮 · 细节',title:'补入瓦垄、栏杆、斗拱与彩绘',beforeLabel:'优化前代码模型',afterLabel:'第 2 轮 · 细节',notes:'增加回纹栏杆、绿色额枋、门窗格栅、入口雨棚和匾额'},
 {end:18,before:0,after:3,kicker:'04 / 第 3 轮 · 校正与优化',title:'抬升飞檐，匹配山花板轮廓',beforeLabel:'优化前代码模型',afterLabel:'最终 · 檐口与性能',notes:'简化瓦垄曲面并合并同层实例；降低几何与绘制开销'},
 {end:22,before:0,after:3,kicker:'05 / 前后对照',title:'真实照片 · 优化前 · 最终模型',beforeLabel:'优化前代码模型',afterLabel:'最终代码模型',notes:`几何优化阶段实际历时 ${timeLabel} · 全程保留旧游戏模型`},
 {end:30,before:0,after:3,kicker:'06 / 多角度检查',title:'最终模型旋转展示',beforeLabel:'优化前代码模型',afterLabel:'最终模型 · 多角度',notes:`最终约 ${(triangles/10000).toFixed(2)} 万三角面 / ${meshes} 个网格批次 · 所有几何由代码生成`}];
 const selected=[-1,-1];function setRoot(i,idx){const v=views[i];if(selected[i]!==idx){v.scene.remove(v.root);v.root=roots[idx].clone(true);v.scene.add(v.root);selected[i]=idx}}
 function text(s,x,y,size,color='#eaf0ee',weight=400){ctx.fillStyle=color;ctx.font=`${weight} ${size}px "PingFang SC", sans-serif`;ctx.fillText(s,x,y);}
 function cameraAt(view,a,pitch){view.camera.position.set(Math.sin(a)*127,pitch,Math.cos(a)*127);view.camera.lookAt(0,24,0);view.controls.update()}
 function frame(t){const clip=clips.find(c=>t<c.end)||clips.at(-1);setRoot(0,clip.before);setRoot(1,clip.after);// 前 22 秒：基线至最终版本持续旋转，阶段切换时保留同一相机角度。
 if(t<22){cameraAt(views[0],.22,38);cameraAt(views[1],t/22*Math.PI*2,38)}
 // 最后 8 秒的共同旋转沿用第一版：相同半径、高度、速度与完整一周。
 else angle((t-22)*Math.PI/4,50);
 render();ctx.fillStyle='#172b2b';ctx.fillRect(0,0,1280,720);text(clip.kicker,28,29,17,'#adc7bb',500);text(clip.title,28,72,31,'#ffffff',600);text('阶段模型回放 · 2026.10.07 · 黄鹤楼纯代码建模',806,31,16,'#adc7bb');
 const xs=[24,432,840],w=392,y=126,h=486;
 for(const x of xs){ctx.fillStyle='#e9ede8';ctx.fillRect(x,118,w,504);}
 const ph=480,pw=ph*photo.naturalWidth/photo.naturalHeight;ctx.drawImage(photo,xs[0]+(w-pw)/2,y,pw,ph);
 for(let i=0;i<2;i++){const src=views[i].renderer.domElement;const rh=486,rw=rh*src.width/src.height;ctx.drawImage(src,xs[i+1]+(w-rw)/2,y,rw,rh);}
 for(const [i,s]of['实景参考 · MonsieurRoi',clip.beforeLabel,clip.afterLabel].entries())text(s,xs[i]+12,110,19,'#eaf0ee',500);
 text(clip.notes,28,658,21,'#f2e6bc',500);text('照片 CC BY-SA 3.0 · 尺寸与未见背面为参考推定 · 本片为保存阶段的回放',28,689,14,'#adc7bb');
 ctx.fillStyle='#486458';ctx.fillRect(0,709,1280,11);ctx.fillStyle='#d3ba73';ctx.fillRect(0,709,1280*Math.min(t/30,1),11);text(`${Math.min(30,Math.floor(t)).toString().padStart(2,'0')} / 30 秒`,1120,688,14,'#adc7bb');
 }
 window.__videoFrame=frame;frame(0);const mime='video/mp4;codecs=avc1.42E01E';if(!MediaRecorder.isTypeSupported(mime))throw Error('MP4 unavailable');const stream=canvas.captureStream(24),rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});const chunks=[];const done=new Promise((res,rej)=>{rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};rec.onerror=e=>rej(Error(e.error?.message||'record error'));rec.onstop=async()=>{const blob=new Blob(chunks,{type:'video/mp4'}),buffer=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<buffer.length;i+=32768)binary+=String.fromCharCode(...buffer.subarray(i,i+32768));res(btoa(binary));};});
 rec.start(1000);const start=performance.now();await new Promise(resolve=>{function tick(){const elapsed=(performance.now()-start)/1000;frame(elapsed);if(elapsed>=30){rec.stop();stream.getTracks().forEach(t=>t.stop());resolve();}else requestAnimationFrame(tick);}requestAnimationFrame(tick);});return await done;
},{timeLabel,...info[3]});fs.writeFileSync(dir+'/optimization-process-v2-raw.mp4',Buffer.from(video,'base64'));console.log('Raw MP4 saved:',fs.statSync(dir+'/optimization-process-v2-raw.mp4').size,'bytes');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
