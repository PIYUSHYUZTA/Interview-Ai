import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';
import { createApiServer, type ApiServer } from './server.js';
import { SCORING_WEIGHTS } from '../core/score/ScoringEngine.js';
import { InterviewResultsResponseSchema } from './schemas.js';

describe('candidate authentication and persistent workspace', () => {
  const dataDirectory = path.join(process.cwd(), `.test-candidate-data-${randomUUID()}`);
  let close: (() => Promise<void>) | null = null;
  let baseUrl = '';

  const startServer = async () => {
    const running = await createApiServer({ provider: new DeterministicProvider(), dataDirectory }).listen(0);
    close = running.close;
    baseUrl = `http://127.0.0.1:${running.port}`;
  };

  const post = (route: string, body: unknown, cookie?: string) => fetch(`${baseUrl}${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
  });

  const register = async (email = 'candidate@example.com') => {
    const response = await post('/auth/register', { name: 'Jordan Candidate', email, password: 'CandidatePass!2026' });
    expect(response.status).toBe(201);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    return { cookie, body: await response.json() as { candidate: { id: string; name: string; email: string } } };
  };

  afterEach(async () => {
    await close?.(); close = null;
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  });

  it('requires authentication, validates registration, hashes passwords, and revokes logout cookies', async () => {
    await startServer();
    const protectedResponse = await fetch(`${baseUrl}/interviews`);
    expect(protectedResponse.status).toBe(401);

    const { cookie, body } = await register('Candidate@Example.com');
    expect(body.candidate).toMatchObject({ name: 'Jordan Candidate', email: 'candidate@example.com' });
    expect(JSON.stringify(body)).not.toContain('CandidatePass!2026');
    expect(cookie).toContain('interview_session=');
    const setCookie = (await (await post('/auth/login', { email: 'candidate@example.com', password: 'CandidatePass!2026' })).headers.get('set-cookie')) ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');

    const wrongPassword = await post('/auth/login', { email: 'candidate@example.com', password: 'wrong-password' });
    expect(wrongPassword.status).toBe(401);
    expect((await wrongPassword.json()).error).toBe('Email or password is incorrect.');
    const duplicate = await post('/auth/register', { name: 'Jordan Candidate', email: 'candidate@example.com', password: 'CandidatePass!2026' });
    expect(duplicate.status).toBe(409);

    const logout = await post('/auth/logout', {}, cookie);
    expect(logout.status).toBe(200);
    const afterLogout = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
    expect((await afterLogout.json()).candidate).toBeNull();
    expect((await fetch(`${baseUrl}/interviews`, { headers: { Cookie: cookie } })).status).toBe(401);
  });

  it('persists candidate resume profiles and owned interview history across API restarts', async () => {
    await startServer();
    const { cookie } = await register();
    const resumeResponse = await post('/resumes/upload', { candidateName: 'Jordan Candidate', resumeText: STRONG_RESUME }, cookie);
    expect(resumeResponse.status).toBe(201);
    const resume = await resumeResponse.json() as { resumeId: string };
    const createdResponse = await post('/interviews', { resumeId: resume.resumeId, interviewType: 'technical', numRounds: 1, questionsPerRound: 1, answerMode: 'text' }, cookie);
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as { sessionId: string };
    const startedResponse = await post(`/interviews/${created.sessionId}/start`, {}, cookie);
    expect(startedResponse.status).toBe(200);
    const started = await startedResponse.json() as { currentQuestion: { id: string } };
    const answered = await post(`/interviews/${created.sessionId}/answer`, {
      questionId: started.currentQuestion.id,
      text: 'I use transactions, indexes, unique constraints and measured query plans. I validate concurrent updates, failure recovery and production latency before choosing the design.',
    }, cookie);
    expect(answered.status).toBe(200);
    const reportBefore = InterviewResultsResponseSchema.parse(await (await fetch(`${baseUrl}/interviews/${created.sessionId}/results`, { headers: { Cookie: cookie } })).json());
    expect(reportBefore.details.scoringWeights).toEqual(SCORING_WEIGHTS);
    expect(reportBefore.details.completionStatus).toBe('COMPLETED');
    expect(reportBefore.details.difficultyProgression.map((item) => item.questionId)).toEqual([started.currentQuestion.id]);
    expect(reportBefore.details.answerCoaching[0].beforeAfter.before).toContain('I use transactions');
    expect(reportBefore.details.answerCoaching[0].example.label).toContain('not the candidate');
    expect(fs.existsSync(path.join(dataDirectory, 'reports', `${created.sessionId}.json`))).toBe(true);

    await close?.(); close = null;
    await startServer();
    const me = await fetch(`${baseUrl}/auth/me`, { headers: { Cookie: cookie } });
    const profile = await me.json() as { candidate: { email: string } | null; resumes: Array<{ resumeId: string }> };
    expect(profile.candidate?.email).toBe('candidate@example.com');
    expect(profile.resumes.map((item) => item.resumeId)).toContain(resume.resumeId);

    const historyResponse = await fetch(`${baseUrl}/interviews`, { headers: { Cookie: cookie } });
    expect(historyResponse.status).toBe(200);
    const history = await historyResponse.json() as { storage: string; interviews: Array<{ sessionId: string; answered: number }> };
    expect(history.storage).toBe('file');
    expect(history.interviews).toContainEqual(expect.objectContaining({ sessionId: created.sessionId, answered: 1 }));
    const reportAfter = InterviewResultsResponseSchema.parse(await (await fetch(`${baseUrl}/interviews/${created.sessionId}/results`, { headers: { Cookie: cookie } })).json());
    expect(reportAfter).toEqual(reportBefore);
    const recent = await (await fetch(`${baseUrl}/interviews/recent`, { headers: { Cookie: cookie } })).json() as any;
    expect(recent.interviews[0].sessionId).toBe(created.sessionId);
    const resumeAfterRestart = await fetch(`${baseUrl}/resumes/${resume.resumeId}`, { headers: { Cookie: cookie } });
    expect(resumeAfterRestart.status).toBe(200);

    const other = await register('other@example.com');
    expect((await fetch(`${baseUrl}/interviews`, { headers: { Cookie: other.cookie } }).then((response) => response.json())).interviews).toEqual([]);
    expect((await fetch(`${baseUrl}/resumes/${resume.resumeId}`, { headers: { Cookie: other.cookie } })).status).toBe(404);
    expect((await post(`/interviews/${created.sessionId}/start`, {}, other.cookie)).status).toBe(404);
    expect((await fetch(`${baseUrl}/interviews/${created.sessionId}/results`, { headers: { Cookie: other.cookie } })).status).toBe(404);
    expect((await fetch(`${baseUrl}/interviews/${created.sessionId}/diagnostics`, { headers: { Cookie: other.cookie } })).status).toBe(404);
  });

  it('does not create a final report or score for a partially answered interview', async () => {
    await startServer();
    const { cookie } = await register();
    const response = await post('/interviews', { resumeText: STRONG_RESUME, numRounds: 1, questionsPerRound: 2, answerMode: 'text' }, cookie);
    const session = await response.json() as { sessionId: string };
    const start = await (await post(`/interviews/${session.sessionId}/start`, {}, cookie)).json() as { currentQuestion: { id: string } };
    await post(`/interviews/${session.sessionId}/answer`, { questionId: start.currentQuestion.id, text: 'We built things with Node and React.' }, cookie);
    expect((await post(`/interviews/${session.sessionId}/complete`, {}, cookie)).status).toBe(409);
    expect((await fetch(`${baseUrl}/interviews/${session.sessionId}/results`, { headers: { Cookie: cookie } })).status).toBe(409);
    expect(fs.existsSync(path.join(dataDirectory, 'reports', `${session.sessionId}.json`))).toBe(false);
    const history = await (await fetch(`${baseUrl}/interviews`, { headers: { Cookie: cookie } })).json() as any;
    expect(history.interviews[0].overallScore).toBeNull();
  });
  it('derives private progress from saved reports and personalizes later practice without importing samples', async () => {
    await startServer();
    expect((await fetch(`${baseUrl}/interviews/progress`)).status).toBe(401);
    const { cookie } = await register();
    const getProgress = async (owner = cookie) => (await fetch(`${baseUrl}/interviews/progress`, { headers: { Cookie: owner } })).json() as Promise<any>;
    expect((await getProgress()).reports).toEqual([]);
    const resume = await (await post('/resumes/upload', { resumeText: STRONG_RESUME }, cookie)).json() as any;
    const payload = { resumeId: resume.resumeId, interviewType: 'technical', numRounds: 1, questionsPerRound: 1, answerMode: 'text' };
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const created = await (await post('/interviews', payload, cookie)).json() as any;
      ids.push(created.sessionId);
      const started = await (await post(`/interviews/${created.sessionId}/start`, {}, cookie)).json() as any;
      expect((await post(`/interviews/${created.sessionId}/answer`, { questionId: started.currentQuestion.id, text: 'I do not know this concept yet.' }, cookie)).status).toBe(200);
    }
    const progress = await getProgress();
    expect(progress.reports).toHaveLength(2);
    expect(progress.reports.map((r: any) => r.sessionId)).toEqual(ids);
    expect(progress.currentSkills.every((s: any) => ids.includes(s.sessionId))).toBe(true);
    expect(progress.repeatedWeaknesses.length).toBeGreaterThan(0);
    expect(progress.repeatedWeaknesses[0].count).toBe(2);
    expect(progress.recommendations.length).toBeGreaterThan(0);
    expect(progress.latestResumeId).toBe(resume.resumeId);
    const savedResume = await (await fetch(`${baseUrl}/resumes/${resume.resumeId}`, { headers: { Cookie: cookie } })).json() as any;
    expect(savedResume.extractedText).toBe(STRONG_RESUME.trim());
    const next = await (await post('/interviews', payload, cookie)).json() as any;
    const files = fs.readdirSync(path.join(dataDirectory, 'interviews'));
    const serialized = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'interviews', files.find((f) => f.includes(next.sessionId))!), 'utf8'));
    expect(serialized.config.practicePriorities.length).toBeGreaterThan(0);
    expect(JSON.stringify(serialized.config.practicePriorities)).toContain(ids[1]);
    expect(Object.values(serialized.skillStates).every((s: any) => s.samples === 0)).toBe(true);
    const other = await register('other-progress@example.com');
    expect((await getProgress(other.cookie)).reports).toEqual([]);
    await close?.(); close = null; await startServer();
    expect(await getProgress()).toEqual(progress);
  });

});

