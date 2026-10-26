import { describe, it, expect } from 'vitest';
import { synthesizeInterviewSpeech,recognizeInterviewSpeech } from './InterviewSpeech.js';
import { visemeAt } from '../../frontend/src/components/avatar-speech.js';

describe('audio synchronized avatar speech', () => {
  it('selects phoneme groups from actual playback time, including silence and rewinds', () => {
    const cues=[{time:0,id:0},{time:.1,id:21},{time:.3,id:1},{time:.5,id:0}];
    expect(visemeAt(cues,0)).toBe('viseme_sil');
    expect(visemeAt(cues,.2)).toBe('viseme_PP');
    expect(visemeAt(cues,.4)).toBe('viseme_aa');
    expect(visemeAt(cues,.6)).toBe('viseme_sil');
    expect(visemeAt(cues,.15)).toBe('viseme_PP');
    expect(visemeAt([],4)).toBe('viseme_sil');
  });
  it('cancels without starting synthesis', async () => {
    const abort=new AbortController();abort.abort();
    await expect(synthesizeInterviewSpeech('Cancelled question.',abort.signal)).rejects.toThrow();
  });
  it.skipIf(process.platform!=='win32')('transcribes actual generated audio without fabricated recognition results',async()=>{
    const audio=await synthesizeInterviewSpeech('I use transactions to prevent duplicate payments and measure API latency.',new AbortController().signal);
    const original=Buffer.from(audio.audioBase64,'base64');const cut=original.subarray(0,original.length-8000);const dataOffset=cut.indexOf(Buffer.from('data'));cut.writeUInt32LE(cut.length-8,4);cut.writeUInt32LE(cut.length-dataOffset-8,dataOffset+4);
    const result=await recognizeInterviewSpeech(cut.toString('base64'),new AbortController().signal);
    expect(['transactions','duplicate','payments','latency'].filter(word=>result.text.toLowerCase().includes(word)).length).toBeGreaterThanOrEqual(2);
    expect(result.confidence).toBeGreaterThan(.3);
  },30000);
  it.skipIf(process.platform!=='win32')('generates real WAV samples and monotonic visemes using the installed voice', async () => {
    const result=await synthesizeInterviewSpeech('Welcome. Explain a project and the decisions you made.',new AbortController().signal);
    const wav=Buffer.from(result.audioBase64,'base64');
    expect(wav.subarray(0,4).toString()).toBe('RIFF');expect(wav.subarray(8,12).toString()).toBe('WAVE');
    expect(wav.length).toBeGreaterThan(2000);
    expect(result.visemes.length).toBeGreaterThan(8);
    expect(result.visemes.some(cue=>cue.id!==0)).toBe(true);
    expect(result.visemes.every((cue,i)=>!i||cue.time>=result.visemes[i-1].time)).toBe(true);
    // Cues must share the WAV's timeline: the last cue starts before the audio ends.
    const seconds=(wav.length-44)/wav.readUInt32LE(28);
    expect(result.visemes.at(-1)!.time).toBeLessThan(seconds);
    expect(result.visemes.at(-1)!.time).toBeGreaterThan(seconds*.8);
  },30000);
});
