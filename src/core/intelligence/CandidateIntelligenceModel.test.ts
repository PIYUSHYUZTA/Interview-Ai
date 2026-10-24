import { describe, expect, it } from 'vitest';
import { CandidateIntelligenceModelBuilder } from './CandidateIntelligenceModel.js';
import { ResumeIntelligence } from '../understanding/ResumeIntelligence.js';
import { EvidenceTracer } from '../assessment/EvidenceTracer.js';
import { DeterministicProvider } from '../provider/DeterministicProvider.js';
import { AssessmentOrchestrator } from '../orchestrator/AssessmentOrchestrator.js';
import { CandidateSimulator } from '../../simulation/CandidateSimulator.js';
import { buildProfile, backendRole, sessionConfig, STRONG_RESUME } from '../../testSupport/fixtures.js';

const provider = new DeterministicProvider();

function freshModel() {
  const profile = new ResumeIntelligence().analyze(STRONG_RESUME);
  const role = backendRole();
  const tracer = new EvidenceTracer(profile.claims.map((c) => ({ ...c, evidenceIds: [...c.evidenceIds] })));
  const model = new CandidateIntelligenceModelBuilder().build({
    profile,
    role,
    states: [],
    evidence: tracer.resolve(),
    gaps: [],
  });
  return { profile, role, model };
}

