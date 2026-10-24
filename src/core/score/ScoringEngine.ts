import type { QuestionEvaluation, RubricCriteria } from '../types.js';
import type { AnswerEvaluatorOutput } from '../assessment/evaluators/AnswerEvaluator.js';
import { norm, round } from '../utils/norm.js';

/**
 * Category weights specified for Service 5 Scoring Engine:
 * Technical 25%, Problem Solving 25%, Communication 15%, Logical Reasoning 15%, Adaptability 10%, Delivery 10%
 * Sums to exactly 100% (1.00).
 */
export interface ScoringCategoryWeights {
  readonly technical: number; // 0.25 (25%)
  readonly problemSolving: number; // 0.25 (25%)
  readonly communication: number; // 0.15 (15%)
  readonly logicalReasoning: number; // 0.15 (15%)
  readonly adaptability: number; // 0.10 (10%)
  readonly delivery: number; // 0.10 (10%)
}

export const SCORING_WEIGHTS: ScoringCategoryWeights = {
  technical: 0.25,
  problemSolving: 0.25,
  communication: 0.15,
  logicalReasoning: 0.15,
  adaptability: 0.10,
  delivery: 0.10,
};

/**
 * Component scores for the 6 evaluation categories (all in 0..10).
 */
export interface ComponentScores {
  readonly technical: number; // 0..10 (Technical Knowledge & Depth)
  readonly problemSolving: number; // 0..10 (Problem Solving & Reasoning)
  readonly communication: number; // 0..10 (Communication & Clarity)
  readonly logicalReasoning: number; // 0..10 (Logical Reasoning & Applied Evidence)
  readonly adaptability: number; // 0..10 (Adaptability & Recall Precision)
  readonly delivery: number; // 0..10 (Delivery & Rubric Compliance)

  // Backwards-compatible alias for pre-existing codebase references
  readonly technicalKnowledge: number;
}

export interface ScoringEngineResult {
  readonly overallScore: number; // 0..10
  readonly componentScores: ComponentScores;
  readonly weights: ScoringCategoryWeights;
  readonly weightedContributions: Record<keyof ScoringCategoryWeights, number>;
  readonly formula: string;
  readonly sampleCount: number;
}

export interface ScoringEngineAuditResult {
  readonly passes: boolean;
  readonly findings: readonly {
    readonly severity: 'ok' | 'violation' | 'warning';
    readonly scope: string;
    readonly message: string;
  }[];
}

export type EvaluatorScoreInput =
  | QuestionEvaluation
  | AnswerEvaluatorOutput
  | ComponentScores
  | {
      readonly technical?: number;
      readonly technicalKnowledge?: number;
      readonly technical_depth?: number;
      readonly problemSolving?: number;
      readonly problem_solving?: number;
      readonly reasoning?: number;
      readonly communication?: number;
      readonly logicalReasoning?: number;
      readonly logical_reasoning?: number;
      readonly appliedEvidence?: number;
      readonly adaptability?: number;
      readonly correctness?: number;
      readonly recallPrecision?: number;
      readonly delivery?: number;
      readonly rubricCompliance?: number;
      readonly confidence?: number;
      [key: string]: unknown;
    };

/**
 * Service 5: Scoring Engine (deterministic, NOT an LLM call)
 *
 * Mandate:
 * Backend-calculated weighted score from Evaluator outputs:
 *   Technical........... 25%
 *   Problem Solving...... 25%
 *   Communication........ 15%
 *   Logical Reasoning.... 15%
 *   Adaptability......... 10%
 *   Delivery............. 10%
 *
 * Characteristics:
 * - 100% Pure, deterministic computation — zero LLM calls, zero network I/O, zero side-effects.
 * - Fully unit-testable against known mathematical inputs.
 * - Maps directly from AnswerEvaluator outputs (Service 3), QuestionEvaluation objects, or raw category scores.
 * - Supports multi-evaluation session aggregation.
 * - Fully explainable: preserves category scores, contributions, weights, and formula.
 */
