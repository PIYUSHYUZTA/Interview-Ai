import { describe, expect, it } from 'vitest';
import { DeterministicProvider } from '../provider/DeterministicProvider.js';
import { AssessmentOrchestrator } from '../orchestrator/AssessmentOrchestrator.js';
import { CandidateSimulator } from '../../simulation/CandidateSimulator.js';
import { buildProfile, backendRole, sessionConfig, STRONG_RESUME, WEAK_RESUME } from '../../testSupport/fixtures.js';

const provider = new DeterministicProvider();

function runInterview(resume: string, abilities: Record<string, number>, seed: number) {
  const orchestrator = new AssessmentOrchestrator({ provider, seed });
  const profile = buildProfile(resume);
  const config = sessionConfig(profile, backendRole());
  const candidate = new CandidateSimulator({ trueAbility: new Map(Object.entries(abilities)) }, seed);
  return orchestrator.run(config, async (q) => candidate.answerFor(q));
}

describe('END-TO-END — UNDERSTAND → ASSESS → ADAPT → IMPROVE', () => {
  it('a strong candidate outscores a weak one and validates claims', async () => {
    const strong = await runInterview(
      STRONG_RESUME,
      { backend: 0.85, databases: 0.8, system_design: 0.75, algorithms: 0.7, cloud: 0.6, security: 0.55 },
      11,
    );
    const weak = await runInterview(
      WEAK_RESUME,
      { backend: 0.3, databases: 0.25, system_design: 0.3, algorithms: 0.35, cloud: 0.3, security: 0.3 },
      11,
    );

    expect(strong.overallScore).toBeGreaterThan(weak.overallScore);
    expect(strong.candidatePriority).toBeGreaterThan(weak.candidatePriority);
    expect(strong.questionsAsked).toBe(8);
    expect(weak.questionsAsked).toBe(8);
    expect(strong.roundsPerformed).toBe(2);
  });

  it('produces an evidence-backed skill summary with consistent verdicts', async () => {
    const strong = await runInterview(
      STRONG_RESUME,
      { backend: 0.85, databases: 0.8, system_design: 0.75, algorithms: 0.7, cloud: 0.6, security: 0.55 },
      13,
    );
    const verdicts = new Set(strong.skillSummary.map((s) => s.verdict));
    expect(verdicts.has('meets') || verdicts.has('partially_meets')).toBe(true);
    // every required skill has an estimate in range
    for (const s of strong.skillSummary) {
      expect(s.estimate).toBeGreaterThanOrEqual(0);
      expect(s.estimate).toBeLessThanOrEqual(10);
    }
  });

  it('a weak candidate surface concrete gaps and a roadmap', async () => {
    const weak = await runInterview(
      WEAK_RESUME,
      { backend: 0.28, databases: 0.22, system_design: 0.3, algorithms: 0.32, cloud: 0.3, security: 0.3 },
      17,
    );
    // required skills that were probed should show as gaps or partial
    const weaknesses = weak.gaps.filter((g) => g.skillId === 'backend' || g.skillId === 'databases');
    expect(weaknesses.length).toBeGreaterThan(0);
    expect(weak.roadmap.length).toBe(weak.gaps.length && weaknesses.length ? weak.gaps.length : 0);
    expect(weak.roadmap.length).toBeGreaterThan(0);
    expect(weak.roadmap[0].priority).toBe(1);
    const probedWeaknesses = weaknesses.filter((gap) => weak.candidateIntelligence.skills[gap.skillId].samples > 0);
    expect(probedWeaknesses.length).toBeGreaterThan(0);
    for (const gap of probedWeaknesses) {
      expect(gap.evidence.some((reference) => reference.startsWith('ev-q-'))).toBe(true);
    }
  });

  it('resolves resume claims toward ground truth', async () => {
    const strong = await runInterview(
      STRONG_RESUME,
      { backend: 0.9, databases: 0.85, system_design: 0.8, algorithms: 0.7, cloud: 0.6, security: 0.6 },
      21,
    );
    const backendClaim = strong.claimsResolved.find((c) => c.skillIds.includes('backend'));
    expect(backendClaim).toBeDefined();
    expect(['validated', 'partial']).toContain(backendClaim?.verdict);
  });

  it('is deterministic for a fixed seed', async () => {
    const a = await runInterview(STRONG_RESUME, { backend: 0.8, databases: 0.8 }, 42);
    const b = await runInterview(STRONG_RESUME, { backend: 0.8, databases: 0.8 }, 42);
    expect(a.overallScore).toBe(b.overallScore);
    expect(JSON.stringify(a.skillSummary)).toBe(JSON.stringify(b.skillSummary));
  });
});
