import type { CriterionName, QuestionType, RubricCriteria } from '../types.js';
import { norm } from '../utils/norm.js';

/** Criterion weighting per question type — a structured rubric. */
const RUBRIC_WEIGHTS: Record<QuestionType, Partial<Record<CriterionName, number>>> = {
  conceptual: { knowledgeDepth: 0.35, recallPrecision: 0.2, reasoning: 0.25, appliedEvidence: 0.1, communication: 0.1 },
  behavioral: { knowledgeDepth: 0.1, recallPrecision: 0.05, reasoning: 0.2, appliedEvidence: 0.4, communication: 0.25 },
  system_design: { knowledgeDepth: 0.25, recallPrecision: 0.05, reasoning: 0.4, appliedEvidence: 0.2, communication: 0.1 },
  code: { knowledgeDepth: 0.3, recallPrecision: 0.1, reasoning: 0.35, appliedEvidence: 0.15, communication: 0.1 },
  numerical: { knowledgeDepth: 0.35, recallPrecision: 0.5, reasoning: 0.15, appliedEvidence: 0, communication: 0 },
  mcq: { knowledgeDepth: 0.4, recallPrecision: 0.5, reasoning: 0.1, appliedEvidence: 0, communication: 0 },
  situational: { knowledgeDepth: 0.15, recallPrecision: 0.05, reasoning: 0.35, appliedEvidence: 0.3, communication: 0.15 },
};

/** Fraction blended in from rubric compliance so graders stay honest. */
const COMPLIANCE_BLEND = 0.15;

export interface GradeComputation {
  readonly raw: number; // weighted criterion mean
  readonly complianceAdjusted: number; // final holistic grade
}

export function weightedCriteriaScore(criteria: RubricCriteria, type: QuestionType): GradeComputation {
  const weights = RUBRIC_WEIGHTS[type];
  let total = 0;
  let weightSum = 0;
  for (const [name, w] of Object.entries(weights) as [CriterionName, number][]) {
    total += criteria[name] * w;
    weightSum += w;
  }
  const raw = weightSum > 0 ? total / weightSum : 0;
  return { raw, complianceAdjusted: norm.clamp10(raw) };
}

/** Combine raw criteria + rubric compliance into the final 0..10 grade. */
export function finalGrade(criteria: RubricCriteria, type: QuestionType, rubricCompliance: number): number {
  const { raw } = weightedCriteriaScore(criteria, type);
  const blend = 1 - COMPLIANCE_BLEND + COMPLIANCE_BLEND * norm.clamp01(rubricCompliance);
  return norm.clamp10(raw * blend);
}

/**
 * Shared grade interpretation bands (used by gap analysis and reports).
 * 0–3.9 weak · 4–5.9 developing · 6–7.4 solid · 7.5+ strong.
 */
export function performanceBand(grade: number): 'weak' | 'developing' | 'solid' | 'strong' {
  if (grade < 4) return 'weak';
  if (grade < 6) return 'developing';
  if (grade < 7.5) return 'solid';
  return 'strong';
}