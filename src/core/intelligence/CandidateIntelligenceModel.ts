import type {
  CandidateLevelHypothesis,
  CandidateProfile,
  EvidenceVerdict,
  KnowledgeGap,
  LevelBand,
  Question,
  ResumeSourceRef,
  RoadmapStep,
  RoleRequirement,
  SkillCategory,
  SkillState,
  SkillsTaxonomy,
} from '../types.js';
import type { EvidenceVerdictSummary } from '../assessment/EvidenceTracer.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { mean, norm, round } from '../utils/norm.js';

/**
 * CANDIDATE INTELLIGENCE MODEL
 *
 * A single, structured, evidence-derived view of the candidate. For every
 * tracked skill it exposes:
 *
 *   score            – proficiency estimate on 0..1 (from the rolling state)
 *   confidence       – how much evidence backs that estimate (0..1)
 *   resumeEvidence   – claims/statements taken from the resume (hypotheses)
 *   interviewEvidence – graded evidence gathered during the interview
 *   knowledgeGaps    – distances to the target role's required band
 *   relatedTopics    – resume-derived probes + subtopics actually interviewed
 *
 * ANTI-HARD-CODING RULE (see the enclosing requirement):
 *   Values below are NEVER hard-coded. They are computed exclusively from the
 *   interview: the rolling skill state (estimate + confidence), the evidence
 *   ledger, the gap analysis, and the resume profile. A candidate with no
 *   interview evidence gets a neutral prior (score 0.5) and confidence 0 — the
 *   system refuses to invent ability it has not observed.
 */

export type RoleVerdict = 'meets' | 'partially_meets' | 'gap' | 'unverified';

/** A resume statement raised as a hypothesis for this skill. */
export interface ResumeEvidence {
  readonly kind: 'resume';
  readonly claimId: string;
  readonly text: string;
  readonly verdict: EvidenceVerdict;
  readonly weight: number;
  readonly source: ResumeSourceRef | undefined;
}

/** A graded interview probe bound to a resume claim for this skill. */
export interface InterviewEvidence {
  readonly kind: 'interview';
  readonly evidenceId: string;
  readonly questionId: string;
  readonly claimId: string;
  readonly excerpt: string;
  /** 0..1: how strongly this probe supported the claim. */
  readonly supportStrength: number;
  readonly timestamp: number;
}

/** One graded probe observation for the skill. */
export interface SkillProbe {
  readonly questionId: string;
  /** Score on 0..1. */
  readonly score: number;
  readonly difficulty: number;
  /** How evidence-rich the answer was (0..1). */
  readonly evidenceQuality: number;
}

export interface RelatedTopic {
  readonly topic: string;
  readonly provenance: 'resume_probe' | 'interviewed' | 'roadmap';
  readonly sourceLine?: number;
  readonly questionId?: string;
  readonly rationale?: string;
}

export interface SkillIntelligence {
  readonly skillId: string;
  readonly label: string;
  readonly category: SkillCategory | undefined;
  readonly roleRelevant: boolean;
  readonly requiredLevel: LevelBand | undefined;
  /** Rolling estimate on the 0..10 scale. */
  readonly estimate10: number;
  /** Proficiency estimate on 0..1 (spec's `score`). */
  readonly score: number;
  /** Confidence in the estimate (0..1). */
  readonly confidence: number;
  readonly samples: number;
  readonly verdict: RoleVerdict;
  readonly probes: readonly SkillProbe[];
  readonly resumeEvidence: readonly ResumeEvidence[];
  readonly interviewEvidence: readonly InterviewEvidence[];
  readonly knowledgeGaps: readonly KnowledgeGap[];
  readonly relatedTopics: readonly RelatedTopic[];
}

export interface CandidateIntelligenceSummary {
  readonly skillsTracked: number;
  readonly probedSkills: number;
  readonly unprobedSkills: number;
  /** Mean proficiency across evidence-bearing skills (0..1); 0 if none. */
  readonly overallScore: number;
  readonly overallConfidence: number;
  readonly totalResumeEvidence: number;
  readonly totalInterviewEvidence: number;
  readonly claims: Record<EvidenceVerdict, number>;
  readonly gapsTotal: number;
}

export interface CandidateIntelligenceModel {
  readonly candidateName: string;
  /** skillId → skill intelligence. */
  readonly skills: Readonly<Record<string, SkillIntelligence>>;
  /** Density-ordered convenience list (most evidence first). */
  readonly ordered: readonly SkillIntelligence[];
  readonly summary: CandidateIntelligenceSummary;
  readonly candidateLevelHypothesis: CandidateLevelHypothesis;
}

export interface CandidateIntelligenceInput {
  readonly profile: CandidateProfile;
  readonly role: RoleRequirement;
  readonly states: readonly SkillState[];
  readonly evidence: EvidenceVerdictSummary;
  readonly gaps: readonly KnowledgeGap[];
  readonly questions?: ReadonlyMap<string, Question>;
  readonly roadmap?: readonly RoadmapStep[];
}

/** Neutral prior (estimate 5/10) — used only when no interview evidence exists. */
const NEUTRAL_PRIOR_10 = 5;
/**
 * Builds a candidate intelligence model from evidence inputs.
 *
 * All values (score, confidence, evidence, gaps, topics) flow from the inputs;
 * the builder only reshapes and normalises them. It never fabricates numbers —
 * see the class-level anti-hard-coding note.
 */
export class CandidateIntelligenceModelBuilder {
  constructor(private readonly taxonomy: SkillsTaxonomy = defaultTaxonomy) {}

