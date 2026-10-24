import { InMemorySessionStore } from '../core/session/InterviewSessionStore.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { JobRequirementIntelligence } from '../core/jobs/JobRequirementIntelligence.js';
import { backendRole } from '../testSupport/fixtures.js';
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import { createApiServer, ApiServer } from './server.js';
import { STRONG_RESUME } from '../testSupport/fixtures.js';
import {
  ResumeUploadResponseSchema,
  ResumeGetResponseSchema,
  InterviewCreateResponseSchema,
  InterviewStartResponseSchema,
  InterviewAnswerResponseSchema,
  InterviewNextQuestionResponseSchema,
  InterviewCompleteResponseSchema,
  InterviewResultsResponseSchema,
  ErrorResponseSchema,
} from './schemas.js';

describe('Section 16: API Layer Endpoints & Schema Validation', () => {
  const store = new InMemorySessionStore({ provider: new DeterministicProvider(), seed: 42 });
  let app: ApiServer;
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    app = createApiServer({ store, authenticationRequired: false });
    const running = await app.listen(0); // auto-pick free port
    baseUrl = `http://127.0.0.1:${running.port}`;
    closeServer = running.close;
  });

  afterAll(async () => {
    await closeServer();
  });

  it.each([undefined, 'Senior Database Engineer. Required: SQL, PostgreSQL, database indexing, transactions and query optimization.'])('creates and starts a session using JD/default requirements: %s', async (jobDescription) => {
    const res = await fetch(`${baseUrl}/interviews`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumeText: STRONG_RESUME, jobDescription, numRounds: 2 }),
    });
    expect(res.status).toBe(201);
    const created = InterviewCreateResponseSchema.parse(await res.json());
    const machine = (await store.load(created.sessionId))!;
    const expected = jobDescription ? new JobRequirementIntelligence().analyze({ jobDescription }).roleRequirement : backendRole();
    expect(machine.config.role).toEqual(expected);
    expect(machine.config.interviewPlan?.roleTitle).toBe(expected.title);
    expect(machine.config.interviewPlan?.rounds).toHaveLength(2);
    if (jobDescription) expect(machine.config.role).not.toEqual(backendRole());
    const start = await fetch(`${baseUrl}/interviews/${created.sessionId}/start`, { method: 'POST' });
    const started = await start.json();
    expect(start.status, JSON.stringify(started)).toBe(200);
    const question = InterviewStartResponseSchema.parse(started).currentQuestion;
    const round = machine.config.interviewPlan!.rounds[0];
    expect(round.targetSkills).toContain(question.skillId);
    expect(round.questionTypes).toContain(question.type);
    expect(question.difficulty).toBeGreaterThanOrEqual(round.difficultyRange.min * 2);
    expect(question.difficulty).toBeLessThanOrEqual(round.difficultyRange.max * 2);
  });

  it('rejects a JD without recognized requirements instead of creating an unusable session', async () => {
    const response = await fetch(`${baseUrl}/interviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobDescription: 'A wonderful opportunity with our team.' }) });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain('No recognized role skills');
  });

  it('authorizes, deduplicates, serializes and terminates after three sustained tab-hidden warnings', async () => {
    const create = async () => {
      const response = await fetch(`${baseUrl}/interviews`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resumeText: STRONG_RESUME, numRounds: 2 }),
      });
      expect(response.status).toBe(201);
      return InterviewCreateResponseSchema.parse(await response.json());
    };
    const candidate = await create();
    const otherCandidate = await create();
    expect(candidate.publicState.integrity.warningCount).toBe(0);
    expect(candidate.integrityPolicy.maximumWarnings).toBe(2);
    expect(candidate.integrityPolicy.monitoredSignals).toContain('Interview tab hidden for the configured sustained duration');

    const start = await fetch(`${baseUrl}/interviews/${candidate.sessionId}/start`, { method: 'POST' });
    const started = InterviewStartResponseSchema.parse(await start.json());
    const startedAt = started.publicState.timing.sessionStartedAt!;
    const now = startedAt + 90_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now);
    const requestEvent = (token: string, eventId: string, offsetMs: number, eventType = 'tab_hidden') => fetch(`${baseUrl}/interviews/${candidate.sessionId}/integrity-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ eventId, eventType, occurredAt: new Date(startedAt + offsetMs).toISOString(), durationMs: eventType === 'tab_visible' ? 2000 : 5_000 }),
    });

    try {
      const foreign = await requestEvent(otherCandidate.integrityToken, '00000000-0000-4000-8000-000000000001', 35_000);
      expect(foreign.status).toBe(401);
      const unsupportedVision = await requestEvent(candidate.integrityToken, '00000000-0000-4000-8000-000000000002', 35_000, 'multiple_faces');
      expect(unsupportedVision.status).toBe(400);

      const firstPayload = { eventId: '00000000-0000-4000-8000-000000000010', eventType: 'tab_hidden', occurredAt: new Date(startedAt + 35_000).toISOString(), durationMs: 5_000 };
      const first = await fetch(`${baseUrl}/interviews/${candidate.sessionId}/integrity-events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${candidate.integrityToken}` }, body: JSON.stringify(firstPayload) });
      expect(first.status).toBe(200);
      expect(await first.json()).toMatchObject({ warningCount: 1, terminated: false });
      const duplicate = await fetch(`${baseUrl}/interviews/${candidate.sessionId}/integrity-events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${candidate.integrityToken}` }, body: JSON.stringify(firstPayload) });
      expect(await duplicate.json()).toMatchObject({ warningCount: 1, duplicate: true });

      await requestEvent(candidate.integrityToken,'00000000-0000-4000-8000-000000000021',37000,'tab_visible');
      expect((await requestEvent(candidate.integrityToken,'00000000-0000-4000-8000-000000000011',55000)).status).toBe(200);
      await requestEvent(candidate.integrityToken,'00000000-0000-4000-8000-000000000022',57000,'tab_visible');
      const last=await(await requestEvent(candidate.integrityToken,'00000000-0000-4000-8000-000000000012',75000)).json();
      expect(last).toMatchObject({warningCount:3,terminated:true,publicState:{state:'TERMINATED_FOR_INTEGRITY'}});

      const fourth = await requestEvent(candidate.integrityToken, '00000000-0000-4000-8000-000000000013', 85_000);
      expect(fourth.status).toBe(401); // The backend invalidated the per-session event capability.
      const answer = await fetch(`${baseUrl}/interviews/${candidate.sessionId}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: started.currentQuestion.id, text: 'A late answer' }) });
      expect(answer.status).toBe(410);
      const machine = await store.load(candidate.sessionId);
      expect(machine?.toPublicState().integrity.warningCount).toBe(3);
      expect(machine?.state).toBe('TERMINATED_FOR_INTEGRITY');
    } finally {
      nowSpy.mockRestore();
    }
  });

  let uploadedResumeId: string;
  let interviewSessionId: string;

  // ---------------------------------------------------------------------------
  // 1. POST /resumes/upload
  // ---------------------------------------------------------------------------
  it('POST /resumes/upload runs ResumeAnalyzer and returns schema-validated profile', async () => {
    const res = await fetch(`${baseUrl}/resumes/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeText: STRONG_RESUME,
        candidateName: 'Alex Morgan',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();

    // Verify response matches Zod schema
    const parsed = ResumeUploadResponseSchema.parse(data);
    expect(parsed.resumeId).toMatch(/^resume_/);
    expect(parsed.candidateName).toBe('Alex Morgan');
    expect(parsed.profile.skills.length).toBeGreaterThan(0);
    expect(parsed.profile.candidate_level_hypothesis.band).toBe('senior');
    expect(parsed.audit.passes).toBe(true);

    uploadedResumeId = parsed.resumeId;
  });

  it('POST /resumes/upload accepts base64 document file and extracts text correctly', async () => {
    const fileBase64 = Buffer.from(STRONG_RESUME).toString('base64');
    const res = await fetch(`${baseUrl}/resumes/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileBase64,
        fileName: 'alex_morgan_resume.txt',
        candidateName: 'Alex Morgan',
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    const parsed = ResumeUploadResponseSchema.parse(data);
    expect(parsed.resumeId).toMatch(/^resume_/);
    expect(parsed.candidateName).toBe('Alex Morgan');
    expect(parsed.profile.skills.length).toBeGreaterThan(0);
    expect(parsed.resumeText).toContain('Alex Morgan');
  });

  it('GET /interviews/recent returns completed interviews list', async () => {
    const res = await fetch(`${baseUrl}/interviews/recent`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.interviews)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 2. GET /resumes/:id
  // ---------------------------------------------------------------------------
  it('GET /resumes/:id returns previously parsed profile', async () => {
    const res = await fetch(`${baseUrl}/resumes/${uploadedResumeId}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    const parsed = ResumeGetResponseSchema.parse(data);
    expect(parsed.resumeId).toBe(uploadedResumeId);
    expect(parsed.candidateName).toBe('Alex Morgan');
  });

  it('GET /resumes/:id returns 404 for unknown resume id', async () => {
    const res = await fetch(`${baseUrl}/resumes/non_existent_id`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(ErrorResponseSchema.parse(data).error).toContain('not found');
  });

  // ---------------------------------------------------------------------------
  // 3. POST /interviews
  // ---------------------------------------------------------------------------
  it('POST /interviews initializes state machine in READY state', async () => {
    const res = await fetch(`${baseUrl}/interviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resumeId: uploadedResumeId,
        numRounds: 2,
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();

    const parsed = InterviewCreateResponseSchema.parse(data);
    expect(parsed.sessionId).toMatch(/^session_/);
    expect(parsed.state).toBe('READY');
    expect(parsed.currentRound).toBe(1);
    expect(parsed.maxRounds).toBe(2);
    expect(parsed.publicState.currentQuestion).toBeNull();

    interviewSessionId = parsed.sessionId;
  });

  // ---------------------------------------------------------------------------
  // 4. POST /interviews/:id/start
  // ---------------------------------------------------------------------------
  it('POST /interviews/:id/start transitions to IN_PROGRESS and emits initial question', async () => {
    const res = await fetch(`${baseUrl}/interviews/${interviewSessionId}/start`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    const parsed = InterviewStartResponseSchema.parse(data);
    expect(parsed.state).toBe('IN_PROGRESS');
    expect(parsed.currentQuestion.id).toBeTruthy();
    expect(parsed.currentQuestion.prompt).toBeTruthy();
    expect(parsed.currentQuestion.difficulty).toBeGreaterThanOrEqual(1);

    // Anti-cheating check: expected answer points must be omitted
    expect((parsed.currentQuestion as any).expected_answer_points).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 5. POST /interviews/:id/answer
  // ---------------------------------------------------------------------------
  it('POST /interviews/:id/answer runs AnswerEvaluator + AdaptiveEngine', async () => {
    const res = await fetch(`${baseUrl}/interviews/${interviewSessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'In PostgreSQL, MVCC avoids blocking reads and writes by keeping tuple versions with xmin and xmax.',
        elapsedSec: 45,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    const parsed = InterviewAnswerResponseSchema.parse(data);
    expect(parsed.state).toBe('EVALUATING');
    expect(parsed.evaluation.grade).toBeGreaterThanOrEqual(0);
    expect(parsed.evaluation.grade).toBeLessThanOrEqual(10);
    expect(parsed.publicState.progress.totalQuestionsAnswered).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // 6. POST /interviews/:id/next-question
  // ---------------------------------------------------------------------------
  it('POST /interviews/:id/next-question runs QuestionGenerator adaptively', async () => {
    const res = await fetch(`${baseUrl}/interviews/${interviewSessionId}/next-question`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    const parsed = InterviewNextQuestionResponseSchema.parse(data);
    expect(parsed.state).toBe('IN_PROGRESS');
    expect(parsed.currentQuestion.id).toBeTruthy();
    expect(parsed.currentQuestion.prompt).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // 7. POST /interviews/:id/complete
  // ---------------------------------------------------------------------------
  it('POST /interviews/:id/complete runs ScoringEngine and finalizes report', async () => {
    // Answer the second question
    await fetch(`${baseUrl}/interviews/${interviewSessionId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'B-tree indexes provide logarithmic search, insertion, and deletion complexity.',
        elapsedSec: 30,
      }),
    });

    const premature = await fetch(`${baseUrl}/interviews/${interviewSessionId}/complete`, { method: 'POST' });
    expect(premature.status).toBe(409);
    // Finish the real plan rather than force-completing a partial interview.
    for (let remaining = 0; remaining < 8; remaining++) {
      if ((await store.load(interviewSessionId))?.state === 'COMPLETED') break;
      const next = await fetch(`${baseUrl}/interviews/${interviewSessionId}/next-question`, { method: 'POST' });
      expect(next.status).toBe(200);
      const answered = await fetch(`${baseUrl}/interviews/${interviewSessionId}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'I would explain the mechanism, compare alternatives and verify the behavior with a concrete example.' }) });
      expect(answered.status).toBe(200);
    }

    const res = await fetch(`${baseUrl}/interviews/${interviewSessionId}/complete`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    const parsed = InterviewCompleteResponseSchema.parse(data);
    expect(parsed.state).toBe('COMPLETED');
    expect(parsed.overallScore).toBeGreaterThanOrEqual(0);
    expect(parsed.overallScore).toBeLessThanOrEqual(100);
    expect(parsed.performanceBand).toBeTruthy();
    expect(parsed.componentScores.technical).toBeGreaterThanOrEqual(0);
    expect(parsed.componentScores.problemSolving).toBeGreaterThanOrEqual(0);
    expect(parsed.componentScores.communication).toBeGreaterThanOrEqual(0);
  });

  // ---------------------------------------------------------------------------
  // 8. GET /interviews/:id/results
  // ---------------------------------------------------------------------------
  it('GET /interviews/:id/results returns score + skill map + roadmap', async () => {
    const res = await fetch(`${baseUrl}/interviews/${interviewSessionId}/results`);
    expect(res.status).toBe(200);

    const data = await res.json();
    const parsed = InterviewResultsResponseSchema.parse(data);

    expect(parsed.sessionId).toBe(interviewSessionId);
    expect(parsed.state).toBe('COMPLETED');
    expect(parsed.overallScore).toBeGreaterThanOrEqual(0);
    expect(parsed.skillMap).toBeDefined();
    expect(Object.keys(parsed.skillMap).length).toBeGreaterThan(0);
    expect(Array.isArray(parsed.gaps)).toBe(true);
    expect(Array.isArray(parsed.roadmap)).toBe(true);
    expect(parsed.roadmap.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 9. State Integrity & Guard Checks
  // ---------------------------------------------------------------------------
  it('prevents frontend from dictating illegal state transitions', async () => {
    // Cannot call /start on an already completed interview
    const res = await fetch(`${baseUrl}/interviews/${interviewSessionId}/start`, {
      method: 'POST',
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe('INVALID_STATE_TRANSITION');
  });
});
