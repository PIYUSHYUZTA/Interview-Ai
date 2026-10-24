import type { CandidateAnswer, Question, QuestionEvaluation, RubricCriteria, SkillsTaxonomy } from '../../types.js';
import type { LLMProvider } from '../../provider/LLMProvider.js';
import type { ScoredResponse } from '../../provider/LLMProvider.js';
import { ANSWER_MARKER, ANSWER_END_MARKER } from '../../provider/DeterministicProvider.js';
import { finalGrade } from '../Rubric.js';
import { norm, round } from '../../utils/norm.js';
import { objectNode, numberNode, stringNode, type SchemaNode } from '../../ai/schema.js';
import { requestStructured } from '../../ai/json.js';

/** Schema for ScoredResponse validated by requestStructured. */
export const scoredResponseSchema: SchemaNode = objectNode({
  props: {
    criteria: objectNode({
      props: {
        knowledgeDepth: numberNode({ min: 0, max: 10 }),
        recallPrecision: numberNode({ min: 0, max: 10 }),
        reasoning: numberNode({ min: 0, max: 10 }),
        appliedEvidence: numberNode({ min: 0, max: 10 }),
        communication: numberNode({ min: 0, max: 10 }),
      },
      required: ['knowledgeDepth', 'recallPrecision', 'reasoning', 'appliedEvidence', 'communication'],
    }),
    rubricCompliance: numberNode({ min: 0, max: 1 }),
    rationale: stringNode(),
  },
  required: ['criteria', 'rubricCompliance', 'rationale'],
});

export interface NarrativeEvaluatorDeps {
  provider: LLMProvider;
  taxonomy: SkillsTaxonomy;
}

/**
 * Evaluates open-ended narrative answers (conceptual, behavioral, design,
 * situational) by delegating structured scoring to the injected provider.
 * Real providers run async evaluation; the DeterministicProvider reproduces it
 * offline so behaviour is identical in tests and production.
 */
export class NarrativeEvaluator {
  constructor(private readonly deps: NarrativeEvaluatorDeps) {}

  async evaluate(question: Question, answer: CandidateAnswer): Promise<QuestionEvaluation> {
    const skillLabel = this.deps.taxonomy.get(question.skillId)?.label ?? question.skillId;
    const prompt = this.buildPrompt(question, answer, skillLabel);

    const result = await requestStructured<ScoredResponse>({
      provider: this.deps.provider,
      task: 'score_open_response',
      prompt,
      schema: scoredResponseSchema,
      options: { temperature: 0 },
    });

    if (!result.ok) throw new EvaluationUnavailableError();

    const scored = result.value!;
    const criteria = clampCriteria(scored.criteria);
    const compliance = norm.clamp01(scored.rubricCompliance);

    return {
      questionId: question.id,
      skillId: question.skillId,
      grade: finalGrade(criteria, question.type, compliance),
      criteria,
      rationale: scored.rationale,
      rubricCompliance: round(compliance, 2),
    };
  }

  private buildPrompt(question: Question, answer: CandidateAnswer, skillLabel: string): string {
    const answerText = answer.text || answer.code || '';
    return [
      'You are a seasoned interviewer grading an open-response interview answer.',
      '',
      `QUESTION <<<${question.id}>>> (${question.type}, difficulty ${question.difficulty}):`,
      `<<<QUESTION>>>${question.prompt}<<<END_QUESTION>>>`,
      '',
      `SKILL: ${skillLabel}`,
      `DIFFICULTY: ${question.difficulty}`,
      '',
      'RUBRIC_HINTS:',
      ...question.rubricHints.map((hint) => `- ${hint}`),
      'END_RUBRIC_HINTS',
      '',
      'Grade on a 0..10 scale for each criterion. Be conservative: only give full ',
      'marks for clearly demonstrated knowledge, specificity, concrete examples, and ',
      'articulate reasoning. Penalise vagueness and overgeneralisation.',
      'Separate technical correctness from communication: a correct idea explained ',
      'unclearly can score well for knowledge and lower for communication. Do not ',
      'treat missing work experience as proof of missing fundamentals; assess the ',
      'concepts the candidate actually explains and score applied evidence separately.',
      'Use only evidence in the answer. Do not infer confidence, emotion, or intent.',
      'In rationale, identify the strongest demonstrated point and the most important ',
      'missing or unclear point, without repeating a numeric score.',
      '',
      'CANDIDATE ANSWER:',
      `${ANSWER_MARKER}`,
      answerText,
      `${ANSWER_END_MARKER}`,
      '',
      'Respond with a JSON object of exactly the shape:',
      '{"criteria":{"knowledgeDepth":0,"recallPrecision":0,"reasoning":0,',
      '"appliedEvidence":0,"communication":0},"rubricCompliance":0,"rationale":""}',
    ].join('\n');
  }
}

export class EvaluationUnavailableError extends Error {
  constructor() { super('Answer evaluation is temporarily unavailable. Your answer was not scored. Please retry.'); this.name = 'EvaluationUnavailableError'; }
}

function clampCriteria(c: Readonly<RubricCriteria>): RubricCriteria {
  return {
    knowledgeDepth: norm.clamp10(c.knowledgeDepth),
    recallPrecision: norm.clamp10(c.recallPrecision),
    reasoning: norm.clamp10(c.reasoning),
    appliedEvidence: norm.clamp10(c.appliedEvidence),
    communication: norm.clamp10(c.communication),
  };
}
