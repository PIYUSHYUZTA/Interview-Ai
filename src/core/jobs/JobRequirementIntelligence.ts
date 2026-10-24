import type {
  CandidateProfile,
  CompanyExpectations,
  HighPriorityGap,
  InterviewTarget,
  JobDescriptionAnalysis,
  JobRequirementInput,
  JobRoleComparison,
  LevelBand,
  RoleRequirement,
  RoleSkill,
  SkillState,
  SkillsTaxonomy,
} from '../types.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { round } from '../utils/norm.js';
import { defaultJobRequirementParser, JobRequirementParser } from './JobRequirementParser.js';

/**
 * JOB REQUIREMENT INTELLIGENCE
 *
 * Takes an (optional) job description, extracts structured role requirements,
 * and compares the CANDIDATE PROFILE against the ROLE REQUIREMENTS to produce:
 *   matchedSkills, missingSkills, weakSkills, highPriorityGaps, interviewTargets
 *
 * Desired flow (chosen design):
 *
 *  JD → JobRequirementIntelligence → RoleRequirements → Candidate/Role comparison
 *     → HighPriorityGaps → InterviewTargets → AdaptiveEngine → targeted questions
 *
 * DESIGN CONTRACT
 *  - Resume skills are HYPOTHESES, not proof. A skill on the profile merely means
 *    the candidate *claimed* it. So "matched" is only a starting signal; what we
 *    truly need is "what must we still validate?".
 *  - All values are derived deterministically from the inputs. Nothing is assumed
 *    about the candidate beyond what an honest comparison can state.
 */

export interface JobCompareInput {
  readonly profile: CandidateProfile;
  readonly role: readonly RoleSkill[] | RoleRequirement | GapAnalysisOutput;
  /** Rolling skill states (estimates + confidence), when available. */
  readonly states?: readonly SkillState[];
}

export interface GapAnalysisOutput {
  readonly analysis: JobDescriptionAnalysis;
  readonly roleTitle: string;
  readonly expectedLevel: LevelBand | undefined;
  readonly roleSkills: readonly RoleSkill[];
  /** A planner-compatible role consumed by AdaptiveEngine/GapAnalyzer. */
  readonly roleRequirement: RoleRequirement;
}

export interface JobRequirementIntelligenceDeps {
  readonly parser?: JobRequirementParser;
  readonly taxonomy?: SkillsTaxonomy;
}

function labelFor(taxonomy: SkillsTaxonomy, id: string): string {
  return taxonomy.get(id)?.label ?? id;
}

export class JobRequirementIntelligence {
  private readonly parser: JobRequirementParser;
  private readonly taxonomy: SkillsTaxonomy;

  constructor(deps: JobRequirementIntelligenceDeps = {}) {
    this.parser = deps.parser ?? defaultJobRequirementParser;
    this.taxonomy = deps.taxonomy ?? defaultTaxonomy;
  }

  /**
   * Analyze an optional job description, role requirements, and company expectations
   * into structured analysis + a planner-compatible RoleRequirement.
   */
  analyze(input?: string | JobRequirementInput): GapAnalysisOutput {
    let jdText = '';
    let explicitRole: RoleRequirement | readonly RoleSkill[] | undefined;
    let explicitCompanyExp: CompanyExpectations | string | readonly string[] | undefined;
    let explicitTitle: string | undefined;
    let explicitLevel: LevelBand | undefined;

    if (typeof input === 'string') {
      jdText = input;
    } else if (input) {
      jdText = input.jobDescription ?? '';
      explicitRole = input.roleRequirements;
      explicitCompanyExp = input.companyExpectations;
      explicitTitle = input.title;
      explicitLevel = input.expectedLevel;
    }

    const baseAnalysis = jdText ? this.parser.parse(jdText) : {
      title: explicitTitle ?? 'Target Role',
      requiredSkills: [],
      preferredSkills: [],
      responsibilities: [],
      expectedLevel: explicitLevel,
      relevantTechnologies: [],
      problemSolvingExpectations: [],
      domainKnowledge: [],
      companyExpectations: [],
      sections: [],
    };

    let companyExpectations = [...baseAnalysis.companyExpectations];
    if (explicitCompanyExp) {
      if (typeof explicitCompanyExp === 'string') {
        companyExpectations.push(explicitCompanyExp);
      } else if (Array.isArray(explicitCompanyExp)) {
        companyExpectations.push(...explicitCompanyExp);
      } else if (typeof explicitCompanyExp === 'object') {
        const exp = explicitCompanyExp as CompanyExpectations;
        if (exp.cultureValues) companyExpectations.push(...exp.cultureValues);
        if (exp.workStyle) companyExpectations.push(...exp.workStyle);
        if (exp.leadershipExpectations) companyExpectations.push(...exp.leadershipExpectations);
        if (exp.notes) companyExpectations.push(...exp.notes);
      }
    }

    const title = explicitTitle ?? baseAnalysis.title;
    const expectedLevel = explicitLevel ?? baseAnalysis.expectedLevel;

    const analysis: JobDescriptionAnalysis = {
      ...baseAnalysis,
      title,
      expectedLevel,
      companyExpectations: [...new Set(companyExpectations)],
    };

    let roleSkills: RoleSkill[];
    if (explicitRole) {
      roleSkills = resolveRoleSkills(explicitRole);
    } else {
      roleSkills = this.buildRoleSkills(analysis);
    }

    const roleRequirement = this.toRoleRequirement(title, roleSkills);

    return {
      analysis,
      roleTitle: title,
      expectedLevel,
      roleSkills,
      roleRequirement,
    };
  }

