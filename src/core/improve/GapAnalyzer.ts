import type { KnowledgeGap, RoleRequirement, SkillState, SkillsTaxonomy } from '../types.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { norm, round } from '../utils/norm.js';

export interface GapAnalysisDeps {
  readonly taxonomy?: SkillsTaxonomy;
}

/**
 * End-of-interview knowledge-gap detection.
 *
 * After enough evidence has accumulated, identifies gap types
 * (missing-concept, weak-concept, insufficient-depth, optimization-weakness,
 * reasoning-weakness) and assigns each a concept label and evidence references
 * drawn from the observed interview evidence records.
 */
export class GapAnalyzer {
  private readonly taxonomy: SkillsTaxonomy;

  constructor(deps: GapAnalysisDeps = {}) {
    this.taxonomy = deps.taxonomy ?? defaultTaxonomy;
  }

  /** Map estimate + confidence + severity to a gap type. */
  private gapType(estimate: number, confidence: number, severity: number): 'missing-concept' | 'weak-concept' | 'insufficient-depth' | 'optimization-weakness' | 'reasoning-weakness' {
    if (estimate === 0 && confidence === 0) return 'missing-concept';
    if (estimate < 5) return 'weak-concept';
    if (severity < 0.2) return 'insufficient-depth';
    if (severity < 0.5) return 'optimization-weakness';
    return 'reasoning-weakness';
  }

  /** Build evidence reference strings from the recorded evidence. */
  private evidenceStrings(evidenceRecords: readonly Record<string, unknown>[]): string[] {
    const refs: string[] = [];
    for (const r of evidenceRecords) {
      if (r && typeof r === 'object' && 'id' in r && typeof (r as any).supportStrength === 'number') {
        refs.push(`ev-${(r as any).id}`);
      }
    }
    if (refs.length === 0) refs.push('no-observable-evidence');
    return refs;
  }

  analyze(role: RoleRequirement, states: readonly SkillState[], evidence: { records: readonly Record<string, unknown>[] }): KnowledgeGap[] {
    const gaps: KnowledgeGap[] = [];

    for (const requirement of role.skills) {
      const state = states.find((s) => s.skillId === requirement.skillId);
      const relevantEvidence = evidence.records.filter((r) => (r as any)?.skillId === requirement.skillId);

      if (!state) {
        gaps.push({
          skillId: requirement.skillId,
          currentEstimate: 0,
          requiredLevel: requirement.requiredLevel,
          severity: 1,
          confidence: 0,
          reason: 'Not probed during the interview — cannot verify.',
          concept: 'missing-concept',
          evidence: ['no-interview-evidence'],
        });
        continue;
      }
      if (state.samples === 0) {
        gaps.push({
          skillId: requirement.skillId,
          currentEstimate: round(state.estimate, 1),
          requiredLevel: requirement.requiredLevel,
          severity: 0.6,
          confidence: 0,
          reason: 'No evidence collected for this required skill.',
          concept: 'missing-concept',
          evidence: ['no-evidence-collected'],
        });
        continue;
      }

      const window = this.taxonomy.assert(state.skillId).competencyWindow[requirement.requiredLevel];
      const midpoint = (window.min + window.max) / 2;
      const deficit = Math.max(0, midpoint - state.estimate);
      const severity = norm.clamp01(deficit / 6);

      const gapType = this.gapType(state.estimate, state.confidence, severity);
      const evidenceStrings = this.evidenceStrings(relevantEvidence);

      const reasonMap: Record<string, string> = {
        'missing-concept': 'Not probed during the interview — cannot verify.',
        'weak-concept': `Below the ${requirement.requiredLevel} band (estimate ${round(state.estimate, 1)}/10, target ≈ ${window.min}–${window.max}).`,
        'insufficient-depth': `Knowledge meets band (${round(state.estimate, 1)}/10) but gap analysis indicates insufficient depth.`,
        'optimization-weakness': `Moderate-severity gap; optimization weaknesses indicated by the evidence profile.`,
        'reasoning-weakness': `Large-severity gap; reasoning weaknesses indicated by the evidence profile.`,
        missingConcept: 'Not probed during the interview — cannot verify.',
        weakConcept: `Below the ${requirement.requiredLevel} band (estimate ${round(state.estimate, 1)}/10, target ≈ ${window.min}–${window.max}).`,
        insufficientDepth: `Knowledge meets band (${round(state.estimate, 1)}/10) but gap analysis indicates insufficient depth.`,
        optimizationWeakness: `Moderate-severity gap; optimization weaknesses indicated by the evidence profile.`,
        reasoningWeakness: `Large-severity gap; reasoning weaknesses indicated by the evidence profile.`,
      };

      gaps.push({
        skillId: requirement.skillId,
        currentEstimate: round(state.estimate, 1),
        requiredLevel: requirement.requiredLevel,
        severity: gapType === 'missing-concept' ? 1 : round(severity, 2),
        confidence: round(state.confidence, 2),
        reason: reasonMap[gapType] ?? 'Knowledge gap detected vs required role level.',
        concept: gapType,
        evidence: evidenceStrings,
      });
    }

    return gaps.sort((a, b) => b.severity - a.severity);
  }
}

export const defaultGapAnalyzer = new GapAnalyzer();
