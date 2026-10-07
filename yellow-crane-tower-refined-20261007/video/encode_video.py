#!/usr/bin/env python3
"""Validate every PNG, encode H.264, inspect stream, and fully decode the result."""
from pathlib import Path
import argparse,datetime,json,subprocess,sys,hashlib,time
from PIL import Image
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE/'runtime'))
import imageio_ffmpeg
parser=argparse.ArgumentParser();parser.add_argument('--frames',default='continuous');parser.add_argument('--count',type=int,default=1080);parser.add_argument('--fps',type=int,default=24);parser.add_argument('--output',default='优化过程.mp4');args=parser.parse_args()
frames=HERE/args.frames;expected=[frames/f'frame_{i:04d}.png' for i in range(1,args.count+1)];started=datetime.datetime.now(datetime.timezone.utc).isoformat()
for p in expected:
    if not p.is_file():raise RuntimeError(f'Missing frame: {p}')
    with Image.open(p) as im:
        im.load()
        if im.size!=(1920,1080):raise RuntimeError(f'Wrong dimensions: {p}, {im.size}')
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe();ffprobe=HERE/'bin'/'ffprobe';output=HERE.parent/args.output
command=[ffmpeg,'-y','-framerate',str(args.fps),'-start_number','1','-i',str(frames/'frame_%04d.png'),'-frames:v',str(args.count),'-c:v','libx264','-crf','18','-preset','medium','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-movflags','+faststart',str(output)]
encoded=subprocess.run(command,capture_output=True,text=True);(HERE/'encode.log').write_text(encoded.stderr);encoded.check_returncode()
probe=subprocess.run([str(ffprobe),'-v','error','-show_entries','stream=codec_name,width,height,r_frame_rate,nb_frames,pix_fmt,color_space,color_transfer,color_primaries:format=duration,size','-of','json',str(output)],capture_output=True,text=True);probe.check_returncode();metadata=json.loads(probe.stdout)
decoded=subprocess.run([ffmpeg,'-v','error','-i',str(output),'-f','null','-'],capture_output=True,text=True)
(HERE/'verification.log').write_text('FFPROBE\n'+probe.stdout+'\nFULL DECODE\n'+decoded.stderr+'\nreturncode='+str(decoded.returncode)+'\n')
assert decoded.returncode==0 and not decoded.stderr.strip(),'Video failed clean full decode'
s=metadata['streams'][0];assert s['width']==1920 and s['height']==1080;assert s['r_frame_rate']==f'{args.fps}/1';assert int(s['nb_frames'])==args.count;assert abs(float(metadata['format']['duration'])-args.count/args.fps)<.05
result={'verified_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'validation_started_at':started,'source':'individually rendered WebGL PNGs from actual before/after GLB assets; semantic group transform and material interpolation between versions','interpolated_geometry_presentation':True,'screen_recording':False,'all_expected_pngs_opened':True,'frame_count':args.count,'stream':metadata,'decode_returncode':decoded.returncode,'decode_stderr':decoded.stderr,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'output':str(output)}
(HERE/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2))
