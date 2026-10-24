import { describe, expect, it } from 'vitest';
import { DeterministicProvider } from '../../provider/DeterministicProvider.js';
import { CompositeEvaluator } from './CompositeEvaluator.js';
import { defaultTaxonomy } from '../../taxonomy/skills.js';
import type { CandidateAnswer, CodeQuestion, Question } from '../../types.js';

const provider = new DeterministicProvider();
const evaluator = new CompositeEvaluator({ provider, taxonomy: defaultTaxonomy });

function question(partial: Partial<Question> & Pick<Question, 'skillId' | 'type'>): Question {
  return {
    id: partial.id ?? `q-${partial.skillId}`,
    skillId: partial.skillId,
    subtopic: partial.subtopic ?? 'core',
    type: partial.type,
    difficulty: partial.difficulty ?? 3,
    prompt: partial.prompt ?? 'Explain the core concept.',
    rubricHints: partial.rubricHints ?? ['trade-offs'],
    timeBudgetSec: partial.timeBudgetSec ?? 180,
    ...(partial.params ? { params: partial.params } : {}),
    ...(partial.choices ? { choices: partial.choices, correctChoiceIndex: partial.correctChoiceIndex } : {}),
  };
}

function answer(qid: string, text: string, extra: Partial<CandidateAnswer> = {}): CandidateAnswer {
  return { questionId: qid, text, elapsedSec: 60, timestamp: Date.now(), ...extra };
}

describe('ASSESS — narrative evaluation (deterministic provider)', () => {
  it('scores a rich, evidence-backed answer higher than a vague one', async () => {
    const q = question({
      skillId: 'backend',
      type: 'conceptual',
      rubricHints: ['idempotency keys', 'unique constraint'],
    });
    const strong = await evaluator.evaluate(
      q,
      answer(q.id, 'I designed an idempotent payments API. We stored idempotency keys with a unique constraint so retries could never double-charge. In production this cut duplicate charges to zero.'),
    );
    const weak = await evaluator.evaluate(q, answer(q.id, 'I would probably cache stuff maybe and things. It depends.'));
    expect(strong.grade).toBeGreaterThan(weak.grade);
    expect(strong.rubricCompliance).toBeGreaterThan(weak.rubricCompliance);
    expect(strong.criteria.knowledgeDepth).toBeGreaterThan(weak.criteria.knowledgeDepth);
  });

  it('always returns criteria in the valid 0..10 range', async () => {
    const q = question({ skillId: 'system_design', type: 'system_design' });
    const ev = await evaluator.evaluate(q, answer(q.id, 'Design a URL shortener...'));
    for (const v of Object.values(ev.criteria)) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of Object.values(ev.criteria)) expect(v).toBeLessThanOrEqual(10);
    expect(ev.grade).toBeGreaterThanOrEqual(0);
    expect(ev.grade).toBeLessThanOrEqual(10);
  });
});

describe('ASSESS — code evaluation (VM sandbox)', () => {
  const codeQuestion: CodeQuestion = {
    id: 'q-code-algo',
    skillId: 'algorithms',
    subtopic: 'sliding window',
    type: 'code',
    difficulty: 3,
    prompt: 'Implement maxSumOfSubarray(nums, k).',
    rubricHints: ['O(n)', 'sliding window'],
    timeBudgetSec: 600,
    starterCode: 'function maxSumOfSubarray(nums, k) {}',
    language: 'javascript',
    numTestCases: 3,
    testCases: [
      { input: [[1, 2, 3, 4, 5], 2], expected: 9 },
      { input: [[-1, -2, 3, -4], 2], expected: 1 },
      { input: [[5], 1], expected: 5 },
    ],
  };

  it('gives a high grade to a correct solution', async () => {
    const ev = await evaluator.evaluate(
      codeQuestion,
      answer(codeQuestion.id, '', {
        code: `function maxSumOfSubarray(nums, k) {
  if (k > nums.length) return -Infinity;
  let w = 0;
  for (let i = 0; i < k; i++) w += nums[i];
  let best = w;
  for (let i = k; i < nums.length; i++) {
    w += nums[i] - nums[i - k];
    best = Math.max(best, w);
  }
  return best;
}`,
      }),
    );
    expect(ev.rubricCompliance).toBe(1);
    expect(ev.grade).toBeGreaterThanOrEqual(7);
  });

  it('fails gracefully on broken code', async () => {
    const ev = await evaluator.evaluate(codeQuestion, answer(codeQuestion.id, '', { code: 'function maxSumOfSubarray() { throw new Error("boom"); }' }));
    expect(ev.grade).toBeLessThan(5);
    expect(ev.rationale).toContain('boom');
  });
});

describe('ASSESS — objective evaluation', () => {
  it('grades a correct MCQ at high precision', async () => {
    const q = question({
      skillId: 'databases',
      type: 'mcq',
      choices: ['A', 'B', 'C', 'D'],
      correctChoiceIndex: 2,
    });
    const ev = await evaluator.evaluate(q, answer(q.id, '', { selectedChoiceIndex: 2 }));
    expect(ev.criteria.recallPrecision).toBe(10);
    expect(ev.grade).toBeGreaterThanOrEqual(7);
  });

  it('grades a wrong MCQ harshly', async () => {
    const q = question({
      skillId: 'databases',
      type: 'mcq',
      choices: ['A', 'B', 'C', 'D'],
      correctChoiceIndex: 2,
    });
    const ev = await evaluator.evaluate(q, answer(q.id, '', { selectedChoiceIndex: 0 }));
    expect(ev.grade).toBeLessThan(4);
  });

  it('parses numeric answers and applies tolerance', async () => {
    const q = question({
      skillId: 'system_design',
      type: 'numerical',
      params: { answer: 100, tolerance: 0.05 },
    });
    const ok = await evaluator.evaluate(q, answer(q.id, '100 TB'));
    const off = await evaluator.evaluate(q, answer(q.id, '300 TB'));
    expect(ok.grade).toBeGreaterThan(off.grade);
  });
});