export class ScoringEngine {
  /**
   * Weights constant strictly summing to 1.00 (100%).
   */
  static readonly WEIGHTS: ScoringCategoryWeights = SCORING_WEIGHTS;

  /**
   * Calculate deterministic weighted score from any evaluator output, component scores,
   * or an array of evaluations across an interview session.
   */
  static calculate(input: EvaluatorScoreInput | readonly EvaluatorScoreInput[]): ScoringEngineResult {
    const items = Array.isArray(input) ? input : [input];
    if (items.length === 0) {
      const zeroScores: ComponentScores = {
        technical: 0,
        problemSolving: 0,
        communication: 0,
        logicalReasoning: 0,
        adaptability: 0,
        delivery: 0,
        technicalKnowledge: 0,
      };
      return this.buildResult(zeroScores, 0);
    }

    const mappedScores = items.map((item) => this.mapToComponentScores(item));

    // Aggregate average component scores across all evaluated items
    const sampleCount = mappedScores.length;
    const avgScores: ComponentScores = {
      technical: round(norm.clamp10(mappedScores.reduce((acc, s) => acc + s.technical, 0) / sampleCount), 2),
      problemSolving: round(norm.clamp10(mappedScores.reduce((acc, s) => acc + s.problemSolving, 0) / sampleCount), 2),
      communication: round(norm.clamp10(mappedScores.reduce((acc, s) => acc + s.communication, 0) / sampleCount), 2),
      logicalReasoning: round(norm.clamp10(mappedScores.reduce((acc, s) => acc + s.logicalReasoning, 0) / sampleCount), 2),
      adaptability: round(norm.clamp10(mappedScores.reduce((acc, s) => acc + s.adaptability, 0) / sampleCount), 2),
      delivery: round(norm.clamp10(mappedScores.reduce((acc, s) => acc + s.delivery, 0) / sampleCount), 2),
      technicalKnowledge: round(norm.clamp10(mappedScores.reduce((acc, s) => acc + s.technical, 0) / sampleCount), 2),
    };

    return this.buildResult(avgScores, sampleCount);
  }

  /**
   * Compute the overall score (0..10) from ComponentScores and the defined weights.
   */
  static computeOverallScore(scores: ComponentScores | Partial<ComponentScores>): number {
    const technical = norm.clamp10(scores.technical ?? (scores as any).technicalKnowledge ?? 0);
    const problemSolving = norm.clamp10(scores.problemSolving ?? (scores as any).problem_solving ?? 0);
    const communication = norm.clamp10(scores.communication ?? 0);
    const logicalReasoning = norm.clamp10(scores.logicalReasoning ?? (scores as any).logical_reasoning ?? 0);
    const adaptability = norm.clamp10(scores.adaptability ?? 0);
    const delivery = norm.clamp10(scores.delivery ?? 0);

    const overall =
      technical * this.WEIGHTS.technical +
      problemSolving * this.WEIGHTS.problemSolving +
      communication * this.WEIGHTS.communication +
      logicalReasoning * this.WEIGHTS.logicalReasoning +
      adaptability * this.WEIGHTS.adaptability +
      delivery * this.WEIGHTS.delivery;

    return round(norm.clamp10(overall), 2);
  }

