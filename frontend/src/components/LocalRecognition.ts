import { transcribeInterviewAudio } from '../api';

import type { Recognition } from './useInterviewMedia';



/** Records only a single answer in memory; sends mono PCM to this authenticated

 * backend. No browser-vendor speech service or fabricated transcript is used. */

export class LocalRecognition implements Recognition {

  continuous=true;interimResults=false;lang='en-US';

  onstart:(()=>void)|null=null;onaudiostart:(()=>void)|null=null;onend:(()=>void)|null=null;

  onprocessing:(()=>void)|null=null;onactivity:(()=>void)|null=null;

  onerror:((event:{error:string})=>void)|null=null;onresult:Recognition['onresult']=null;

  private context:AudioContext|null=null;private node:AudioWorkletNode|null=null;

  private frames:Float32Array[]=[];private samples=0;private closed=false;private finishing=false;

  private aborter=new AbortController();private soundAt=0;private activitySamples=0;private timer:ReturnType<typeof setInterval>|null=null;

  private stream:MediaStream;private sessionId:string;private questionId:string;

  private source:MediaStreamAudioSourceNode|null=null;private sharedContext?:AudioContext;

  constructor(stream:MediaStream,sessionId:string,questionId:string,context?:AudioContext){this.stream=stream;this.sessionId=sessionId;this.questionId=questionId;this.sharedContext=context;}

  start(){void this.capture().catch(()=>{if(!this.closed){this.onerror?.({error:'Microphone audio capture could not start. Press Start microphone to retry and check browser permissions.'});this.abort();}});}

  private async capture(){

    const context=this.sharedContext??new AudioContext({sampleRate:16000});this.context=context;

    await context.audioWorklet.addModule(new URL('./pcm-capture.worklet.js',import.meta.url));

    if(this.closed){if(!this.sharedContext)void context.close();return;}

    const node=new AudioWorkletNode(context,'interview-pcm');this.node=node;

    let confirmed=false;

    node.port.onmessage=event=>{

      if(this.closed||this.finishing)return;

      const pcm=event.data as Float32Array;

      if(!confirmed){confirmed=true;this.onaudiostart?.();}

      if(this.samples+pcm.length>context.sampleRate*120){this.stop();return;}

      this.frames.push(pcm);this.samples+=pcm.length;

      const rms=Math.sqrt(pcm.reduce((total,value)=>total+value*value,0)/pcm.length);

      if(rms>.006){this.activitySamples=Math.min(context.sampleRate*.25,this.activitySamples+pcm.length);if(this.activitySamples>=context.sampleRate*.12){this.soundAt=Date.now();this.onactivity?.();}}else this.activitySamples=Math.max(0,this.activitySamples-pcm.length*.5);

    };

    this.source=context.createMediaStreamSource(this.stream);this.source.connect(node);node.connect(context.destination);

    await context.resume();if(this.closed)return;this.onstart?.();

    this.timer=setInterval(()=>{if(this.soundAt&&Date.now()-this.soundAt>=5000)this.stop();},250);

  }

  private clean(){if(this.timer)clearInterval(this.timer);this.timer=null;this.node?.disconnect();if(this.node)this.node.port.onmessage=null;this.node=null;this.source?.disconnect();this.source=null;if(this.context&&!this.sharedContext)void this.context.close().catch(()=>{});this.context=null;this.stream.getTracks().forEach(track=>{track.onended=null;track.onmute=null;track.stop();});}

  stop(){

    if(this.closed||this.finishing)return;this.finishing=true;

    const rate=this.context?.sampleRate??16000;

    this.clean();this.onprocessing?.();

    // WAV is 16 kHz mono PCM regardless of the device's native clock.

    const input=new Float32Array(this.samples);let offset=0;for(const frame of this.frames){input.set(frame,offset);offset+=frame.length;}this.frames=[];

    const count=Math.floor(input.length*16000/rate),bytes=new Uint8Array(44+count*2),view=new DataView(bytes.buffer);

    const write=(at:number,text:string)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};

    write(0,'RIFF');view.setUint32(4,36+count*2,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,count*2,true);

    for(let i=0;i<count;i++)view.setInt16(44+i*2,Math.max(-1,Math.min(1,input[Math.min(input.length-1,Math.floor(i*rate/16000))]||0))*32767,true);

    let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));

    void transcribeInterviewAudio(this.sessionId,this.questionId,btoa(binary),this.aborter.signal).then(result=>{

      if(this.closed)return;

      this.onresult?.({resultIndex:0,results:[{isFinal:true,0:{transcript:result.text}}]});this.onend?.();

    }).catch(error=>{if(!this.closed)this.onerror?.({error:error instanceof Error?error.message:'local-transcription-unavailable'});});

  }

  abort(){this.closed=true;this.aborter.abort();this.clean();this.frames=[];}

}

