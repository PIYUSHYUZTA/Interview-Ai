import type { CandidateAnswer, Question } from '../core/types.js';

export interface CandidateAbility {
  readonly trueAbility: ReadonlyMap<string, number>; // skillId -> 0..1
  readonly noise?: number; // 0..1 extra per-question variance
}

const RICH_PHRASES = [
  'In production we saw latency drop from 800ms to 90ms after we introduced an index and a cache layer.',
  'The trade-off was consistency versus availability; we accepted eventual consistency with a bounded window.',
  'I designed the API to be idempotent with a unique constraint, so a retry could never double-charge.',
  'We used load balancers and horizontal scaling, and I verified the bottleneck with profiling before optimizing.',
  'The architecture handled 10x the traffic after partitioning by tenant and sharding the database.',
];

const VAGUE_ANSWER = 'I think I would probably try something with the database and maybe add some caching, sort of. It depends, I guess.';

/**
 * A pluggable, deterministic candidate for offline end-to-end runs.
 *
 * It answers from a *true ability* per skill, so tests and demos can verify
 * that the intelligence loop converges toward the ground truth instead of
 * chasing single answers.
 */
export class CandidateSimulator {
  private rng: () => number;

  constructor(
    private readonly ability: CandidateAbility,
    private readonly seed = 7,
  ) {
    this.rng = mulberry32(this.seed);
  }

  answerFor(question: Question): CandidateAnswer {
    const skillAbility = this.clamp01(this.ability.trueAbility.get(question.skillId) ?? 0.4);
    const noise = (this.ability.noise ?? 0.12) * (this.rng() - 0.5);
    const ability = this.clamp01(skillAbility + noise);

    const text = this.textFor(question, ability);
    const code = this.codeFor(question, ability);
    const selectedChoiceIndex =
      question.type === 'mcq'
        ? this.choiceFor(question, ability)
        : question.correctChoiceIndex;

    return {
      questionId: question.id,
      text,
      code,
      elapsedSec: 30 + Math.round(question.difficulty * 15),
      selectedChoiceIndex,
      timestamp: Date.now(),
    };
  }

  private textFor(question: Question, ability: number): string {
    if (question.type === 'mcq' || question.type === 'numerical') return '';
    if (ability < 0.35) return VAGUE_ANSWER;
    if (ability < 0.65) {
      const covered = question.rubricHints.slice(0, Math.max(1, Math.round(question.rubricHints.length * ability)));
      return (
        'I would start by breaking the problem down into steps. ' +
        `${covered.join('. ')}. ` +
        'One thing I remember is that a good answer should consider trade-offs and edge cases before committing.'
      );
    }
    const covered = question.rubricHints;
    const evidence = RICH_PHRASES[Math.floor(this.rng() * RICH_PHRASES.length)];
    return [
      'First, I clarify the requirements and the constraints, then I sketch the approach and the alternatives.',
      `Because of that reasoning, I would cover: ${covered.join(', ')}.`,
      evidence,
      'On the other hand, the main trade-off here is performance versus complexity, so I would validate with benchmarks and keep a rollback path.',
      'In summary, I would start small, measure, and iterate — and I would document the decision for the team.',
    ].join('\n');
  }

  private codeFor(question: Question, ability: number): string | undefined {
    if (question.type !== 'code') return undefined;
    if (ability < 0.4) return 'function solution(a, b) {\n  return "not sure";\n}';

    if (question.subtopic === 'sliding window') {
      return `function maxSumOfSubarray(nums, k) {
  if (k > nums.length) return -Infinity;
  let window = 0;
  for (let i = 0; i < k; i++) window += nums[i];
  let best = window;
  for (let i = k; i < nums.length; i++) {
    window += nums[i] - nums[i - k];
    best = Math.max(best, window);
  }
  return best;
}`;
    }
    if (question.subtopic === 'top-earner SQL') {
      return `SELECT d.name, e.name AS employee, e.salary
FROM departments d
JOIN employees e ON e.department_id = d.id
WHERE (e.department_id, e.salary) IN (
  SELECT department_id, MAX(salary) FROM employees GROUP BY department_id
);`;
    }
    return `function solution(input) {
  // ${question.rubricHints.join(', ')}
  return input;
}`;
  }

  private choiceFor(question: Question, ability: number): number {
    if (question.correctChoiceIndex === undefined) return this.rngIndex(question.choices?.length ?? 2);
    return this.rng() < ability ? question.correctChoiceIndex : this.wrongIndex(question);
  }

  private wrongIndex(question: Question): number {
    const count = question.choices?.length ?? 2;
    if (count <= 1) return 0;
    let idx = this.rngIndex(count);
    while (idx === question.correctChoiceIndex) idx = this.rngIndex(count);
    return idx;
  }

  private rngIndex(count: number): number {
    return Math.floor(this.rng() * count);
  }

  private clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}