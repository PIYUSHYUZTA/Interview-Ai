import type { QuestionEvaluation, RoleRequirement } from '../core/types.js';

interface ObservedSkill { verdict: string; samples: number }
/** An evidence index, not a hiring probability. Unassessed skills earn no readiness credit. */
export function roleReadiness(role: RoleRequirement, skills: Record<string, ObservedSkill>) {
  let total = 0; let assessed = 0; let credit = 0;
  for (const requirement of role.skills) {
    const weight = Math.max(0, requirement.weight);
    total += weight;
    const skill = skills[requirement.skillId];
    if (!skill || skill.samples === 0 || skill.verdict === 'unverified') continue;
    assessed += weight;
    credit += weight * (skill.verdict === 'meets' ? 1 : skill.verdict === 'partially_meets' ? 0.5 : 0);
  }
  return {
    score: total && assessed ? Math.round(1000 * credit / total) / 10 : null,
    coverage: total ? Math.round(100 * assessed / total) : 0,
    assessedSkills: role.skills.filter((r) => skills[r.skillId]?.samples > 0 && skills[r.skillId]?.verdict !== 'unverified').length,
    totalSkills: role.skills.length,
    methodology: 'Role-weighted evidence index: meets expectations earns full credit, partially meets earns half, gaps and unassessed skills earn none. Not a hiring probability. Read alongside evidence coverage.',
  };
}

const criterionLabels: Record<string, string> = {
  knowledgeDepth: 'Conceptual depth', recallPrecision: 'Accuracy and specificity', reasoning: 'Reasoning',
  appliedEvidence: 'Concrete examples', communication: 'Communication',
};
const suggestions: Record<string, string> = {
  knowledgeDepth: 'Explain the underlying mechanism and its limitations.',
  recallPrecision: 'Use precise terms and check the key facts in your explanation.',
  reasoning: 'Explain why you chose your approach and compare a relevant alternative.',
  appliedEvidence: 'Add a concrete example with your actions and an observable outcome.',
  communication: 'Structure your answer around the problem, approach and outcome.',
};
/** Public feedback is derived from scored rubric fields; provider rationale is never exposed here. */
export function answerFeedback(evaluation: QuestionEvaluation) {
  const criteria = Object.entries(evaluation.criteria).map(([key, score]) => ({ key, label: criterionLabels[key] ?? key, score }));
  const ordered = [...criteria].sort((a, b) => a.score - b.score);
  return {
    criteria,
    strengths: criteria.filter((c) => c.score >= 7).map((c) => `${c.label}: ${c.score.toFixed(1)}/10 on this response.`),
    improvements: ordered.filter((c) => c.score < 7).slice(0, 2).map((c) => `${c.label} scored ${c.score.toFixed(1)}/10. ${suggestions[c.key] ?? 'Review this part of your answer.'}`),
  };
}
