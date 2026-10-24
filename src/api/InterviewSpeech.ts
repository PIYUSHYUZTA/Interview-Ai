import { spawn } from 'node:child_process';
import path from 'node:path';
import { z } from 'zod';

export const InterviewSpeechSchema = z.object({
  audioBase64: z.string().min(60).max(8_000_000),
  visemes: z.array(z.object({ time: z.number().min(0).max(300), id: z.number().int().min(0).max(21) })).max(10000),
  voice: z.string().min(1).max(200),
});

/** Local Windows SAPI. The same synthesis produces both WAV audio and cues.
 * No candidate audio or arbitrary client text is accepted by this worker. */
export function synthesizeInterviewSpeech(text:string,signal:AbortSignal) {
  return runSpeechWorker('synthesize.ps1',{text},InterviewSpeechSchema,signal);
}
export const RecognitionOutputSchema=z.object({text:z.string().max(20000),confidence:z.number().min(0).max(1)});
export function recognizeInterviewSpeech(audioBase64:string,signal:AbortSignal) {
  return runSpeechWorker('transcribe.ps1',{audioBase64},RecognitionOutputSchema,signal);
}
function runSpeechWorker<T>(script:string,payload:unknown,schema:z.ZodType<T>,signal:AbortSignal):Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (process.platform !== 'win32' || process.env.INTERVIEW_SPEECH === 'browser') {
      reject(new Error('Local synchronized speech is unavailable. Browser playback remains available.')); return;
    }
    if (signal.aborted) { reject(new Error('Speech request cancelled.')); return; }
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts/speech',script)], { windowsHide: true, stdio: ['pipe','pipe','pipe'] });
    let output = '', finished = false;
    const finish = (error?: Error) => {
      if (finished) return; finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (error) { child.kill(); reject(error); }
      else { try { resolve(schema.parse(JSON.parse(output.replace(/^\uFEFF/, '')))); } catch { reject(new Error('Speech service returned invalid audio or cue data.')); } }
    };
    const abort = () => finish(new Error('Speech request cancelled.'));
    const timer = setTimeout(() => finish(new Error('Local speech synthesis timed out.')), 25000);
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', chunk => { output += chunk.toString(); if (output.length > 8_000_000) finish(new Error('Speech output exceeded its limit.')); });
    child.stderr.resume(); // Never log question text, stack internals or personal data.
    child.on('error', () => finish(new Error('Local speech service could not start.')));
    child.on('close', code => code === 0 ? finish() : finish(new Error('Local speech service is unavailable.')));
    child.stdin.on('error', () => finish(new Error('Local speech service disconnected.')));
    child.stdin.end(JSON.stringify(payload));
  });
}