  /**
   * Map any evaluator output to the 6 ComponentScores.
   */
  static mapToComponentScores(item: EvaluatorScoreInput): ComponentScores {
    const obj = item as Record<string, unknown>;

    // Case A: QuestionEvaluation (with criteria + rubricCompliance)
    if (obj.criteria && typeof obj.criteria === 'object') {
      const criteria = obj.criteria as RubricCriteria;
      const compliance = typeof obj.rubricCompliance === 'number' ? obj.rubricCompliance : 0.5;
      const tech = norm.clamp10(criteria.knowledgeDepth);
      return {
        technical: tech,
        problemSolving: norm.clamp10(criteria.reasoning),
        communication: norm.clamp10(criteria.communication),
        logicalReasoning: norm.clamp10(criteria.appliedEvidence),
        adaptability: norm.clamp10(criteria.recallPrecision),
        delivery: norm.clamp10(compliance * 10),
        technicalKnowledge: tech,
      };
    }

    // Case B: AnswerEvaluatorOutput (Service 3 output)
    if (typeof obj.correctness === 'number' && typeof obj.technical_depth === 'number') {
      const tech = norm.clamp10(obj.technical_depth as number);
      const probSolving = norm.clamp10((obj.reasoning as number) ?? 0);
      const comm = norm.clamp10((obj.communication as number) ?? 0);
      const adapt = norm.clamp10((obj.correctness as number) ?? 0);

      // Logical reasoning: derived from reasoning and technical depth if not explicitly present
      const logReasoning =
        typeof obj.logicalReasoning === 'number'
          ? norm.clamp10(obj.logicalReasoning)
          : typeof obj.appliedEvidence === 'number'
          ? norm.clamp10(obj.appliedEvidence)
          : round(norm.clamp10(tech * 0.4 + probSolving * 0.6), 1);

      // Delivery: derived from confidence or rubric compliance
      const deliv =
        typeof obj.delivery === 'number'
          ? norm.clamp10(obj.delivery)
          : typeof obj.rubricCompliance === 'number'
          ? norm.clamp10((obj.rubricCompliance as number) * 10)
          : typeof obj.confidence === 'number'
          ? round(norm.clamp10((obj.confidence as number) * 10), 1)
          : round(norm.clamp10(adapt * 0.7 + comm * 0.3), 1);

      return {
        technical: tech,
        problemSolving: probSolving,
        communication: comm,
        logicalReasoning: logReasoning,
        adaptability: adapt,
        delivery: deliv,
        technicalKnowledge: tech,
      };
    }

    // Case C: Direct ComponentScores or partial object
    const tech = norm.clamp10(
      typeof obj.technical === 'number'
        ? obj.technical
        : typeof obj.technicalKnowledge === 'number'
        ? obj.technicalKnowledge
        : typeof obj.technical_depth === 'number'
        ? obj.technical_depth
        : 0,
    );

    const probSolving = norm.clamp10(
      typeof obj.problemSolving === 'number'
        ? obj.problemSolving
        : typeof obj.problem_solving === 'number'
        ? obj.problem_solving
        : typeof obj.reasoning === 'number'
        ? obj.reasoning
        : 0,
    );

    const comm = norm.clamp10(typeof obj.communication === 'number' ? obj.communication : 0);

    const logReasoning = norm.clamp10(
      typeof obj.logicalReasoning === 'number'
        ? obj.logicalReasoning
        : typeof obj.logical_reasoning === 'number'
        ? obj.logical_reasoning
        : typeof obj.appliedEvidence === 'number'
        ? obj.appliedEvidence
        : 0,
    );

    const adapt = norm.clamp10(
      typeof obj.adaptability === 'number'
        ? obj.adaptability
        : typeof obj.correctness === 'number'
        ? obj.correctness
        : typeof obj.recallPrecision === 'number'
        ? obj.recallPrecision
        : 0,
    );

    const deliv = norm.clamp10(
      typeof obj.delivery === 'number'
        ? obj.delivery
        : typeof obj.rubricCompliance === 'number'
        ? (obj.rubricCompliance as number) * 10
        : typeof obj.confidence === 'number'
        ? (obj.confidence as number) * 10
        : 0,
    );

    return {
      technical: tech,
      problemSolving: probSolving,
      communication: comm,
      logicalReasoning: logReasoning,
      adaptability: adapt,
      delivery: deliv,
      technicalKnowledge: tech,
    };
  }

