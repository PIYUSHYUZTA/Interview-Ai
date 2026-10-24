import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiServer } from './server.js';
import { serviceConfig, ServiceConfigSchema } from './ServiceConfig.js';
import { migrateFileStorage } from './migrateFileStorage.js';
import { SQLiteDocuments } from './SQLiteDocuments.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';

describe('service boundaries and database reliability', () => {
  const directory = path.join(process.cwd(), `.test-reliability-${randomUUID()}`);
  let close: (() => Promise<void>) | undefined;
  let url = '';
  async function start(storage: 'file' | 'sqlite' = 'file') {
    const running = await new ApiServer({ dataDirectory: directory, config: { storage, providerMode: 'deterministic', allowedOrigins: ['http://localhost:5173'] } }).listen(0);
    close = running.close; url = `http://127.0.0.1:${running.port}`;
  }
  const post = (route: string, data: unknown, cookie = '') => fetch(url + route, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(data) });
  const register = async (email = 'reliable@example.test') => { const res = await post('/auth/register', { name: 'Reliable Candidate', email, password: 'ReliablePassword!2026' }); expect(res.status).toBe(201); return res.headers.get('set-cookie')!.split(';')[0]; };
  afterEach(async () => {
    await close?.(); close = undefined;
    if (path.dirname(path.resolve(directory)) !== process.cwd()) throw new Error('Unexpected cleanup directory.');
    fs.rmSync(directory, { force: true, recursive: true });
  });

  it('validates service config and exposes honest non-secret capabilities', async () => {
    expect(() => serviceConfig({ PORT: 'invalid' })).toThrow();
    expect(() => serviceConfig({ INTERVIEW_PROVIDER: 'pretend' })).toThrow();
    expect(() => ServiceConfigSchema.parse({ dataDirectory: directory, allowedOrigins: ['*'] })).toThrow();
    await start();
    const res = await fetch(url + '/health');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ provider: 'deterministic', evaluationMode: 'heuristic-demo', speech: 'browser-capability-dependent', storage: 'file' });
  });

  it('rejects untrusted origins, malformed JSON, wrong formats and excessive bodies', async () => {
    await start();
    const blocked = await fetch(url + '/auth/register', { method: 'POST', headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: '{}' });
    expect(blocked.status).toBe(403); expect(blocked.headers.get('access-control-allow-origin')).toBeNull();
    const preflight = await fetch(url + '/interviews', { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } });
    expect(preflight.status).toBe(204); expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect((await fetch(url + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' })).status).toBe(400);
    expect((await fetch(url + '/auth/login', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status).toBe(415);
    expect((await post('/auth/login', { email: 'é'.repeat(20000) })).status).toBe(413);
  });

  it('imports real file accounts and reports, survives database restart and preserves authorization', async () => {
    await start(); const cookie = await register();
    const resume = await (await post('/resumes/upload', { resumeText: STRONG_RESUME }, cookie)).json() as any;
    const created = await (await post('/interviews', { resumeId: resume.resumeId, numRounds: 1, questionsPerRound: 1, answerMode: 'text' }, cookie)).json() as any;
    const started = await (await post(`/interviews/${created.sessionId}/start`, {}, cookie)).json() as any;
    expect((await post(`/interviews/${created.sessionId}/answer`, { questionId: started.currentQuestion.id, text: 'I do not know this topic yet.' }, cookie)).status).toBe(200);
    const get = (route: string, token = cookie) => fetch(url + route, { headers: { cookie: token } });
    const report = await (await get(`/interviews/${created.sessionId}/results`)).json();
    await close!(); close = undefined;
    const migration = migrateFileStorage(directory);
    expect(migration.imported).toBe(3); expect(fs.existsSync(path.join(migration.backupDirectory!, 'candidates.json'))).toBe(true);
    expect(migrateFileStorage(directory).imported).toBe(0);
    await start('sqlite');
    expect(await (await get(`/interviews/${created.sessionId}/results`)).json()).toEqual(report);
    expect((await (await get('/interviews')).json()).storage).toBe('sqlite');
    const other = await register('other-reliable@example.test');
    expect((await get(`/interviews/${created.sessionId}/results`, other)).status).toBe(404);
    expect((await post(`/interviews/${created.sessionId}/integrity-events`, { eventType: 'tab_hidden' }, other)).status).toBe(404);
    const progress = await (await get('/interviews/progress')).json(); expect(progress.reports).toHaveLength(1);
    await close!(); close = undefined; await start('sqlite');
    expect(await (await get('/interviews/progress')).json()).toEqual(progress);
    expect((await post('/auth/login', { email: 'reliable@example.test', password: 'ReliablePassword!2026' })).status).toBe(200);
  });

  it('returns retryable provider failures without recording zero scores or advancing the session', async () => {
    let unavailable = true;
    class FlakyProvider extends DeterministicProvider {
      override async completeStructured<T>(...args: Parameters<DeterministicProvider['completeStructured']>): Promise<T | null> {
        return unavailable ? null : super.completeStructured<T>(...args);
      }
    }
    const running = await new ApiServer({ dataDirectory: directory, provider: new FlakyProvider() }).listen(0);
    close = running.close; url = `http://127.0.0.1:${running.port}`;
    const cookie = await register();
    const created = await (await post('/interviews', { resumeText: STRONG_RESUME, numRounds: 1, questionsPerRound: 1, answerMode: 'text' }, cookie)).json() as any;
    const started = await (await post(`/interviews/${created.sessionId}/start`, {}, cookie)).json() as any;
    const answer = { questionId: started.currentQuestion.id, text: 'I explain the design using concrete examples.' };
    const failed = await post(`/interviews/${created.sessionId}/answer`, answer, cookie);
    expect(failed.status).toBe(503); expect((await failed.json()).code).toBe('EVALUATION_UNAVAILABLE');
    const state = JSON.parse(fs.readFileSync(path.join(directory, 'interviews', `${created.sessionId}.json`), 'utf8'));
    expect(state.questionHistory).toEqual([]); expect(state.skillStates.every((s: any) => s.samples === 0)).toBe(true);
    unavailable = false;
    expect((await post(`/interviews/${created.sessionId}/answer`, answer, cookie)).status).toBe(200);
  });

  it('limits credential attempts without exposing secrets', async () => {
    const running = await new ApiServer({ dataDirectory: directory, config: { providerMode: 'deterministic', authAttemptsPerWindow: 1 } }).listen(0);
    close = running.close; url = `http://127.0.0.1:${running.port}`;
    expect((await post('/auth/login', { email: 'absent@example.test', password: 'wrong' })).status).toBe(401);
    const limited = await post('/auth/login', { email: 'absent@example.test', password: 'wrong' });
    expect(limited.status).toBe(429); expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  it('rolls back database transactions and refuses migration over unrelated database data', () => {
    const documents = new SQLiteDocuments(directory);
    expect(() => new SQLiteDocuments(directory)).toThrow('active writer');
    expect(() => documents.transaction(() => { documents.put('reports', 'one', { score: 1 }); throw new Error('interrupted'); })).toThrow('interrupted');
    expect(documents.get('reports', 'one')).toBeNull();
    documents.put('reports', 'existing', { value: 'preserved' }); documents.close();
    expect(() => migrateFileStorage(directory)).toThrow('refuses to overwrite');
  });
});