  /** Map parsed JD skills into full role-skill specs (required vs preferred). */
  buildRoleSkills(analysis: JobDescriptionAnalysis): RoleSkill[] {
    const level = analysis.expectedLevel ?? 'mid';
    const out: RoleSkill[] = [];
    const seen = new Set<string>();

    for (const name of analysis.requiredSkills) {
      const skillId = name;
      if (seen.has(skillId)) continue;
      seen.add(skillId);
      out.push({
        skillId,
        label: labelFor(this.taxonomy, skillId),
        requiredLevel: level,
        weight: 1.0,
        kind: 'required',
        source: 'required section',
      });
    }

    for (const name of analysis.preferredSkills) {
      const skillId = name;
      if (seen.has(skillId)) continue;
      seen.add(skillId);
      out.push({
        skillId,
        label: labelFor(this.taxonomy, skillId),
        requiredLevel: level,
        weight: 0.6,
        kind: 'preferred',
        source: 'preferred section',
      });
    }

    return out;
  }

  /** Build a planner-compatible RoleRequirement from role skills. */
  toRoleRequirement(title: string, roleSkills: readonly RoleSkill[]): RoleRequirement {
    return {
      title,
      skills: roleSkills.map((s) => ({
        skillId: s.skillId,
        weight: s.weight,
        requiredLevel: s.requiredLevel,
        kind: s.kind,
      })),
      softRequirements: [],
    };
  }

