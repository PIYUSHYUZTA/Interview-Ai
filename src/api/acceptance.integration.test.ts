import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { InMemorySessionStore } from '../core/session/InterviewSessionStore.js';
import { ScoringEngine } from '../core/score/ScoringEngine.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';
import { InterviewResultsResponseSchema } from './schemas.js';

describe('acceptance: evidence and technical failures', () => {
  it('matches actual transcript, scoring engine, skill evidence and actionable roadmap in a completed report', async () => {
    const provider = new DeterministicProvider(); const store = new InMemorySessionStore({ provider });
    const server = await new ApiServer({ provider, store, authenticationRequired: false }).listen(0);
    const base = `http://127.0.0.1:${server.port}`;
    const post = (route: string, data: unknown) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    try {
      const uploaded = await (await post('/resumes/upload', { resumeText: STRONG_RESUME })).json() as any;
      expect(uploaded.careerPath.evidence.length).toBeGreaterThan(0);
      const created = await (await post('/interviews', { resumeId: uploaded.resumeId, rolePreset: uploaded.careerPath.recommendedRoleId, interviewType: 'technical', numRounds: 1, questionsPerRound: 2, answerMode: 'text' })).json() as any;
      let current = await (await post(`/interviews/${created.sessionId}/start`, {})).json() as any;
      const answers = ['I do not understand the mechanism yet.', 'I implemented an API with explicit error handling, measured latency and tested recovery.'];
      for (let i = 0; i < answers.length; i++) {
        expect(created.plan.rounds[0].targetSkills).toContain(current.currentQuestion.skillId);
        const response = await post(`/interviews/${created.sessionId}/answer`, { questionId: current.currentQuestion.id, text: answers[i] });
        expect(response.status).toBe(200);
        if (!i) current = await (await post(`/interviews/${created.sessionId}/next-question`, {})).json();
      }
      const machine = (await store.load(created.sessionId))!;
      expect(machine.config.profile.candidateName).toBe(uploaded.candidateName);
      expect(machine.config.profile.projects.length).toBeGreaterThan(0);
      const report = InterviewResultsResponseSchema.parse(await (await fetch(`${base}/interviews/${created.sessionId}/results`)).json());
      const score = ScoringEngine.calculate(machine.questionHistory.flatMap((q) => q.evaluation ? [q.evaluation] : []));
      expect(report.overallScore).toBeCloseTo(score.overallScore * 10, 8);
      for (const [component, value] of Object.entries(report.componentScores)) expect(value).toBe(score.componentScores[component as keyof typeof score.componentScores]);
      expect(report.evidence.map((e) => e.answer)).toEqual(answers);
      expect(report.evidence.map((e) => e.question)).toEqual(machine.questionHistory.map((q) => q.question.prompt));
      const ids = report.evidence.map((e) => e.questionId);
      for (const finding of [...report.details.strengths, ...report.details.weaknesses]) {
        expect(finding.questionIds.length).toBeGreaterThan(0);
        expect(finding.questionIds.every((id) => ids.includes(id))).toBe(true);
      }
      for (const coaching of report.details.answerCoaching) {
        const evidence = report.evidence.find((e) => e.questionId === coaching.questionId)!;
        expect(evidence.answer).toContain(coaching.beforeAfter.before);
        expect(coaching.example.wording.length).toBeGreaterThan(50);
        expect(coaching.example.label).toContain('not the candidate');
      }
      for (const step of report.details.learningPlan) {
        expect(step.sequence.length).toBeGreaterThan(1); expect(step.exercises.length).toBeGreaterThan(0);
        expect(step.successCriteria.length).toBeGreaterThan(0); expect(step.targetOutcome.length).toBeGreaterThan(15);
        expect(step.evidenceQuestionIds.every((id) => ids.includes(id))).toBe(true);
      }
    } finally { await server.close(); }
  });

  it('does not penalize invalid camera frames or a missing Python worker and recovers on valid input', async () => {
    const provider = new DeterministicProvider(); const store = new InMemorySessionStore({ provider });
    const server = await new ApiServer({ provider, store, authenticationRequired: false }).listen(0);
    const base = `http://127.0.0.1:${server.port}`;
    const post = (route: string, data: unknown, token?: string) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(data) });
    try {
      const created = await (await post('/interviews', { resumeText: STRONG_RESUME, numRounds: 1 })).json() as any;
      const started = await (await post(`/interviews/${created.sessionId}/start`, {})).json() as any;
      const clock = vi.spyOn(Date, 'now'); let now = started.publicState.timing.sessionStartedAt + 31000; clock.mockImplementation(() => now);
      const sample = (image: string) => post(`/interviews/${created.sessionId}/proctoring-frame`, { consent: true, image, capturedAt: new Date(now).toISOString() }, created.integrityToken);
      vi.stubEnv('PROCTORING_PYTHON', 'D:\\AI Mock Interview Platform\\missing-test-python.exe');
      expect((await sample(readFileSync('proctoring/fixtures/blank.jpg').toString('base64'))).status).toBe(503);
      vi.unstubAllEnvs(); now += 2000;
      expect((await sample(Buffer.from('Invalid JPEG input').toString('base64'))).status).toBe(503);
      now += 2000;
      const valid = await sample(readFileSync('proctoring/fixtures/right_hands.jpg').toString('base64'));
      expect(valid.status).toBe(200); const result = await valid.json() as any;
      expect(result.observation.handCount).toBeGreaterThan(0);
      expect(result.publicState.integrity.warningCount).toBe(0);
      expect(result.publicState.state).toBe('IN_PROGRESS');
      expect((await store.load(created.sessionId))!.questionHistory).toEqual([]);
    } finally { vi.restoreAllMocks(); vi.unstubAllEnvs(); await server.close(); }
  }, 45000);
});
