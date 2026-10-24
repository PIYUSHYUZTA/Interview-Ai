import type { CandidateProfile, InterviewTopic } from '../types.js';
import { ProfileBuilder } from './ProfileBuilder.js';

/**
 * Phrasing that would turn an open probe into an unverified assertion about the
 * candidate. The audit flags any of these in generated topics/probes.
 */
const ASSERTION_PHRASES: readonly RegExp[] = [
  /\bunderstands\b/i,
  /\bis proficient\b/i,
  /\bknows\b/i,
  /\bhas mastered\b/i,
  /\bexpert at\b/i,
  /\bdeep understanding of\b/i,
  /\bcan (build|design|explain|implement|scale)\b/i,
  /\bcomfortable with\b/i,
];

export interface AuditFinding {
  readonly severity: 'ok' | 'warning';
  readonly finding: string;
  /** Where the issue was found (topic label or scope). */
  readonly scope: string;
}

/**
 * Resume Intelligence — the independent UNDERSTAND service facade.
 *
 * RESPONSIBILITIES
 *  - `analyze(resumeText)` → a structured `CandidateProfile`.
 *  - `audit(profile)` → verifies the anti-hallucination contract: nothing in the
 *    profile is phrased as an assertion about what the candidate understands,
 *    and every topic/skill keeps a source reference.
 *
 * The candidate-level estimate is only a hypothesis and must be validated
 * through interview evidence — `audit` verifies this contract automatically.
 */
export class ResumeIntelligence {
  constructor(private readonly builder: ProfileBuilder = new ProfileBuilder()) {}

  /** Build a structured, evidence-bound candidate profile from raw resume text. */
  analyze(resumeText: string): CandidateProfile {
    return this.builder.build({ resumeText });
  }

  /** Check a single interview topic for assertion phrasing. */
  auditTopic(topic: InterviewTopic): AuditFinding {
    const text = `${topic.topic} ${topic.rationale} ${topic.probes.join(' ')}`;
    const hit = ASSERTION_PHRASES.find((re) => re.test(text));
    if (hit) {
      return {
        severity: 'warning',
        scope: `topic:${topic.topic}`,
        finding: `Generated content asserts candidate ability ("${hit.source}"). It must stay an open probe: “${topic.topic}”.`,
      };
    }
    return {
      severity: 'ok',
      scope: `topic:${topic.topic}`,
      finding: 'Topic is phrased as an open probe, not an assertion.',
    };
  }

  /**
   * Verify the anti-hallucination contract across the whole profile.
   * Returns warnings only; a clean profile yields no findings with severity
   * 'warning' and a `passes` flag of true.
   */
  audit(profile: CandidateProfile): { readonly passes: boolean; readonly findings: readonly AuditFinding[] } {
    const findings: AuditFinding[] = [];

    // 1. Interview topics must never assert candidate ability.
    for (const topic of profile.potentialInterviewTopics) {
      findings.push(this.auditTopic(topic));
    }

    // 2. Candidate-level estimate must be labelled a hypothesis, never a fact.
    if (profile.candidateLevelHypothesis.status !== 'hypothesis') {
      findings.push({
        severity: 'warning',
        scope: 'candidateLevelHypothesis',
        finding: 'Candidate level is not flagged as an unvalidated hypothesis.',
      });
    }

    // 3. Every claimed skill and interview topic needs a source reference.
    if (profile.evidenceSourceReferences.length === 0) {
      findings.push({
        severity: 'warning',
        scope: 'evidenceSourceReferences',
        finding: 'No source references recorded for the profile.',
      });
    }

    const warnings = findings.filter((f) => f.severity === 'warning');
    return { passes: warnings.length === 0, findings };
  }
}