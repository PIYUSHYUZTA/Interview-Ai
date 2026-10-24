import { describe, expect, it } from 'vitest';
import { EvidenceTracer } from './EvidenceTracer.js';
import type { CandidateAnswer, Claim, Question, QuestionEvaluation } from '../types.js';

function claim(skillId: string, id = `c-${skillId}`): Claim {
  return { id, text: `Claims ${skillId}`, source: 'resume', skillIds: [skillId], weight: 0.8, verdict: 'unverified', evidenceIds: [] };
}

function questionFor(skillId: string): Question {
  return {
    id: `q-${skillId}`,
    skillId,
    subtopic: 'core',
    type: 'conceptual',
    difficulty: 3,
    prompt: 'P?',
    rubricHints: [],
    timeBudgetSec: 180,
  };
}

function answerFor(qid: string, text: string): CandidateAnswer {
  return { questionId: qid, text, elapsedSec: 60, timestamp: Date.now() };
}

function evaluationFor(skillId: string, qid: string, grade: number, applied = 8): QuestionEvaluation {
  return {
    questionId: qid,
    skillId,
    grade,
    criteria: { knowledgeDepth: grade, recallPrecision: grade, reasoning: grade, appliedEvidence: applied, communication: 6 },
    rationale: 'deterministic test grade',
    rubricCompliance: grade / 10,
  };
}

describe('ASSESS — evidence tracing resolves claims', () => {
  it('validates a claim after consistently strong, evidence-rich answers', () => {
    const tracer = new EvidenceTracer([claim('backend')]);
    const q = questionFor('backend');
    tracer.record({ question: q, answer: answerFor(q.id, 'I built X in production with a unique constraint.'), evaluation: evaluationFor('backend', q.id, 9) });
    tracer.record({ question: q, answer: answerFor(q.id, 'I scaled Y and measured latency drop.'), evaluation: evaluationFor('backend', q.id, 8) });

    const { claims } = tracer.resolve();
    expect(claims[0].verdict).toBe('validated');
    expect(claims[0].evidenceIds.length).toBeGreaterThanOrEqual(2);
  });

  it('refutes a claim after consistently weak answers', () => {
    const tracer = new EvidenceTracer([claim('databases')]);
    const q = questionFor('databases');
    tracer.record({ question: q, answer: answerFor(q.id, 'I guess stuff.'), evaluation: evaluationFor('databases', q.id, 2, 1) });
    tracer.record({ question: q, answer: answerFor(q.id, 'Not sure really.'), evaluation: evaluationFor('databases', q.id, 1, 0) });

    const { claims } = tracer.resolve();
    expect(claims[0].verdict).toBe('refuted');
  });

  it('leaves an untouched claim unverified', () => {
    const tracer = new EvidenceTracer([claim('security')]);
    const { counts } = tracer.resolve();
    expect(counts.unverified).toBe(1);
    expect(counts.validated).toBe(0);
  });

  it('keeps irrelevant evidence out of other claims', () => {
    const tracer = new EvidenceTracer([claim('backend'), claim('security')]);
    const q = questionFor('backend');
    tracer.record({ question: q, answer: answerFor(q.id, 'Great answer about APIs.'), evaluation: evaluationFor('backend', q.id, 9) });
    const { claims } = tracer.resolve();
    const security = claims.find((c) => c.id === 'c-security');
    expect(security?.verdict).toBe('unverified');
  });
});