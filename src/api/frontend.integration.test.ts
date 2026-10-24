import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApiServer } from './server.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';
import { uploadResume, createInterview, startInterview, submitAnswer, getNextQuestion, completeInterview, getInterviewResults } from '../../frontend/src/api.js';

// Exercise the actual browser API client against an actual HTTP server.
// Only relative URL resolution is supplied here; responses are never mocked.
describe('candidate journey through the frontend API client', () => {
  let close: () => Promise<void>;
  beforeAll(async () => {
    const running = await createApiServer({ provider: new DeterministicProvider(), authenticationRequired: false }).listen(0);
    close = running.close;
    const fetchHttp = globalThis.fetch;
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => fetchHttp(new URL(url, `http://127.0.0.1:${running.port}`), init));
  });
  afterAll(async () => { vi.unstubAllGlobals(); await close(); });

  it('completes all four text rounds and retrieves actual scores, verdicts, evidence and roadmap', async () => {
    const resume = await uploadResume(STRONG_RESUME, 'Journey Candidate');
    const created = await createInterview(resume.resumeId, undefined, 4, 'Database Engineer\nRequired: PostgreSQL, SQL, transactions and indexing.');
    expect(created.providerName).toBe('deterministic');
    await expect(getInterviewResults(created.sessionId)).rejects.toThrow('Complete the interview');
    let current = await startInterview(created.sessionId);
    expect((await startInterview(created.sessionId)).currentQuestion.id).toBe(current.currentQuestion.id);
    const ids = new Set<string>();
    const rounds = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const question = current.currentQuestion;
      expect(['conceptual', 'behavioral', 'situational', 'system_design']).toContain(question.type);
      expect(ids.has(question.id)).toBe(false);
      ids.add(question.id); rounds.add(current.publicState.currentRound);
      expect((await getNextQuestion(created.sessionId)).currentQuestion.id).toBe(question.id);
      if (i === 0) {
        await expect(submitAnswer(created.sessionId, { text: ' ', questionId: question.id })).rejects.toThrow('Enter an answer');
        await expect(submitAnswer(created.sessionId, { text: 'Answer', questionId: 'stale-question' })).rejects.toThrow('does not match');
      }
      const answer = { text: i % 2 ? 'I am not sure how to explain this yet.' : 'First, I use transactions and indexes to preserve consistency. I measure query latency and compare trade-offs. In production I review failure modes, constraints and recovery before deploying.', questionId: question.id };
      const evaluated = await submitAnswer(created.sessionId, answer);
      expect(evaluated.evaluation.feedback?.criteria).toHaveLength(5);
      expect(evaluated.publicState.progress.totalQuestionsAnswered).toBe(i + 1);
      const retried = await submitAnswer(created.sessionId, answer);
      expect(retried.evaluation).toEqual(evaluated.evaluation);
      expect(retried.publicState.progress.totalQuestionsAnswered).toBe(i + 1);
      if (i < 11) {
        expect(evaluated.state).toBe('EVALUATING');
        current = await getNextQuestion(created.sessionId);
      } else expect(evaluated.state).toBe('COMPLETED');
    }
    expect([...rounds]).toEqual([1, 2, 3, 4]);
    const complete = await completeInterview(created.sessionId);
    const results = await getInterviewResults(created.sessionId);
    expect(results.candidateName).toBe('Journey Candidate');
    expect(results.roleTitle).toContain('Database Engineer');
    expect(results.overallScore).toBe(complete.overallScore);
    expect(results.componentScores).toEqual(complete.componentScores);
    expect(results.evidence).toHaveLength(12);
    expect(results.readiness?.score).toBeGreaterThanOrEqual(0);
    expect(results.readiness?.coverage).toBe(100);
    expect(results.readiness?.totalSkills).toBe(1);
    expect(results.comparisonKey).toBeTruthy();
    expect(results.evidence[0].feedback?.criteria).toHaveLength(5);
    expect(results.evidence[0].feedback?.improvements.length).toBeGreaterThan(0);
    expect(results.skillMap.databases.samples).toBe(12);
    expect(results.skillMap.databases.verdict).not.toBe('unverified');
    expect(results.gaps.length).toBeGreaterThan(0);
    expect(results.roadmap[0].priority).toBe(1);
    expect(JSON.stringify(results)).not.toContain('lastSelectionRationale');
    await expect(getNextQuestion(created.sessionId)).rejects.toThrow('already completed');
  });

  it('preserves the default role and returns actionable JD validation errors', async () => {
    const resume = await uploadResume(STRONG_RESUME, 'Default Candidate');
    await expect(createInterview(resume.resumeId, undefined, 1, 'An exciting opportunity.')).rejects.toThrow('No recognized role skills');
    const created = await createInterview(resume.resumeId, undefined, 1);
    let current = await startInterview(created.sessionId);
    for (let i = 0; i < 3; i++) {
      const result = await submitAnswer(created.sessionId, { text: 'I do not know.', questionId: current.currentQuestion.id });
      if (i < 2) {
        expect(result.state).toBe('EVALUATING');
        current = await getNextQuestion(created.sessionId);
      } else expect(result.state).toBe('COMPLETED');
    }
    await completeInterview(created.sessionId);
    expect((await getInterviewResults(created.sessionId)).roleTitle).toBe('Senior Backend Engineer');
  });
});
