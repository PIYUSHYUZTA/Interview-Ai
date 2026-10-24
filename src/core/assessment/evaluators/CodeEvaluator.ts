import { runInNewContext } from 'node:vm';
import type { CodeQuestion, CandidateAnswer, QuestionEvaluation, RubricCriteria } from '../../types.js';
import { finalGrade } from '../Rubric.js';
import { norm } from '../../utils/norm.js';

type TestCaseList = NonNullable<CodeQuestion['testCases']>;

export interface CodeRunResult {
  readonly passed: number;
  readonly total: number;
  readonly error: string | null;
}

export interface CodeEvaluatorDeps {
  runTests(code: string, testCases: TestCaseList | undefined): Promise<CodeRunResult>;
}

/** Default VM sandbox: only leak `console`, synchronous, 3s guard. */
const defaultDeps: CodeEvaluatorDeps = {
  async runTests(code, testCases) {
    if (!testCases || testCases.length === 0) {
      return { passed: 0, total: 0, error: 'No test cases supplied' };
    }

    let fn: ((...args: unknown[]) => unknown) | null = null;
    try {
      const context: Record<string, unknown> = { console };
      runInNewContext(code, context, { timeout: 3000 });
      // discover the candidate's top-level function, whatever they named it
      const candidates = Object.keys(context).filter((k) => typeof context[k] === 'function');
      if (candidates.length > 0) fn = context[candidates[0]] as (...args: unknown[]) => unknown;
    } catch (err) {
      return { passed: 0, total: testCases.length, error: err instanceof Error ? err.message : String(err) };
    }
    if (!fn) {
      return { passed: 0, total: testCases.length, error: 'No function defined in the submitted code' };
    }

    let passed = 0;
    let firstError: string | null = null;
    for (const tc of testCases) {
      try {
        const actual = fn(...tc.input);
        if (deepEqual(actual, tc.expected)) passed++;
      } catch (err) {
        if (firstError === null) {
          firstError = err instanceof Error ? err.message : String(err);
        }
      }
    }
    return { passed, total: testCases.length, error: firstError };
  },
};

/**
 * Executes candidate code against test cases in a VM sandbox and grades it.
 * Function correctness maps directly to knowledge/reasoning criteria.
 */
export class CodeEvaluator {
  constructor(private readonly deps: CodeEvaluatorDeps = defaultDeps) {}

  async evaluate(question: CodeQuestion, answer: CandidateAnswer): Promise<QuestionEvaluation> {
    // Non-executable languages (e.g. SQL) are graded against rubric-cue coverage.
    if (question.language !== 'javascript') {
      return this.evaluateTextualCode(question, answer);
    }

    const { passed, total, error } = await this.deps.runTests(answer.code ?? '', question.testCases);
    const passRatio = total > 0 ? passed / total : 0;

    const criteria: RubricCriteria = {
      knowledgeDepth: norm.clamp10(2 + passRatio * 7),
      recallPrecision: norm.clamp10(1 + (error ? 0 : passRatio * 8)),
      reasoning: norm.clamp10(1.5 + passRatio * 7.5),
      appliedEvidence: norm.clamp10(0.5 + passRatio * 8),
      communication: norm.clamp10(2 + Math.min(4, commentDensity(answer.code ?? '') * 8)),
    };

    const rationale =
      error ? `Code error: ${error}` :
        total === 0 ? 'No test cases available.' :
          `Passed ${passed}/${total} test cases.`;

    return {
      questionId: question.id,
      skillId: question.skillId,
      grade: finalGrade(criteria, 'code', passRatio),
      criteria,
      rationale,
      rubricCompliance: passRatio,
    };
  }

  /** Textual-code grading: how many scoring cues does the written answer cover? */
  private evaluateTextualCode(question: CodeQuestion, answer: CandidateAnswer): QuestionEvaluation {
    const text = `${answer.code ?? ''} ${answer.text}`.toLowerCase();
    const hints = question.rubricHints;
    const covered = hints.filter((h) => text.includes(h.toLowerCase())).length;
    const coverage = hints.length > 0 ? covered / hints.length : 0.5;

    const criteria: RubricCriteria = {
      knowledgeDepth: norm.clamp10(2 + coverage * 7),
      recallPrecision: norm.clamp10(1 + coverage * 8),
      reasoning: norm.clamp10(2 + coverage * 7),
      appliedEvidence: norm.clamp10(0.5 + coverage * 8),
      communication: norm.clamp10(2 + Math.min(4, (answer.code?.length ?? 0) / 300)),
    };

    return {
      questionId: question.id,
      skillId: question.skillId,
      grade: finalGrade(criteria, 'code', coverage),
      criteria,
      rationale: `${question.language} code reviewed against rubric cues: covered ${covered}/${hints.length}.`,
      rubricCompliance: coverage,
    };
  }
}

function commentDensity(code: string): number {
  const lines = code.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return 0;
  const comments = lines.filter((l) => /^\s*(\/\/|#|\/\*|\*)/.test(l)).length;
  return comments / lines.length;
}

/** Structural deep equality (handles arrays, plain objects, primitives). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}