import type { CandidateAnswer, CodeQuestion, Question, QuestionEvaluation, SkillsTaxonomy } from '../../types.js';
import type { LLMProvider } from '../../provider/LLMProvider.js';
import { NarrativeEvaluator } from './NarrativeEvaluator.js';
import { CodeEvaluator } from './CodeEvaluator.js';
import { ObjectiveEvaluator } from './ObjectiveEvaluator.js';

export interface CompositeEvaluatorDeps {
  provider: LLMProvider;
  taxonomy: SkillsTaxonomy;
}

function isCodeQuestion(q: Question): q is CodeQuestion {
  return 'starterCode' in q;
}

/**
 * Single grading entry point: routes each question to the right evaluator.
 * - conceptual / behavioral / system_design / situational → narrative (LLM or deterministic)
 * - code → VM test runner
 * - mcq / numerical → objective deterministic grader
 */
export class CompositeEvaluator {
  private readonly narrative: NarrativeEvaluator;
  private readonly code: CodeEvaluator;
  private readonly objective: ObjectiveEvaluator;

  constructor(deps: CompositeEvaluatorDeps) {
    this.narrative = new NarrativeEvaluator({ provider: deps.provider, taxonomy: deps.taxonomy });
    this.code = new CodeEvaluator();
    this.objective = new ObjectiveEvaluator();
  }

  async evaluate(question: Question, answer: CandidateAnswer): Promise<QuestionEvaluation> {
    switch (question.type) {
      case 'conceptual':
      case 'behavioral':
      case 'system_design':
      case 'situational':
        return this.narrative.evaluate(question, answer);
      case 'code':
        if (!isCodeQuestion(question)) throw new Error('Code question missing code payload.');
        return this.code.evaluate(question, answer);
      case 'mcq':
        return this.objective.evaluateMcq(question, answer);
      case 'numerical':
        return this.objective.evaluateNumerical(question, answer);
      default:
        throw new Error(`Unsupported question type: ${question.type}`);
    }
  }
}