  /**
   * Backwards-compatible mapFromEvaluation for existing QuestionEvaluation callers.
   */
  static mapFromEvaluation(evaluation: QuestionEvaluation): ComponentScores {
    return this.mapToComponentScores(evaluation);
  }

  /**
   * Serialize output to clean JSON format.
   */
  static toJSON(result: ScoringEngineResult): string {
    const clean = {
      overall_score: result.overallScore,
      component_scores: {
        technical: result.componentScores.technical,
        problem_solving: result.componentScores.problemSolving,
        communication: result.componentScores.communication,
        logical_reasoning: result.componentScores.logicalReasoning,
        adaptability: result.componentScores.adaptability,
        delivery: result.componentScores.delivery,
      },
      weights: {
        technical: result.weights.technical,
        problem_solving: result.weights.problemSolving,
        communication: result.weights.communication,
        logical_reasoning: result.weights.logicalReasoning,
        adaptability: result.weights.adaptability,
        delivery: result.weights.delivery,
      },
      weighted_contributions: {
        technical: result.weightedContributions.technical,
        problem_solving: result.weightedContributions.problemSolving,
        communication: result.weightedContributions.communication,
        logical_reasoning: result.weightedContributions.logicalReasoning,
        adaptability: result.weightedContributions.adaptability,
        delivery: result.weightedContributions.delivery,
      },
      formula: result.formula,
      sample_count: result.sampleCount,
    };
    return JSON.stringify(clean, null, 2);
  }

  /**
   * Audit the result to verify determinism, weights sum to 100%, and mathematical accuracy.
   */
  static audit(result: ScoringEngineResult): ScoringEngineAuditResult {
    const findings: { severity: 'ok' | 'violation' | 'warning'; scope: string; message: string }[] = [];

    // 1. Verify weights sum to exactly 1.00
    const weightSum =
      result.weights.technical +
      result.weights.problemSolving +
      result.weights.communication +
      result.weights.logicalReasoning +
      result.weights.adaptability +
      result.weights.delivery;

    if (Math.abs(weightSum - 1.0) > 1e-6) {
      findings.push({
        severity: 'violation',
        scope: 'weights_sum',
        message: `Weights must sum to 1.00 (100%), but sum to ${weightSum}`,
      });
    }

    // 2. Verify mathematical consistency
    const expectedContributions =
      result.componentScores.technical * result.weights.technical +
      result.componentScores.problemSolving * result.weights.problemSolving +
      result.componentScores.communication * result.weights.communication +
      result.componentScores.logicalReasoning * result.weights.logicalReasoning +
      result.componentScores.adaptability * result.weights.adaptability +
      result.componentScores.delivery * result.weights.delivery;

    const expectedOverall = round(norm.clamp10(expectedContributions), 2);
    if (Math.abs(result.overallScore - expectedOverall) > 0.05) {
      findings.push({
        severity: 'violation',
        scope: 'calculation_accuracy',
        message: `overallScore (${result.overallScore}) deviates from mathematical calculation (${expectedOverall})`,
      });
    }

    // 3. Verify component bounds (0..10)
    for (const [cat, score] of Object.entries(result.componentScores)) {
      if (typeof score === 'number' && (score < 0 || score > 10)) {
        findings.push({
          severity: 'violation',
          scope: 'component_bounds',
          message: `Component ${cat} score ${score} is out of bounds (0..10)`,
        });
      }
    }

    if (findings.length === 0) {
      findings.push({
        severity: 'ok',
        scope: 'determinism_and_accuracy',
        message: 'Pure mathematical score calculation verified with exact 100% weight distribution.',
      });
    }

    return {
      passes: !findings.some((f) => f.severity === 'violation'),
      findings,
    };
  }

