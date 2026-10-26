import {describe,expect,it} from 'vitest';
import {loudnessAt,speechEnvelope,visemeAt,visemeWeightsAt} from '../../frontend/src/components/avatar-speech.js';
import {articulation,createIdleLife} from '../../frontend/src/components/avatar-face.js';

// 16-bit mono PCM WAV with a silent half second followed by a loud half second.
function wav(sampleRate=8000){
  const frames=sampleRate,data=new DataView(new ArrayBuffer(44+frames*2));
  const write=(offset:number,text:string)=>{for(let i=0;i<4;i++)data.setUint8(offset+i,text.charCodeAt(i));};
  write(0,'RIFF');data.setUint32(4,36+frames*2,true);write(8,'WAVE');write(12,'fmt ');data.setUint32(16,16,true);
  data.setUint16(20,1,true);data.setUint16(22,1,true);data.setUint32(24,sampleRate,true);data.setUint32(28,sampleRate*2,true);data.setUint16(32,2,true);data.setUint16(34,16,true);
  write(36,'data');data.setUint32(40,frames*2,true);
  for(let frame=sampleRate/2;frame<frames;frame++)data.setInt16(44+frame*2,Math.round(Math.sin(frame*.3)*20000),true);
  return new Uint8Array(data.buffer);
}

describe('audio-synchronized avatar mouth',()=>{
  const cues=[{time:0,id:0},{time:.2,id:21},{time:.4,id:2},{time:.6,id:0}];
  it('keeps the active viseme contract used by the room verifier',()=>{
    expect(visemeAt(cues,.1)).toBe('viseme_sil');expect(visemeAt(cues,.3)).toBe('viseme_PP');expect(visemeAt(cues,.45)).toBe('viseme_aa');expect(visemeAt(cues,-.1)).toBe('viseme_sil');
  });
  it('hands over between shapes and anticipates the next cue',()=>{
    const handover=visemeWeightsAt(cues,.42);
    expect(handover.get('viseme_PP')).toBeGreaterThan(0);expect(handover.get('viseme_aa')).toBeGreaterThan(0);
    expect(visemeWeightsAt(cues,.3).get('viseme_PP')).toBe(1);
    expect(visemeWeightsAt(cues,.385).get('viseme_aa')).toBeGreaterThan(0);
    expect(visemeWeightsAt(cues,.1).size).toBe(0);
  });
  it('measures loudness from the actual WAV samples',()=>{
    const envelope=speechEnvelope(wav())!;
    expect(envelope.rate).toBe(100);expect(envelope.values.length).toBe(100);
    expect(loudnessAt(envelope,.2)).toBe(0);expect(loudnessAt(envelope,.8)).toBeGreaterThan(.9);
    expect(speechEnvelope(new Uint8Array(10))).toBeUndefined();
  });
  it('opens vowels with loudness but keeps lip closures at full weight',()=>{
    const quiet={rate:100,values:new Float32Array(100)};
    expect(visemeWeightsAt(cues,.5,quiet).get('viseme_aa')).toBeCloseTo(.25,2);
    expect(visemeWeightsAt(cues,.3,quiet).get('viseme_PP')).toBe(1);
    expect(visemeWeightsAt(cues,.5,{rate:100,values:new Float32Array(100).fill(1)}).get('viseme_aa')).toBe(1);
  });
});

describe('interviewer facial layers and idle life',()=>{
  it('opens the jaw with open vowels and loudness, rounds O/U, stretches E/I and presses PP',()=>{
    const loudAa=articulation(new Map([['viseme_aa',1]]),1), quietAa=articulation(new Map([['viseme_aa',1]]),0);
    expect(loudAa.jawOpen).toBeGreaterThan(quietAa.jawOpen);expect(quietAa.jawOpen).toBeGreaterThan(0);
    expect(articulation(new Map([['viseme_PP',1]]),1)).toMatchObject({jawOpen:0,mouthPress:.35});
    expect(articulation(new Map([['viseme_U',1]])).mouthPucker).toBe(.5);
    expect(articulation(new Map([['viseme_O',1]])).mouthFunnel).toBe(.45);
    expect(articulation(new Map([['viseme_E',1]])).mouthStretch).toBeCloseTo(.3);
    expect(articulation(new Map())).toMatchObject({jawOpen:0,mouthFunnel:0,mouthPucker:0,mouthStretch:0,mouthPress:0});
  });
  it('blinks at irregular intervals and keeps gaze and head motion small',()=>{
    let seed=7;const random=()=>((seed=(seed*16807)%2147483647)/2147483647);
    const life=createIdleLife(random);const starts:number[]=[];let previous=0,maxGaze=0,maxHead=0;
    for(let frame=0;frame<30*60;frame++){const pose=life.update(1/30,frame<900?'speaking':'listening');if(pose.blink>0&&previous===0)starts.push(frame/30);previous=pose.blink;maxGaze=Math.max(maxGaze,Math.abs(pose.gazeYaw));maxHead=Math.max(maxHead,Math.abs(pose.headYaw));}
    expect(starts.length).toBeGreaterThan(10);
    const gaps=starts.slice(1).map((time,index)=>+(time-starts[index]).toFixed(2));
    expect(new Set(gaps).size).toBeGreaterThan(gaps.length/2);
    expect(maxGaze).toBeLessThanOrEqual(.07);expect(maxHead).toBeLessThan(.06);
  });
});
