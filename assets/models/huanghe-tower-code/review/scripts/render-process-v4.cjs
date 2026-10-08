// Deterministic 1080p rendering: exactly 720 frames, without wall-clock frame drops.
const {chromium}=require('/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),{spawn}=require('child_process'),{once}=require('events');
const dir=path.resolve(__dirname,'..'),root=path.resolve(dir,'../../../..');
const ffmpeg=process.env.FFMPEG_PATH||path.join(root,'yellow-crane-tower-refined-20261007/video/runtime/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1');
const errors=[];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 let encoder;
 try {
  const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8140/assets/models/huanghe-tower-code/review.html');await page.waitForFunction(()=>window.__ready);
  const timing=JSON.parse(fs.readFileSync(path.join(dir,'timing.json'),'utf8'));
  const seconds=Math.round((new Date(timing.modeling_finished_utc)-new Date(timing.modeling_started_utc))/1000);
  await page.evaluate(async timeLabel=>{
   const {createProcessFilm}=await import('./review/process-film.js');
   window.__film=createProcessFilm(window.__review,document.getElementById('video'),document.querySelector('.photo'),timeLabel);
   window.__film.frame(0);
  },`${Math.floor(seconds/60)} 分 ${seconds%60} 秒`);
  const sampleTimes=[0,2.8,4.9,7.8,10,15.2,18.5,20.5,22,27,29.9];
  for(const t of sampleTimes){
   const data=await page.evaluate(t=>{window.__film.frame(t);return document.getElementById('video').toDataURL('image/png').split(',')[1]},t);
   fs.writeFileSync(path.join(dir,`screenshots/v4-preview-${t}s.png`),Buffer.from(data,'base64'));
  }
  const verification=await page.evaluate(()=>({
   camera:[18.999,19,19.001,21.999,22,22.001,30].map(t=>({t,...window.__film.orbitAt(t)})),
   finiteMorphs:window.__film.transition.pairs.every(pair=>pair.every(root=>root.children.every(mesh=>mesh.geometry.morphAttributes.position[0].array.every(Number.isFinite)))),
   layout:[19,20,21,22].map(t=>window.__film.frame(t)),width:1920,height:1080,fps:24,duration:30
  }));
  verification.errors=errors;fs.writeFileSync(path.join(dir,'verification-v4-render.json'),JSON.stringify(verification,null,2));
  if(errors.length)throw Error(errors.join('\n'));
  if(process.env.HHL_CAPTURE_ONLY==='1'){console.log('Preview frames and continuity checks saved.');return;}
  const output=path.join(dir,'optimization-process-v4.mp4');
  encoder=spawn(ffmpeg,['-hide_banner','-y','-f','image2pipe','-vcodec','png','-framerate','24','-i','pipe:0','-an','-frames:v','720','-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',output],{stdio:['pipe','ignore','pipe']});
  const log=[];encoder.stderr.on('data',data=>log.push(data.toString()));const done=once(encoder,'close');
  for(let i=0;i<720;i++){
   const data=await page.evaluate(t=>{window.__film.frame(t);return document.getElementById('video').toDataURL('image/png').split(',')[1]},i/24);
   if(!encoder.stdin.write(Buffer.from(data,'base64')))await once(encoder.stdin,'drain');
   if(i%120===0)console.log(`Rendered ${i}/720 frames`);
  }
  encoder.stdin.end();const [code]=await done;fs.writeFileSync(path.join(root,'.tmp/hhl-v4/encode.log'),log.join(''));
  if(code!==0||errors.length)throw Error(`Encoding failed ${code}: ${errors.join('; ')} ${log.join('').slice(-1000)}`);
  console.log(`Saved ${output} (${fs.statSync(output).size} bytes), 720 frames / 24 fps / 30 s.`);
 }finally{if(encoder&&!encoder.killed&&encoder.exitCode===null)encoder.kill();await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
