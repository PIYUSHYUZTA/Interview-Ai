import { describe, expect, it } from 'vitest';
import {
  ScoringEngine,
  SCORING_WEIGHTS,
  type ComponentScores,
  computeOverallScoreFromCriteria,
} from './ScoringEngine.js';
import type { QuestionEvaluation } from '../types.js';
import type { AnswerEvaluatorOutput } from '../assessment/evaluators/AnswerEvaluator.js';

describe('Service 5: Scoring Engine (Deterministic, Pure Backend Calculation)', () => {
  describe('Weight Distribution (sums strictly to 100%)', () => {
    it('verifies exact category weights requested: Technical 25%, Problem Solving 25%, Communication 15%, Logical Reasoning 15%, Adaptability 10%, Delivery 10%', () => {
      expect(SCORING_WEIGHTS.technical).toBe(0.25);
      expect(SCORING_WEIGHTS.problemSolving).toBe(0.25);
      expect(SCORING_WEIGHTS.communication).toBe(0.15);
      expect(SCORING_WEIGHTS.logicalReasoning).toBe(0.15);
      expect(SCORING_WEIGHTS.adaptability).toBe(0.10);
      expect(SCORING_WEIGHTS.delivery).toBe(0.10);

      const sum =
        SCORING_WEIGHTS.technical +
        SCORING_WEIGHTS.problemSolving +
        SCORING_WEIGHTS.communication +
        SCORING_WEIGHTS.logicalReasoning +
        SCORING_WEIGHTS.adaptability +
        SCORING_WEIGHTS.delivery;

      expect(sum).toBeCloseTo(1.0, 9);
      expect(sum).toBe(1.0);
    });
  });

  describe('Pure & Deterministic Calculation against Known Inputs', () => {
    it('computes 10.0 for all maximum scores (10 in all categories)', () => {
      const maxScores: ComponentScores = {
        technical: 10,
        problemSolving: 10,
        communication: 10,
        logicalReasoning: 10,
        adaptability: 10,
        delivery: 10,
        technicalKnowledge: 10,
      };

      const result = ScoringEngine.calculate(maxScores);
      expect(result.overallScore).toBe(10.0);
      expect(result.weightedContributions.technical).toBe(2.5);
      expect(result.weightedContributions.problemSolving).toBe(2.5);
      expect(result.weightedContributions.communication).toBe(1.5);
      expect(result.weightedContributions.logicalReasoning).toBe(1.5);
      expect(result.weightedContributions.adaptability).toBe(1.0);
      expect(result.weightedContributions.delivery).toBe(1.0);
    });

    it('computes 0.0 for all minimum scores (0 in all categories)', () => {
      const zeroScores: ComponentScores = {
        technical: 0,
        problemSolving: 0,
        communication: 0,
        logicalReasoning: 0,
        adaptability: 0,
        delivery: 0,
        technicalKnowledge: 0,
      };

      const result = ScoringEngine.calculate(zeroScores);
      expect(result.overallScore).toBe(0.0);
    });

    it('computes exact midpoint 5.0 when all categories are 5', () => {
      const midScores: ComponentScores = {
        technical: 5,
        problemSolving: 5,
        communication: 5,
        logicalReasoning: 5,
        adaptability: 5,
        delivery: 5,
        technicalKnowledge: 5,
      };

      const result = ScoringEngine.calculate(midScores);
      expect(result.overallScore).toBe(5.0);
    });

    it('isolates individual category contributions with zero cross-talk', () => {
      // 1. Technical only = 10 -> 10 * 0.25 = 2.50
      expect(ScoringEngine.calculate({ technical: 10 }).overallScore).toBe(2.5);

      // 2. Problem Solving only = 10 -> 10 * 0.25 = 2.50
      expect(ScoringEngine.calculate({ problemSolving: 10 }).overallScore).toBe(2.5);

      // 3. Communication only = 10 -> 10 * 0.15 = 1.50
      expect(ScoringEngine.calculate({ communication: 10 }).overallScore).toBe(1.5);

      // 4. Logical Reasoning only = 10 -> 10 * 0.15 = 1.50
      expect(ScoringEngine.calculate({ logicalReasoning: 10 }).overallScore).toBe(1.5);

      // 5. Adaptability only = 10 -> 10 * 0.10 = 1.00
      expect(ScoringEngine.calculate({ adaptability: 10 }).overallScore).toBe(1.0);

      // 6. Delivery only = 10 -> 10 * 0.10 = 1.00
      expect(ScoringEngine.calculate({ delivery: 10 }).overallScore).toBe(1.0);
    });

    it('verifies exact mathematical result on known complex input', () => {
      // Known input values:
      // Technical = 8.0        --> 8.0 * 0.25 = 2.00
      // Problem Solving = 6.0  --> 6.0 * 0.25 = 1.50
      // Communication = 7.0    --> 7.0 * 0.15 = 1.05
      // Logical Reasoning = 9.0--> 9.0 * 0.15 = 1.35
      // Adaptability = 5.0     --> 5.0 * 0.10 = 0.50
      // Delivery = 8.0         --> 8.0 * 0.10 = 0.80
      // Expected total = 2.00 + 1.50 + 1.05 + 1.35 + 0.50 + 0.80 = 7.20
      const knownInput = {
        technical: 8.0,
        problemSolving: 6.0,
        communication: 7.0,
        logicalReasoning: 9.0,
        adaptability: 5.0,
        delivery: 8.0,
      };

      const result = ScoringEngine.calculate(knownInput);

      expect(result.weightedContributions.technical).toBe(2.0);
      expect(result.weightedContributions.problemSolving).toBe(1.5);
      expect(result.weightedContributions.communication).toBe(1.05);
      expect(result.weightedContributions.logicalReasoning).toBe(1.35);
      expect(result.weightedContributions.adaptability).toBe(0.5);
      expect(result.weightedContributions.delivery).toBe(0.8);
      expect(result.overallScore).toBe(7.2);
    });

    it('is strictly pure and deterministic (no state mutation, identical outputs across repeated runs)', () => {
      const input = {
        technical: 7.5,
        problemSolving: 8.2,
        communication: 6.8,
        logicalReasoning: 7.9,
        adaptability: 8.0,
        delivery: 7.0,
      };

      const run1 = ScoringEngine.calculate(input);
      const run2 = ScoringEngine.calculate(input);
      const run3 = ScoringEngine.calculate(input);

      expect(run1).toEqual(run2);
      expect(run2).toEqual(run3);
      expect(run1.overallScore).toBe(run2.overallScore);
      expect(run1.weightedContributions).toEqual(run2.weightedContributions);
    });
  });

  describe('Integration with Evaluator Outputs', () => {
    it('calculates score directly from Service 3 AnswerEvaluatorOutput', () => {
      const answerEval: AnswerEvaluatorOutput = {
        correctness: 8.0, // maps to adaptability
        reasoning: 9.0, // maps to problem solving
        technical_depth: 8.5, // maps to technical
        communication: 8.0, // maps to communication
        confidence: 0.9, // maps to delivery (9.0)
        feedback: 'Excellent answer with deep technical explanation.',
        knowledge_gaps: [],
      };

      const result = ScoringEngine.calculate(answerEval);

      expect(result.componentScores.technical).toBe(8.5);
      expect(result.componentScores.problemSolving).toBe(9.0);
      expect(result.componentScores.communication).toBe(8.0);
      expect(result.componentScores.adaptability).toBe(8.0);
      expect(result.componentScores.delivery).toBe(9.0);
      expect(result.overallScore).toBeGreaterThan(8.0);
      expect(result.overallScore).toBeLessThanOrEqual(10.0);
    });

    it('calculates score directly from QuestionEvaluation', () => {
      const qEval: QuestionEvaluation = {
        questionId: 'q-backend-1',
        skillId: 'backend',
        grade: 8.2,
        criteria: {
          knowledgeDepth: 8.0, // technical
          reasoning: 8.5, // problem solving
          communication: 7.5, // communication
          appliedEvidence: 8.0, // logical reasoning
          recallPrecision: 9.0, // adaptability
        },
        rubricCompliance: 0.85, // delivery = 8.5
        rationale: 'Solid evidence demonstrated.',
      };

      const result = ScoringEngine.calculate(qEval);

      expect(result.componentScores.technical).toBe(8.0);
      expect(result.componentScores.problemSolving).toBe(8.5);
      expect(result.componentScores.communication).toBe(7.5);
      expect(result.componentScores.logicalReasoning).toBe(8.0);
      expect(result.componentScores.adaptability).toBe(9.0);
      expect(result.componentScores.delivery).toBe(8.5);

      // Expected calculation:
      // 8.0 * 0.25 = 2.00
      // 8.5 * 0.25 = 2.125
      // 7.5 * 0.15 = 1.125
      // 8.0 * 0.15 = 1.20
      // 9.0 * 0.10 = 0.90
      // 8.5 * 0.10 = 0.85
      // Sum = 2.00 + 2.125 + 1.125 + 1.20 + 0.90 + 0.85 = 8.20
      expect(result.overallScore).toBe(8.2);
    });

    it('aggregates multiple question evaluations across an interview session', () => {
      const q1 = {
        technical: 8.0,
        problemSolving: 8.0,
        communication: 8.0,
        logicalReasoning: 8.0,
        adaptability: 8.0,
        delivery: 8.0,
      };
      const q2 = {
        technical: 6.0,
        problemSolving: 6.0,
        communication: 6.0,
        logicalReasoning: 6.0,
        adaptability: 6.0,
        delivery: 6.0,
      };

      const sessionResult = ScoringEngine.calculate([q1, q2]);

      // Average component scores: (8 + 6) / 2 = 7.0 for each
      expect(sessionResult.componentScores.technical).toBe(7.0);
      expect(sessionResult.componentScores.problemSolving).toBe(7.0);
      expect(sessionResult.componentScores.communication).toBe(7.0);
      expect(sessionResult.componentScores.logicalReasoning).toBe(7.0);
      expect(sessionResult.componentScores.adaptability).toBe(7.0);
      expect(sessionResult.componentScores.delivery).toBe(7.0);
      expect(sessionResult.overallScore).toBe(7.0);
      expect(sessionResult.sampleCount).toBe(2);
    });
  });

  describe('JSON Serialization & Explainability', () => {
    it('produces transparent explainable JSON with scores, weights, contributions, and formula', () => {
      const result = ScoringEngine.calculate({
        technical: 9.0,
        problemSolving: 8.0,
        communication: 7.0,
        logicalReasoning: 8.0,
        adaptability: 7.0,
        delivery: 9.0,
      });

      const jsonStr = ScoringEngine.toJSON(result);
      const parsed = JSON.parse(jsonStr);

      expect(parsed).toHaveProperty('overall_score');
      expect(parsed).toHaveProperty('component_scores');
      expect(parsed).toHaveProperty('weights');
      expect(parsed).toHaveProperty('weighted_contributions');
      expect(parsed).toHaveProperty('formula');

      expect(parsed.overall_score).toBe(result.overallScore);
      expect(parsed.weights.technical).toBe(0.25);
      expect(parsed.weights.problem_solving).toBe(0.25);
      expect(parsed.weights.communication).toBe(0.15);
      expect(parsed.weights.logical_reasoning).toBe(0.15);
      expect(parsed.weights.adaptability).toBe(0.10);
      expect(parsed.weights.delivery).toBe(0.10);

      expect(parsed.formula).toContain('0.25*Technical');
      expect(parsed.formula).toContain('0.25*ProblemSolving');
      expect(parsed.formula).toContain('0.15*Communication');
    });

    it('passes audit verification with zero mathematical discrepancy', () => {
      const result = ScoringEngine.calculate({
        technical: 8.2,
        problemSolving: 7.4,
        communication: 8.0,
        logicalReasoning: 7.8,
        adaptability: 6.9,
        delivery: 8.5,
      });

      const audit = ScoringEngine.audit(result);
      expect(audit.passes).toBe(true);
      expect(audit.findings.some((f) => f.severity === 'violation')).toBe(false);
    });
  });

  describe('Backwards Compatibility', () => {
    it('supports existing computeOverallScoreFromCriteria', () => {
      const criteria = {
        knowledgeDepth: 8.0,
        reasoning: 8.0,
        communication: 8.0,
        appliedEvidence: 8.0,
        recallPrecision: 8.0,
      };
      const score = computeOverallScoreFromCriteria(criteria, 0.8);
      expect(score).toBe(8.0);
    });
  });
});
