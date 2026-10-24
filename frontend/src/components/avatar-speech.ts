export type VisemeCue = {time:number;id:number};
export type AvatarSpeechClock = {audio:HTMLAudioElement|null;cues:VisemeCue[]};
// SAPI US-English groups -> the model's Oculus blendshapes. Several phonemes
// share a visible shape. Cue times come from the engine that generated the WAV.
const shapes = ['sil','aa','aa','O','E','RR','I','U','O','aa','O','aa','kk','RR','nn','SS','CH','TH','FF','DD','kk','PP'];
export function visemeAt(cues:VisemeCue[],time:number):string {
  let low=0,high=cues.length-1,index=-1;
  while(low<=high){const middle=(low+high)>>1;if(cues[middle].time<=time){index=middle;low=middle+1;}else high=middle-1;}
  return index<0?'viseme_sil':`viseme_${shapes[cues[index].id]??'sil'}`;
}
