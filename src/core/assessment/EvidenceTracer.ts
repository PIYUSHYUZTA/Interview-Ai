import type { CandidateAnswer, Claim, EvidenceRecord, EvidenceVerdict, Question, QuestionEvaluation } from '../types.js';
import { norm, round, mean } from '../utils/norm.js';

export interface EvidenceInput {
  question: Question;
  answer: CandidateAnswer;
  evaluation: QuestionEvaluation;
}

const VALIDATE_AT = 0.65;
const REFUTE_AT = 0.32;

/**
 * Links graded evidence to the falsifiable claims raised by the resume.
 *
 * Verdict transition logic (all evidence-weighted, never single-shot):
 *  - `unverified` while a claim has no evidence;
 * - support strength accumulates across probes;
 *  - validated when average support ≥ 0.65;
 *  - refuted when average support ≤ 0.32;
 *  - otherwise `partial` once at least one probe touched it.
 */
export class EvidenceTracer {
  private readonly records: EvidenceRecord[] = [];

  constructor(private claims: Claim[]) {}

  get pendingClaims(): readonly Claim[] {
    return this.claims;
  }

  /** Feed one graded probe. Returns newly created evidence records. */
  record(input: EvidenceInput): EvidenceRecord[] {
    const relevant = this.claims.filter((c) => c.skillIds.includes(input.question.skillId));
    if (relevant.length === 0) return [];

    const support = this.supportStrength(input);
    const excerpt = excerptOf(input.answer);

    const created: EvidenceRecord[] = relevant.map((claim) => {
      const record: EvidenceRecord = {
        id: `ev-${input.question.id}-${claim.id}`,
        claimId: claim.id,
        questionId: input.question.id,
        excerpt,
        supportStrength: round(support, 2),
        timestamp: input.answer.timestamp,
      };
      this.records.push(record);
      claim.evidenceIds.push(record.id);
      return record;
    });

    this.recomputeVerdicts();
    return created;
  }

  /** Recompute every touched claim's verdict from its full evidence set. */
  private recomputeVerdicts(): void {
    for (const claim of this.claims) {
      const evidence = this.records
        .filter((r) => r.claimId === claim.id)
        .map((r) => r.supportStrength);
      if (evidence.length === 0) {
        claim.verdict = 'unverified';
        continue;
      }
      const average = mean(evidence);
      if (average >= VALIDATE_AT) claim.verdict = 'validated';
      else if (average <= REFUTE_AT) claim.verdict = 'refuted';
      else claim.verdict = 'partial';
    }
  }

  /**
   * Evidence quality of an answer: weight towards concrete applied examples and
   * whether the answer complied with the stated rubric cues.
   */
  private supportStrength(input: EvidenceInput): number {
    const ev = input.evaluation;
    const evidenceRichness = norm.to01(ev.criteria.appliedEvidence) * 0.6 + ev.rubricCompliance * 0.4;
    const gradeSignal = norm.to01(ev.grade);
    // A great answer with rich evidence supports the claim; a weak answer refutes it.
    return norm.clamp01(0.2 + gradeSignal * 0.5 + evidenceRichness * 0.3);
  }

  /** Final resolved claims (after all rounds). */
  resolve(): EvidenceVerdictSummary {
    const counts: Record<EvidenceVerdict, number> = {
      validated: 0,
      refuted: 0,
      partial: 0,
      unverified: 0,
    };
    for (const c of this.claims) counts[c.verdict] += 1;
    return { claims: this.claims, records: [...this.records], counts };
  }
}

export interface EvidenceVerdictSummary {
  readonly claims: readonly Claim[];
  readonly records: readonly EvidenceRecord[];
  readonly counts: Record<EvidenceVerdict, number>;
}

function excerptOf(answer: CandidateAnswer): string {
  const text = (answer.text || answer.code || '').trim().replace(/\s+/g, ' ');
  if (text.length > 0) {
    const sentence = text.slice(0, 220);
    // first explicit sentence boundary within the window, else the window itself
    const dot = sentence.indexOf('. ');
    return dot > 0 ? sentence.slice(0, dot + 1) : sentence;
  }
  // Objective probes carry no prose — capture what was actually selected so the
  // evidence record stays traceable instead of blank.
  if (answer.selectedChoiceIndex !== undefined) {
    return `(Selected option #${answer.selectedChoiceIndex})`;
  }
  return '';
}