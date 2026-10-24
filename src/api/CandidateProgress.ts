import { z } from 'zod';
import { InterviewResultsResponseSchema } from './schemas.js';

type Report = z.infer<typeof InterviewResultsResponseSchema>;

/** Derived exclusively from immutable, owner-filtered completed report snapshots. */
export function candidateProgress(reports: readonly Report[]) {
  const ordered = [...reports].sort((a, b) => a.details.completedAt.localeCompare(b.details.completedAt) || a.sessionId.localeCompare(b.sessionId));
  const profile: Record<string, { skillId: string; estimate: number; confidence: number; verdict: string; sessionId: string; date: string; roleTitle: string; providerName: string }> = {};
  const weaknesses = new Map<string, string[]>();
  for (const report of ordered) {
    for (const [skillId, skill] of Object.entries(report.skillMap)) {
      if (!skill.samples) continue;
      profile[skillId] = { skillId, estimate: skill.estimate, confidence: skill.confidence, verdict: skill.verdict, sessionId: report.sessionId, date: report.details.completedAt, roleTitle: report.roleTitle, providerName: report.providerName };
      if (skill.verdict === 'gap') weaknesses.set(skillId, [...(weaknesses.get(skillId) ?? []), report.sessionId]);
    }
  }
  const latest = ordered.at(-1) ?? null;
  return {
    reports: ordered,
    currentSkills: Object.values(profile),
    repeatedWeaknesses: [...weaknesses].filter(([, ids]) => ids.length >= 2).map(([skillId, sessionIds]) => ({ skillId, count: sessionIds.length, sessionIds, stillCurrent: profile[skillId]?.verdict === 'gap' })),
    recommendations: latest?.details.learningPlan ?? [],
    methodology: 'Scores are saved interview observations, not proof of lasting improvement. Compare changes only within the same role, provider and plan. Current skills use the latest observed result per skill; older observations can be stale. Repeated gaps count distinct interviews with actual answer evidence.',
  };
}

/** Priorities only: never import previous answers, sample counts or scores into new scoring. */
export function practicePriorities(reports: readonly Report[], roleTitle: string, providerName: string) {
  const matching = candidateProgress(reports.filter((r) => r.roleTitle === roleTitle && r.providerName === providerName));
  return matching.currentSkills.filter((s) => s.verdict === 'gap' || s.verdict === 'partially_meets').map((s) => ({ skillId: s.skillId, priority: s.verdict === 'gap' ? 1 : 0.5, sourceSessionId: s.sessionId }));
}