  /**
   * Compare the candidate profile against role requirements.
   * Produces matched / missing / weak skills + high-priority gaps + interview targets.
   */
  compare(input: { profile: CandidateProfile; role: readonly RoleSkill[] | RoleRequirement | GapAnalysisOutput; states?: readonly SkillState[] }): JobRoleComparison {
    const roleTarget = 'roleSkills' in input.role ? input.role.roleSkills : input.role;
    const roleSkills = resolveRoleSkills(roleTarget);
    const profileSkills = new Set(input.profile.skills.map((s) => s.skillId));
    const states = input.states ?? [];
    const stateFor = (id: string): SkillState | undefined => states.find((s) => s.skillId === id);

    const matched: RoleSkill[] = [];
    const missing: RoleSkill[] = [];
    const weak: RoleSkill[] = [];

    for (const rs of roleSkills) {
      if (profileSkills.has(rs.skillId)) {
        matched.push(rs);
        if (isWeak(rs, stateFor(rs.skillId), this.taxonomy)) weak.push(rs);
      } else {
        missing.push(rs);
      }
    }

    const highPriorityGaps = computeGaps(roleSkills, missing, weak, stateFor, this.taxonomy);
    const interviewTargets = computeTargets(profileSkills, roleSkills, weak, stateFor);

    return {
      roleTitle: roleTitleOf(input.role),
      matchedSkills: sortByWeightDesc(matched),
      missingSkills: sortByWeightDesc(missing),
      weakSkills: sortByWeightDesc(weak),
      highPriorityGaps,
      interviewTargets,
    };
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers (kept small & pure so the class stays readable)
// ---------------------------------------------------------------------------

function resolveRoleSkills(role: readonly RoleSkill[] | RoleRequirement | GapAnalysisOutput): RoleSkill[] {
  if (Array.isArray(role)) return [...role];
  if ('roleSkills' in role) return [...role.roleSkills];
  if ('skills' in role) {
    return role.skills.map((s) => ({
      skillId: s.skillId,
      label: s.skillId,
      requiredLevel: s.requiredLevel,
      weight: s.weight,
      kind: s.kind ?? 'required',
      source: 'explicit role requirement',
    }));
  }
  return [];
}

function roleTitleOf(role: readonly RoleSkill[] | RoleRequirement | GapAnalysisOutput): string {
  if (Array.isArray(role)) return 'Custom requirements';
  if ('roleTitle' in role) return role.roleTitle;
  if ('title' in role) return role.title;
  return 'Untitled Role';
}

/**
 * Weak = claimed on the resume but NOT demonstrated to the required band:
 *  - no interview evidence yet (state missing or confidence ≈ 0), or
 *  - the estimate is clearly below the required band's midpoint.
 * A resume claim alone never counts as demonstrated strength.
 */
function isWeak(rs: RoleSkill, state: SkillState | undefined, taxonomy: SkillsTaxonomy): boolean {
  if (!state || state.samples === 0 || state.confidence < 0.35) return true; // unvalidated
  const window = taxonomy.assert(rs.skillId).competencyWindow[rs.requiredLevel];
  const midpoint = (window.min + window.max) / 2;
  return state.estimate < midpoint;
}

function computeGaps(
  roleSkills: readonly RoleSkill[],
  missing: readonly RoleSkill[],
  weak: readonly RoleSkill[],
  stateFor: (id: string) => SkillState | undefined,
  taxonomy: SkillsTaxonomy,
): HighPriorityGap[] {
  const gaps: HighPriorityGap[] = [];
  let idCounter = 0;

  // Missing required = highest severity.
  for (const rs of roleSkills) {
    if (!missing.includes(rs)) continue;
    const kindFactor = rs.kind === 'required' ? 1 : 0.5;
    const gapSeverity = 1;
    const priority = round(rs.weight * gapSeverity * kindFactor, 3);
    gaps.push({
      id: `gap-${idCounter++}`,
      skillId: rs.skillId,
      label: rs.label,
      requiredLevel: rs.requiredLevel,
      kind: rs.kind,
      candidateEstimate: stateFor(rs.skillId)?.estimate ?? null,
      gapSeverity,
      requirementWeight: rs.weight,
      confidence: stateFor(rs.skillId)?.confidence ?? 0,
      priority,
      evidence: `Not present among the candidate's claimed skills (required: ${rs.kind}). Validate.`,
    });
  }

  // Weak (claimed but under-demonstrated).
  for (const rs of weak) {
    const state = stateFor(rs.skillId);
    const estimate = state?.estimate ?? 0;
    const window = taxonomy.assert(rs.skillId).competencyWindow[rs.requiredLevel];
    const midpoint = (window.min + window.max) / 2;
    const deficit = Math.max(0, midpoint - estimate);
    const gapSeverity = deficit === 0 && (!state || state.confidence < 0.35) ? 0.6 : clamp01(deficit / 6);
    const kindFactor = rs.kind === 'required' ? 1 : 0.5;
    const priority = round(rs.weight * gapSeverity * kindFactor, 3);
    gaps.push({
      id: `gap-${idCounter++}`,
      skillId: rs.skillId,
      label: rs.label,
      requiredLevel: rs.requiredLevel,
      kind: rs.kind,
      candidateEstimate: estimate,
      gapSeverity,
      requirementWeight: rs.weight,
      confidence: state?.confidence ?? 0,
      priority,
      evidence:
        state && state.samples > 0
          ? `Estimate ${round(state.estimate, 1)}/10 vs required band ~${Math.round(window.min)}-${Math.round(window.max)} (conf ${round(state.confidence, 2)}).`
          : 'Claimed on resume but no interview evidence yet — must validate.',
    });
  }

  return gaps.sort((a, b) => b.priority - a.priority);
}

/**
 * Interview targets — skills the interview should intentionally gather more
 * evidence about, prioritized:
 *   1. missing required → 2. weak required → 3. low-confidence required → 4. important preferred.
 */
function computeTargets(
  profileSkills: ReadonlySet<string>,
  roleSkills: readonly RoleSkill[],
  weak: readonly RoleSkill[],
  stateFor: (id: string) => SkillState | undefined,
): InterviewTarget[] {
  const missingIds = new Set(roleSkills.filter((r) => !profileSkills.has(r.skillId)).map((r) => r.skillId));
  const weakIds = new Set(weak.map((r) => r.skillId));

  const tier = (rs: RoleSkill): number => {
    if (rs.kind === 'required' && missingIds.has(rs.skillId)) return 1;
    if (rs.kind === 'required' && weakIds.has(rs.skillId)) return 2;
    const state = stateFor(rs.skillId);
    if (rs.kind === 'required' && (!state || state.confidence < 0.35)) return 3;
    if (rs.kind === 'preferred' && rs.weight >= 0.5) return 4;
    return 9; // low-priority / not worth probing now
  };

  const targets: InterviewTarget[] = [];
  for (const rs of roleSkills) {
    const t = tier(rs);
    if (t === 9) continue;
    const reason =
      t === 1 ? 'Missing required skill' :
      t === 2 ? 'Weak (claimed but under-demonstrated) required skill' :
      t === 3 ? 'Low-confidence required skill' :
      'Important preferred skill';
    targets.push({
      skillId: rs.skillId,
      label: rs.label,
      reason,
      priority: round(1 / t, 3),
      kind: rs.kind,
      weight: rs.weight,
    });
  }

  return targets.sort((a, b) => b.priority - a.priority);
}

function sortByWeightDesc(skills: readonly RoleSkill[]): RoleSkill[] {
  return [...skills].sort((a, b) => b.weight - a.weight);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}