describe('CANDIDATE INTELLIGENCE — structured candidate model', () => {
  it('with no interview evidence the model is honest and neutral (NOT the spec example numbers)', () => {
    const { model } = freshModel();

    expect(Object.keys(model.skills).length).toBeGreaterThanOrEqual(backendRole().skills.length);

    for (const skill of model.ordered) {
      // Neutral prior — NOT the hard-coded example values (0.82 / 0.61 / …).
      expect(skill.score).toBe(0.5);
      expect(skill.confidence).toBe(0);
      expect(skill.samples).toBe(0);
      expect(skill.verdict).toBe('unverified');
      expect(skill.interviewEvidence).toEqual([]);
      expect(skill.knowledgeGaps).toEqual([]);
      // Resume claims surface as resume evidence (hypotheses) with a source line.
      if (skill.skillId === 'backend') {
        expect(skill.resumeEvidence.length).toBeGreaterThan(0);
        expect(skill.resumeEvidence[0].source?.line).toBeGreaterThan(0);
      }
    }

    expect(model.summary.probedSkills).toBe(0);
    expect(model.summary.overallScore).toBe(0);
    expect(model.summary.overallConfidence).toBe(0);
  });

  it('scores and confidence emerge from the interview, not from constants', async () => {
    async function run(resume: string, backendAbility: number) {
      const profile = buildProfile(resume);
      const config = sessionConfig(profile, backendRole());
      const candidate = new CandidateSimulator(
        { trueAbility: new Map([['backend', backendAbility], ['databases', backendAbility]]) },
        9,
      );
      return new AssessmentOrchestrator({ provider, seed: 9 }).run(config, async (q) => candidate.answerFor(q));
    }

    const strong = await run(STRONG_RESUME, 0.9);
    const weak = await run(STRONG_RESUME, 0.25);

    const strongBackend = strong.candidateIntelligence.skills['backend'];
    const weakBackend = weak.candidateIntelligence.skills['backend'];
    const strongSummary = strong.skillSummary.find((s) => s.skillId === 'backend')!;

    // Model value tracks the very estimate that was derived from answers.
    expect(strongBackend.score).toBeCloseTo(strongSummary.estimate / 10, 2);
    expect(strongBackend.confidence).toBeCloseTo(strongSummary.confidence, 2);
    expect(strongBackend.samples).toBeGreaterThan(0);
    // A strong candidate must score above a weak one on the same skill.
    expect(strongBackend.score).toBeGreaterThan(weakBackend.score);
  });

  it('copies the candidate-level hypothesis through the model', () => {
    const { model } = freshModel();
    expect(model.candidateLevelHypothesis.band).toBe('senior');
    expect(model.candidateLevelHypothesis.status).toBe('hypothesis');
  });
});
describe('CANDIDATE INTELLIGENCE — integrated with the orchestrator', () => {
  it('exposes resume evidence, interview evidence, gaps and related topics per skill', async () => {
    const orchestrator = new AssessmentOrchestrator({ provider });
    const profile = buildProfile(STRONG_RESUME);
    const config = sessionConfig(profile, backendRole());
    const candidate = new CandidateSimulator(
      { trueAbility: new Map([['backend', 0.85], ['databases', 0.8], ['system_design', 0.75], ['algorithms', 0.7], ['cloud', 0.5], ['security', 0.4]]) },
      21,
    );
    const report = await orchestrator.run(config, async (q) => candidate.answerFor(q));
    const backend = report.candidateIntelligence.skills['backend'];

    // Resume evidence: resume claims as hypotheses with source lines.
    expect(backend.resumeEvidence.length).toBeGreaterThan(0);
    expect(backend.resumeEvidence.every((e) => e.kind === 'resume')).toBe(true);

    // Interview evidence: graded probes bound to claims.
    expect(backend.interviewEvidence.length).toBeGreaterThan(0);
    for (const ev of backend.interviewEvidence) {
      expect(ev.excerpt.length).toBeGreaterThan(0);
      expect(ev.supportStrength).toBeGreaterThanOrEqual(0);
      expect(ev.supportStrength).toBeLessThanOrEqual(1);
    }

    // Knowledge gaps map onto the report's gap list.
    const totalGaps = report.candidateIntelligence.ordered.reduce((n, s) => n + s.knowledgeGaps.length, 0);
    expect(totalGaps).toBe(report.gaps.length);

    // Related topics: resume probes + subtopics actually interrogated.
    const probes = backend.relatedTopics.filter((t) => t.provenance === 'resume_probe');
    const interviewed = backend.relatedTopics.filter((t) => t.provenance === 'interviewed');
    expect(backend.relatedTopics.length).toBeGreaterThan(0);
    expect(interviewed.length).toBeGreaterThan(0);
    expect(interviewed.every((t) => t.questionId)).toBe(true);
    expect(probes.length).toBeGreaterThan(0);

    // Summary derived from the same evidence the report uses.
    expect(report.candidateIntelligence.summary.overallScore).toBeGreaterThan(0);
    expect(report.candidateIntelligence.summary.claims).toEqual(
      report.claimsResolved.reduce(
        (acc, r) => ({ ...acc, [r.verdict]: acc[r.verdict] + 1 }),
        { validated: 0, refuted: 0, partial: 0, unverified: 0 },
      ),
    );
  });

  it('is deterministic for a fixed seed', async () => {
    async function run() {
      const orchestrator = new AssessmentOrchestrator({ provider, seed: 42 });
      const profile = buildProfile(STRONG_RESUME);
      const candidate = new CandidateSimulator({ trueAbility: new Map([['backend', 0.8], ['databases', 0.8]]) }, 42);
      return orchestrator.run(sessionConfig(profile, backendRole()), async (q) => candidate.answerFor(q));
    }
    const a = await run();
    const b = await run();
    // The model's derived values must be identical across runs. Wall-clock
    // `timestamp` fields are deliberately excluded — they are run metadata,
    // not evidence content.
    expect(sanitizeForComparison(a.candidateIntelligence)).toBe(sanitizeForComparison(b.candidateIntelligence));
  });
});

/**
 * Strip volatile run metadata (timestamps) so equality tests reason about the
 * derived evidence, not about the moment the interview ran.
 */
function sanitizeForComparison(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item) && 'timestamp' in item) {
      const { timestamp: _t, ...rest } = item as Record<string, unknown>;
      return rest;
    }
    return item;
  });
}