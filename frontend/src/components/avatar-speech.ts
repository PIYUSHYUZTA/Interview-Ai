export type VisemeCue = {time:number;id:number};
export type SpeechEnvelope = {rate:number;values:Float32Array};
export type AvatarSpeechClock = {audio:HTMLAudioElement|null;cues:VisemeCue[];envelope?:SpeechEnvelope};
// SAPI US-English groups -> the model's Oculus blendshapes. Several phonemes
// share a visible shape. Cue times come from the engine that generated the WAV.
const shapes = ['sil','aa','aa','O','E','RR','I','U','O','aa','O','aa','kk','RR','nn','SS','CH','TH','FF','DD','kk','PP'];
const shapeOf = (cue:VisemeCue|undefined) => `viseme_${cue ? shapes[cue.id] ?? 'sil' : 'sil'}`;
function cueIndex(cues:VisemeCue[],time:number):number {
  let low=0,high=cues.length-1,index=-1;
  while(low<=high){const middle=(low+high)>>1;if(cues[middle].time<=time){index=middle;low=middle+1;}else high=middle-1;}
  return index;
}
export function visemeAt(cues:VisemeCue[],time:number):string {
  const index=cueIndex(cues,time);
  return index<0?'viseme_sil':shapeOf(cues[index]);
}

// Open vowel shapes follow the WAV's loudness; closures (PP, FF, TH...) keep full
// weight so the lips still meet on quiet consonants.
const loudnessShaped = new Set(['viseme_aa','viseme_E','viseme_I','viseme_O','viseme_U']);
const blendIn = .06, anticipate = .045;
const smooth = (x:number) => { const t=Math.min(1,Math.max(0,x)); return t*t*(3-2*t); };

/** Coarticulated viseme weights at an audio time: the previous shape hands over to
 * the current one, the next shape is anticipated just before its cue, and open
 * vowels are scaled by the actual speech loudness. */
export function visemeWeightsAt(cues:VisemeCue[],time:number,envelope?:SpeechEnvelope):Map<string,number> {
  const weights=new Map<string,number>();
  const add=(name:string,value:number)=>{ if(name!=='viseme_sil'&&value>0) weights.set(name,Math.max(weights.get(name)??0,value)); };
  const index=cueIndex(cues,time);
  if(index<0) return weights;
  const current=cues[index], previous=cues[index-1], next=cues[index+1];
  const arrive=smooth((time-current.time)/blendIn);
  add(shapeOf(previous),1-arrive);
  add(shapeOf(current),arrive);
  if(next) add(shapeOf(next),(1-smooth((next.time-time)/anticipate))*.4);
  const loud=loudnessAt(envelope,time);
  if(loud!==undefined) for(const [name,value] of weights) if(loudnessShaped.has(name)) weights.set(name,value*(.25+.75*smooth(loud/.55)));
  return weights;
}

export function loudnessAt(envelope:SpeechEnvelope|undefined,time:number):number|undefined {
  if(!envelope||!envelope.values.length) return undefined;
  const position=Math.max(0,time*envelope.rate), low=Math.floor(position);
  if(low>=envelope.values.length-1) return envelope.values[envelope.values.length-1];
  return envelope.values[low]+(envelope.values[low+1]-envelope.values[low])*(position-low);
}

/** RMS loudness every 10 ms from a 16-bit PCM WAV, normalised to its 95th percentile.
 * Returns undefined for any other encoding so playback never depends on it. */
export function speechEnvelope(wav:Uint8Array):SpeechEnvelope|undefined {
  const view=new DataView(wav.buffer,wav.byteOffset,wav.byteLength);
  const tag=(offset:number)=>String.fromCharCode(wav[offset],wav[offset+1],wav[offset+2],wav[offset+3]);
  if(wav.length<44||tag(0)!=='RIFF'||tag(8)!=='WAVE') return undefined;
  let channels=0,sampleRate=0,bits=0,format=0;
  for(let offset=12;offset+8<=wav.length;){
    const id=tag(offset),size=view.getUint32(offset+4,true),body=offset+8;
    if(id==='fmt '){format=view.getUint16(body,true);channels=view.getUint16(body+2,true);sampleRate=view.getUint32(body+4,true);bits=view.getUint16(body+14,true);}
    if(id==='data'){
      if(format!==1||bits!==16||!channels||!sampleRate) return undefined;
      const frames=Math.floor(Math.min(size,wav.length-body)/(2*channels)), window=Math.max(1,Math.round(sampleRate/100));
      const values=new Float32Array(Math.ceil(frames/window));
      for(let slot=0;slot<values.length;slot++){
        let sum=0,count=0;
        for(let frame=slot*window;frame<Math.min(frames,(slot+1)*window);frame++,count++){const sample=view.getInt16(body+frame*2*channels,true)/32768;sum+=sample*sample;}
        values[slot]=count?Math.sqrt(sum/count):0;
      }
      const peak=Array.from(values).sort((a,b)=>a-b)[Math.floor(values.length*.95)]||1;
      for(let slot=0;slot<values.length;slot++) values[slot]=Math.min(1,values[slot]/peak);
      return {rate:100,values};
    }
    offset=body+size+(size%2);
  }
  return undefined;
}
