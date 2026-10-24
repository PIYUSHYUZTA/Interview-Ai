import type { CandidateAnswer, Question, QuestionEvaluation, RubricCriteria } from '../../types.js';
import { finalGrade } from '../Rubric.js';
import { norm, round } from '../../utils/norm.js';

/**
 * Deterministic graders for objective question types: multiple choice and
 * short numeric answers. These need no LLM — they are totally reproducible.
 */
export class ObjectiveEvaluator {
  evaluateMcq(question: Question, answer: CandidateAnswer): QuestionEvaluation {
    const selected = answer.selectedChoiceIndex;
    const correct = question.correctChoiceIndex;
    const isCorrect = selected !== undefined && selected === correct;

    const criteria: RubricCriteria = {
      knowledgeDepth: isCorrect ? 9 : 2,
      recallPrecision: isCorrect ? 10 : 0,
      reasoning: isCorrect ? 9 : 2,
      appliedEvidence: 0,
      communication: 0,
    };
    const partial = selected === undefined ? 0.2 : 0; // no answer = worse than wrong guess? treat wrong
    const compliance = isCorrect ? 1 : partial;

    return {
      questionId: question.id,
      skillId: question.skillId,
      grade: finalGrade(criteria, 'mcq', compliance),
      criteria,
      rationale: isCorrect
        ? `Selected correct option ${correct}.`
        : `Selected option ${selected ?? 'none'}; expected ${correct}.`,
      rubricCompliance: compliance,
    };
  }

  evaluateNumerical(question: Question, answer: CandidateAnswer): QuestionEvaluation {
    const expected = Number(question.params?.answer);
    const tolerance = Number(question.params?.tolerance ?? 0.001);
    const candidate = parseNumber(answer.text);

    if (!Number.isFinite(expected)) {
      throw new Error(`Numerical question ${question.id} is missing a numeric params.answer.`);
    }
    if (!Number.isFinite(candidate)) {
      const criteria: RubricCriteria = { knowledgeDepth: 0, recallPrecision: 0, reasoning: 0, appliedEvidence: 0, communication: 0 };
      return {
        questionId: question.id,
        skillId: question.skillId,
        grade: 0,
        criteria,
        rationale: `No numeric answer parsed from "${answer.text}".`,
        rubricCompliance: 0,
      };
    }

    const relativeError = Math.abs(candidate - expected) / Math.max(Math.abs(expected), 1);
    const withinTolerance = relativeError <= tolerance;
    // continuous credit 1→0 as error grows beyond tolerance×10
    const credit = Math.max(0, 1 - relativeError / (tolerance * 10));

    const criteria: RubricCriteria = {
      knowledgeDepth: norm.clamp10(credit * 9),
      recallPrecision: norm.clamp10((withinTolerance ? 1 : Math.max(0, 1 - relativeError)) * 10),
      reasoning: norm.clamp10(credit * 8),
      appliedEvidence: 0,
      communication: 0,
    };

    return {
      questionId: question.id,
      skillId: question.skillId,
      grade: finalGrade(criteria, 'numerical', withinTolerance ? 1 : credit),
      criteria,
      rationale: `Answered ${round(candidate, 4)}; expected ${round(expected, 4)} ` +
        `(rel. error ${round(relativeError * 100, 2)}%). ${withinTolerance ? 'Within tolerance.' : 'Outside tolerance.'}`,
      rubricCompliance: withinTolerance ? 1 : 0,
    };
  }
}

function parseNumber(text: string): number {
  const cleaned = text.replace(/[,%$]/g, '').trim();
  const m = cleaned.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (!m) return NaN;
  const value = Number(m[0]);
  return Number.isFinite(value) ? value : NaN;
}