  /**
   * Backwards-compatible fully explainable evaluation record.
   */
  static evaluate(evaluation: QuestionEvaluation): {
    componentScores: ComponentScores;
    overallScore: number;
    breakdown: Readonly<{
      technicalKnowledge: number;
      problemSolving: number;
      communication: number;
      logicalReasoning: number;
      adaptability: number;
      delivery: number;
      weightTechnicalKnowledge: number;
      weightProblemSolving: number;
      weightCommunication: number;
      weightLogicalReasoning: number;
      weightAdaptability: number;
      weightDelivery: number;
    }>;
    evidence: {
      knowledgeDepth: number;
      recallPrecision: number;
      reasoning: number;
      appliedEvidence: number;
      communication: number;
      rubricCompliance: number;
    };
  } {
    const scores = this.mapFromEvaluation(evaluation);
    const overallScore = round(this.computeOverallScore(scores), 1);

    const breakdown = {
      technicalKnowledge: scores.technical,
      problemSolving: scores.problemSolving,
      communication: scores.communication,
      logicalReasoning: scores.logicalReasoning,
      adaptability: scores.adaptability,
      delivery: scores.delivery,
      weightTechnicalKnowledge: this.WEIGHTS.technical,
      weightProblemSolving: this.WEIGHTS.problemSolving,
      weightCommunication: this.WEIGHTS.communication,
      weightLogicalReasoning: this.WEIGHTS.logicalReasoning,
      weightAdaptability: this.WEIGHTS.adaptability,
      weightDelivery: this.WEIGHTS.delivery,
    };

    const evidence = {
      knowledgeDepth: evaluation.criteria.knowledgeDepth,
      recallPrecision: evaluation.criteria.recallPrecision,
      reasoning: evaluation.criteria.reasoning,
      appliedEvidence: evaluation.criteria.appliedEvidence,
      communication: evaluation.criteria.communication,
      rubricCompliance: evaluation.rubricCompliance,
    };

    return { componentScores: scores, overallScore, breakdown, evidence };
  }

  private static buildResult(scores: ComponentScores, sampleCount: number): ScoringEngineResult {
    const cTechnical = round(scores.technical * this.WEIGHTS.technical, 4);
    const cProblemSolving = round(scores.problemSolving * this.WEIGHTS.problemSolving, 4);
    const cCommunication = round(scores.communication * this.WEIGHTS.communication, 4);
    const cLogicalReasoning = round(scores.logicalReasoning * this.WEIGHTS.logicalReasoning, 4);
    const cAdaptability = round(scores.adaptability * this.WEIGHTS.adaptability, 4);
    const cDelivery = round(scores.delivery * this.WEIGHTS.delivery, 4);

    const rawTotal =
      cTechnical +
      cProblemSolving +
      cCommunication +
      cLogicalReasoning +
      cAdaptability +
      cDelivery;

    const overallScore = round(norm.clamp10(rawTotal), 2);

    return {
      overallScore,
      componentScores: scores,
      weights: this.WEIGHTS,
      weightedContributions: {
        technical: cTechnical,
        problemSolving: cProblemSolving,
        communication: cCommunication,
        logicalReasoning: cLogicalReasoning,
        adaptability: cAdaptability,
        delivery: cDelivery,
      },
      formula:
        'OverallScore = 0.25*Technical + 0.25*ProblemSolving + 0.15*Communication + ' +
        '0.15*LogicalReasoning + 0.10*Adaptability + 0.10*Delivery',
      sampleCount,
    };
  }
}

/** Convenience: compute overall score from the 5 criteria + rubricCompliance
 *  directly (equivalent to ScoringEngine.evaluate().overallScore). */
export function computeOverallScoreFromCriteria(
  criteria: RubricCriteria,
  rubricCompliance: number,
): number {
  const evaluation: QuestionEvaluation = {
    questionId: '',
    skillId: '',
    grade: 0,
    criteria,
    rationale: '',
    rubricCompliance,
  };
  return ScoringEngine.evaluate(evaluation).overallScore;
}