  build(input: CandidateIntelligenceInput): CandidateIntelligenceModel {
    const ordered: SkillIntelligence[] = [];
    for (const skillId of this.collectSkillIds(input)) {
      ordered.push(this.buildSkill(skillId, input));
    }
    // Most-evidenced first so consumers read the strongest signal first.
    ordered.sort((a, b) => b.samples - a.samples);

    const skills: Record<string, SkillIntelligence> = {};
    for (const s of ordered) skills[s.skillId] = s;

    return {
      candidateName: input.profile.candidateName,
      skills,
      ordered,
      summary: this.buildSummary(ordered, input),
      candidateLevelHypothesis: input.profile.candidateLevelHypothesis,
    };
  }

  /** The skills the model tracks = resume claims ∪ role requirements ∪ observed states. */
  private collectSkillIds(input: CandidateIntelligenceInput): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    const push = (id: string): void => {
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    };
    for (const s of input.profile.skills) push(s.skillId);
    for (const r of input.role.skills) push(r.skillId);
    for (const st of input.states) push(st.skillId);
    return ids;
  }

  private buildSkill(skillId: string, input: CandidateIntelligenceInput): SkillIntelligence {
    const def = this.taxonomy.get(skillId);
    const state = input.states.find((s) => s.skillId === skillId);

    const roleReq = input.role.skills.find((r) => r.skillId === skillId);
    const roleRelevant = roleReq !== undefined;
    const requiredLevel = roleReq?.requiredLevel;

    const claims = input.profile.claims.filter((c) => c.skillIds.includes(skillId));
    const claimIds = new Set(claims.map((c) => c.id));

    const resumeEvidence: ResumeEvidence[] = claims.map((c) => ({
      kind: 'resume',
      claimId: c.id,
      text: c.text,
      verdict: c.verdict,
      weight: c.weight,
      source: c.sourceRef,
    }));

    const interviewEvidence: InterviewEvidence[] = input.evidence.records
      .filter((r) => claimIds.has(r.claimId))
      .map((r) => ({
        kind: 'interview',
        evidenceId: r.id,
        questionId: r.questionId,
        claimId: r.claimId,
        excerpt: r.excerpt,
        supportStrength: r.supportStrength,
        timestamp: r.timestamp,
      }));

    const estimate10 = state ? state.estimate : NEUTRAL_PRIOR_10;
    const probes: SkillProbe[] = (state?.history ?? []).map((h) => ({
      questionId: h.questionId,
      score: round(norm.to01(h.score), 2),
      difficulty: h.difficulty,
      evidenceQuality: round(h.evidenceQuality, 2),
    }));

    return {
      skillId,
      label: def?.label ?? skillId,
      category: def?.category,
      roleRelevant,
      requiredLevel,
      estimate10: round(estimate10, 1),
      score: round(norm.to01(estimate10), 2),
      confidence: round(state?.confidence ?? 0, 2),
      samples: state?.samples ?? 0,
      verdict: this.verdictFor(state, skillId, requiredLevel),
      probes,
      resumeEvidence,
      interviewEvidence,
      knowledgeGaps: input.gaps.filter((g) => g.skillId === skillId),
      relatedTopics: this.relatedTopicsFor(skillId, input),
    };
  }

  private verdictFor(state: SkillState | undefined, skillId: string, level: LevelBand | undefined): RoleVerdict {
    if (!state || state.samples === 0) return 'unverified';
    if (level === undefined) return 'unverified'; // not measured against a role band
    const window = this.taxonomy.assert(skillId).competencyWindow[level];
    const midpoint = (window.min + window.max) / 2;
    if (state.estimate >= midpoint) return 'meets';
    if (state.estimate < window.min) return 'gap';
    return 'partially_meets';
  }

  private relatedTopicsFor(skillId: string, input: CandidateIntelligenceInput): RelatedTopic[] {
    const topics: RelatedTopic[] = [];

    // 1. Resume-derived interrogation probes.
    for (const t of input.profile.potentialInterviewTopics) {
      if (t.skillIds?.includes(skillId)) {
        topics.push({
          topic: t.topic,
          provenance: 'resume_probe',
          sourceLine: t.source.line,
          rationale: t.rationale,
        });
      }
    }

    // 2. Subtopics actually interrogated during the interview.
    const observed = new Set<string>();
    const state = input.states.find((s) => s.skillId === skillId);
    for (const h of state?.history ?? []) {
      const q = input.questions?.get(h.questionId);
      const subtopic = q?.subtopic;
      if (!subtopic || observed.has(subtopic)) continue;
      observed.add(subtopic);
      topics.push({ topic: subtopic, provenance: 'interviewed', questionId: h.questionId });
    }

    // 3. Roadmap actions mapped back to the skill.
    for (const step of input.roadmap ?? []) {
      if (step.skillId === skillId) {
        topics.push({ topic: step.action, provenance: 'roadmap', rationale: step.rationale });
      }
    }

    return topics;
  }

  private buildSummary(
    ordered: readonly SkillIntelligence[],
    input: CandidateIntelligenceInput,
  ): CandidateIntelligenceSummary {
    const probed = ordered.filter((s) => s.samples > 0);
    return {
      skillsTracked: ordered.length,
      probedSkills: probed.length,
      unprobedSkills: ordered.length - probed.length,
      overallScore: round(probed.length ? mean(probed.map((s) => s.score)) : 0, 2),
      overallConfidence: round(probed.length ? mean(probed.map((s) => s.confidence)) : 0, 2),
      totalResumeEvidence: ordered.reduce((acc, s) => acc + s.resumeEvidence.length, 0),
      totalInterviewEvidence: ordered.reduce((acc, s) => acc + s.interviewEvidence.length, 0),
      claims: { ...input.evidence.counts },
      gapsTotal: ordered.reduce((acc, s) => acc + s.knowledgeGaps.length, 0),
    };
  }
}

export const defaultCandidateIntelligenceBuilder = new CandidateIntelligenceModelBuilder();
