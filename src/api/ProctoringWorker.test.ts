import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProctoringWorker, VISION_WORKER, visionPython } from './ProctoringWorker.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
const spawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn }));
function child() { return Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); }
const blank = { faceCount: 0, headOrientation: 'unavailable', gazeDirection: 'unavailable', upperBodyVisible: false, upperBodyMovement: null, handCount: 0, handPositions: [], handMovement: null };
afterEach(() => { spawn.mockReset(); vi.useRealTimers(); });
describe('Python worker lifecycle', () => {
  it('queues frames from concurrent interviews in order instead of failing them, and bounds the queue', async () => {
    const process = child(); spawn.mockReturnValue(process); const worker = new ProctoringWorker();
    const lines: string[] = []; process.stdin.on('data', (chunk: Buffer) => lines.push(...chunk.toString().trim().split('\n')));
    const first = worker.analyze('interview-a', 'frameA');
    const queued = ['interview-b', 'interview-c', 'interview-d', 'interview-e'].map((id) => worker.analyze(id, `frame-${id}`));
    await expect(worker.analyze('interview-f', 'frameF')).rejects.toMatchObject({ code: 'WORKER_BUSY' }); // queue of 4 is full
    await new Promise((resolve) => setImmediate(resolve));
    expect(lines.map((line) => JSON.parse(line).sessionId)).toEqual(['interview-a']); // one frame in Python at a time
    for (let i = 0; i < 5; i++) { process.stdout.write(JSON.stringify({ ok: true, observation: { ...blank, handMovement: i } }) + '\n'); await new Promise((resolve) => setTimeout(resolve, 5)); }
    expect(await first).toMatchObject({ handMovement: 0 });
    expect((await Promise.all(queued)).map((o) => o.handMovement)).toEqual([1, 2, 3, 4]); // each answer reaches its own request
    expect(lines.map((line) => JSON.parse(line).sessionId)).toEqual(['interview-a', 'interview-b', 'interview-c', 'interview-d', 'interview-e']);
    worker.close();
  });
  it('releases the final session immediately instead of waiting for idle cleanup',async()=>{
    const process=child();spawn.mockReturnValue(process);const worker=new ProctoringWorker();
    const pending=worker.analyze('ending','frame');process.stdout.write(JSON.stringify({ok:true,observation:blank})+'\n');await pending;
    worker.releaseSession('ending');expect(process.kill).toHaveBeenCalled();
  });
  it('cancels inference for the ending session and ignores its late response',async()=>{
    const old=child(),next=child();spawn.mockReturnValueOnce(old).mockReturnValueOnce(next);const worker=new ProctoringWorker();
    const pending=worker.analyze('ending','frame');worker.releaseSession('ending');
    await expect(pending).rejects.toMatchObject({code:'WORKER_STOPPED'});
    const restarted=worker.analyze('other','frame');old.stdout.write(JSON.stringify({ok:true,observation:{...blank,faceCount:3}})+'\n');
    next.stdout.write(JSON.stringify({ok:true,observation:blank})+'\n');expect(await restarted).toMatchObject({faceCount:0});worker.close();
  });
  it('releases one cached session without interrupting another active session',async()=>{
    const process=child();spawn.mockReturnValue(process);const worker=new ProctoringWorker();
    let pending=worker.analyze('first','frame');process.stdout.write(JSON.stringify({ok:true,observation:blank})+'\n');await pending;
    pending=worker.analyze('second','frame');worker.releaseSession('first');expect(process.kill).not.toHaveBeenCalled();
    expect(process.stdin.read().toString()).toContain('"command":"release","sessionId":"first"');
    process.stdout.write(JSON.stringify({ok:true,observation:blank})+'\n');expect(await pending).toMatchObject({faceCount:0});
    worker.releaseSession('second');expect(process.kill).toHaveBeenCalled();
  });
  it('kills a malformed protocol stream before it can corrupt a later request',async()=>{
    const process=child();spawn.mockReturnValue(process);const worker=new ProctoringWorker();const pending=worker.analyze('session','frame');
    process.stdout.write('not JSON\n');await expect(pending).rejects.toMatchObject({code:'WORKER_PROTOCOL_ERROR'});expect(process.kill).toHaveBeenCalled();worker.close();
  });
  it('times out, restarts, and ignores late output from the obsolete process', async () => {
    const old = child(), next = child(); spawn.mockReturnValueOnce(old).mockReturnValueOnce(next);
    const worker = new ProctoringWorker(15);
    await expect(worker.analyze('old-session', 'frame')).rejects.toMatchObject({ code: 'ANALYSIS_TIMEOUT' });
    const pending = worker.analyze('new-session', 'frame');
    old.stdout.write(JSON.stringify({ ok: true, observation: { ...blank, faceCount: 3 } }) + '\n');
    next.stdout.write(JSON.stringify({ ok: true, observation: blank }) + '\n');
    expect(await pending).toMatchObject({ faceCount: 0 });
    worker.close(); expect(old.kill).toHaveBeenCalled(); expect(next.kill).toHaveBeenCalled();
  });
  it('reports structured missing-model errors without inventing an observation', async () => {
    const process = child(); spawn.mockReturnValue(process);
    const worker = new ProctoringWorker(); const pending = worker.analyze('session', 'frame');
    process.stdout.write(JSON.stringify({ ok: false, code: 'MODEL_MISSING' }) + '\n');
    await expect(pending).rejects.toMatchObject({ code: 'MODEL_MISSING' }); worker.close();
  });
  it('reports process startup failures and allows a later retry', async () => {
    const process = child(); spawn.mockReturnValue(process);
    const worker = new ProctoringWorker(); const pending = worker.analyze('session', 'frame');
    process.emit('error', new Error('launch failed'));
    await expect(pending).rejects.toMatchObject({ code: 'WORKER_START_OR_EXIT_FAILED' }); worker.close();
  });
  it('releases model resources and cached geometry after an idle minute',async()=>{
    vi.useFakeTimers();const process=child();spawn.mockReturnValue(process);const worker=new ProctoringWorker();
    const pending=worker.analyze('session','frame');process.stdout.write(JSON.stringify({ok:true,observation:blank})+'\n');await pending;
    await vi.advanceTimersByTimeAsync(60000);expect(process.kill).toHaveBeenCalled();worker.close();
  });

});

describe('vision interpreter discovery', () => {
  it('resolves the worker and project environment from the project, not the working directory', () => {
    expect(path.isAbsolute(VISION_WORKER)).toBe(true);
    expect(existsSync(VISION_WORKER)).toBe(true);
    const saved = process.env.PROCTORING_PYTHON; delete process.env.PROCTORING_PYTHON;
    try {
      const python = visionPython();
      if (python.source === 'project-venv') { expect(path.isAbsolute(python.command)).toBe(true); expect(python.command.startsWith(path.dirname(path.dirname(VISION_WORKER)))).toBe(true); }
      else expect(python).toEqual({ command: 'python', source: 'system-fallback' });
      process.env.PROCTORING_PYTHON = 'C:/custom/python.exe';
      expect(visionPython()).toEqual({ command: 'C:/custom/python.exe', source: 'environment' });
    } finally { if (saved === undefined) delete process.env.PROCTORING_PYTHON; else process.env.PROCTORING_PYTHON = saved; }
  });
});
