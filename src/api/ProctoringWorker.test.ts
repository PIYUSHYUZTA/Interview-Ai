import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProctoringWorker } from './ProctoringWorker.js';
const spawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn }));
function child() { return Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); }
const blank = { faceCount: 0, headOrientation: 'unavailable', gazeDirection: 'unavailable', upperBodyVisible: false, upperBodyMovement: null, handCount: 0, handPositions: [], handMovement: null };
afterEach(() => { spawn.mockReset(); vi.useRealTimers(); });
describe('Python worker lifecycle', () => {
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
