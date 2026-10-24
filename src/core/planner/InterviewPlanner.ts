import type {
  CandidateProfile,
  Difficulty,
  InterviewPlan,
  JobRoleComparison,
  PlannedRound,
  PlannerOptions,
  RoleRequirement,
  RoundTemplate,
  RoundType,
  SkillState,
  SkillsTaxonomy,
} from '../types.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { JobRequirementIntelligence, type GapAnalysisOutput } from '../jobs/JobRequirementIntelligence.js';

export interface PlannerInput {
  readonly profile: CandidateProfile;
  readonly role: RoleRequirement | GapAnalysisOutput;
  readonly comparison?: JobRoleComparison;
  readonly states?: readonly SkillState[];
}

export interface InterviewPlannerDeps {
  readonly taxonomy?: SkillsTaxonomy;
  readonly jobIntelligence?: JobRequirementIntelligence;
}

const DEFAULT_ROUND_ORDER: readonly RoundType[] = [
  'hr_intro',
  'technical',
  'logic_problem_solving',
  'behavioral_out_of_box',
];

const DEFAULT_TEMPLATES: readonly RoundTemplate[] = [
  {
    type: 'hr_intro',
    name: 'Round 1 — Introduction / HR',
    description: 'Evaluate candidate background, career narrative, motivation, fit, and communication style.',
    defaultQuestionTypes: ['behavioral', 'conceptual'],
    evaluationCriteria: ['communication', 'structure', 'motivation', 'background', 'goals', 'delivery'],
    defaultDifficultyRange: { min: 1, max: 3 },
  },
  {
    type: 'technical',
    name: 'Round 2 — Technical',
    description: 'Evaluate core technical knowledge, resume claims validation, role-specific stack, conceptual understanding, and technical depth.',
    defaultQuestionTypes: ['conceptual', 'code', 'system_design', 'mcq'],
    evaluationCriteria: ['technical knowledge', 'resume claims', 'role-specific skills', 'conceptual understanding', 'technical depth'],
    defaultDifficultyRange: { min: 2, max: 4 },
  },
  {
    type: 'logic_problem_solving',
    name: 'Round 3 — Logic / Problem Solving / Project Building',
    description: 'Evaluate problem decomposition, algorithmic reasoning, data structures, edge cases, optimization, trade-offs, and communication of reasoning.',
    defaultQuestionTypes: ['code', 'numerical', 'system_design'],
    evaluationCriteria: ['decomposition', 'reasoning', 'algorithms', 'data structures', 'edge cases', 'optimization', 'trade-offs', 'communication of reasoning'],
    defaultDifficultyRange: { min: 3, max: 5 },
  },
  {
    type: 'behavioral_out_of_box',
    name: 'Round 4 — Behavioral / Out-of-the-Box',
    description: 'Evaluate self-awareness, strengths, weaknesses, failure handling, decision-making under uncertainty, adaptability, teamwork, creativity, and situational reasoning.',
    defaultQuestionTypes: ['behavioral', 'situational'],
    evaluationCriteria: ['self-awareness', 'strengths', 'weaknesses', 'failure handling', 'decision-making', 'adaptability', 'teamwork', 'creativity', 'situational reasoning'],
    defaultDifficultyRange: { min: 2, max: 4 },
  },
];

/**
 * INTERVIEW PLANNER
 *
 * Responsible for dynamically constructing a structured, multi-round interview plan:
 *   - decides required rounds and round order
 *   - assigns target skills and approximate difficulty ranges per round
 *   - selects question types and explicit evaluation criteria
 *   - distributes candidate-specific probes, role-specific topics, and validation gaps
 *
 * Flexible and extensible to support custom round types or specialized workflows.
 */
export class InterviewPlanner {
  private readonly taxonomy: SkillsTaxonomy;
  private readonly jobIntelligence: JobRequirementIntelligence;
  private readonly registry = new Map<string, RoundTemplate>();

  constructor(deps: InterviewPlannerDeps = {}) {
    this.taxonomy = deps.taxonomy ?? defaultTaxonomy;
    this.jobIntelligence = deps.jobIntelligence ?? new JobRequirementIntelligence({ taxonomy: this.taxonomy });

    for (const t of DEFAULT_TEMPLATES) {
      this.registry.set(t.type, t);
    }
  }

  /** Register or overwrite a round template. */
  registerTemplate(template: RoundTemplate): void {
    this.registry.set(template.type, template);
  }

  /** Retrieve a template by type. */
  getTemplate(type: RoundType): RoundTemplate | undefined {
    return this.registry.get(type);
  }

  /** List all registered templates. */
  listTemplates(): RoundTemplate[] {
    return [...this.registry.values()];
  }

  /**
   * Plan an interview structure based on candidate profile, role requirements, and options.
   */
  plan(input: PlannerInput, options: PlannerOptions = {}): InterviewPlan {
    if (options.customTemplates) {
      for (const t of options.customTemplates) this.registerTemplate(t);
    }

    const roleRequirement = 'roleRequirement' in input.role ? input.role.roleRequirement : input.role;
    const roleTitle = roleRequirement.title || 'Target Role';
    const candidateName = input.profile.candidateName || 'Candidate';

    const comparison = input.comparison ?? this.jobIntelligence.compare({
      profile: input.profile,
      role: input.role,
      states: input.states,
    });

    const roundTypes = options.requiredRounds && options.requiredRounds.length > 0
      ? options.requiredRounds
      : DEFAULT_ROUND_ORDER;

    const questionsPerRound = options.questionsPerRound ?? 4;
    const baseDifficultyRange = this.computeLevelDifficultyRange(input.profile.levelBand, options.targetDifficulty);

    const plannedRounds: PlannedRound[] = [];
    let roundNumber = 1;

    for (const type of roundTypes) {
      const template = this.registry.get(type) ?? this.fallbackTemplate(type);
      const planned = this.buildPlannedRound(
        roundNumber++,
        template,
        input.profile,
        comparison,
        roleRequirement,
        baseDifficultyRange,
        questionsPerRound,
      );
      plannedRounds.push(planned);
    }

    const totalQuestionBudget = plannedRounds.reduce((sum, r) => sum + r.questionBudget, 0);

    const summary =
      `Interview Plan for ${candidateName} (${input.profile.levelBand}) applying for ${roleTitle}.\n` +
      `Planned ${plannedRounds.length} round(s) covering ${comparison.matchedSkills.length} matched skill(s), ` +
      `${comparison.highPriorityGaps.length} high-priority gap(s), and ${comparison.interviewTargets.length} interview target(s).`;

    return {
      roleTitle,
      candidateName,
      rounds: plannedRounds,
      totalQuestionBudget,
      requiredRoundsCount: plannedRounds.length,
      summary,
    };
  }

  private buildPlannedRound(
    roundNumber: number,
    template: RoundTemplate,
    profile: CandidateProfile,
    comparison: JobRoleComparison,
    role: RoleRequirement,
    baseDifficultyRange: { min: Difficulty; max: Difficulty },
    questionBudget: number,
  ): PlannedRound {
    const roleSkills = role.skills.map((s) => s.skillId);
    const targetSkills: string[] = [];
    const candidateSpecificTopics: string[] = [];
    const roleSpecificTopics: string[] = [];
    const areasRequiringValidation: string[] = [];

    // Filter/assign candidate resume topics
    for (const topic of profile.potentialInterviewTopics) {
      if (this.isTopicRelevantForRound(template.type, topic.topic)) {
        candidateSpecificTopics.push(`${topic.topic} (line ${topic.source.line})`);
      }
    }

    // Filter/assign role-specific technologies and skills
    for (const tech of profile.technologies) {
      if (this.isTechRelevantForRound(template.type, tech)) {
        roleSpecificTopics.push(tech);
      }
    }
    for (const skillId of roleSkills) {
      if (this.isSkillRelevantForRound(template.type, skillId)) {
        targetSkills.push(skillId);
      }
    }

    // Filter/assign validation gaps & interview targets
    for (const gap of comparison.highPriorityGaps) {
      if (this.isSkillRelevantForRound(template.type, gap.skillId)) {
        areasRequiringValidation.push(`Validate ${gap.label} (${gap.kind}): ${gap.evidence}`);
      }
    }
    for (const target of comparison.interviewTargets) {
      if (this.isSkillRelevantForRound(template.type, target.skillId) && !targetSkills.includes(target.skillId)) {
        targetSkills.push(target.skillId);
      }
    }

    // Fallbacks if lists are empty
    if (targetSkills.length === 0) {
      targetSkills.push(...roleSkills.slice(0, 3));
    }
    if (candidateSpecificTopics.length === 0 && profile.claims.length > 0) {
      candidateSpecificTopics.push(...profile.claims.slice(0, 2).map((c) => c.text));
    }

    // Adjust difficulty range based on round type and base level
    const difficultyRange = this.adjustDifficultyForRound(template.type, baseDifficultyRange);

    return {
      roundNumber,
      type: template.type,
      name: template.name,
      description: template.description,
      targetSkills: [...new Set(targetSkills)],
      difficultyRange,
      questionTypes: template.defaultQuestionTypes,
      evaluationCriteria: template.evaluationCriteria,
      candidateSpecificTopics: [...new Set(candidateSpecificTopics)].slice(0, 5),
      roleSpecificTopics: [...new Set(roleSpecificTopics)].slice(0, 5),
      areasRequiringValidation: [...new Set(areasRequiringValidation)].slice(0, 5),
      questionBudget,
    };
  }

  private isSkillRelevantForRound(type: RoundType, skillId: string): boolean {
    const id = skillId.toLowerCase();
    switch (type) {
      case 'hr_intro':
        return id.includes('delivery') || id.includes('soft') || id.includes('engineering') || id.includes('testing');
      case 'technical':
        return id.includes('backend') || id.includes('frontend') || id.includes('cloud') || id.includes('databases') || id.includes('devops') || id.includes('security');
      case 'logic_problem_solving':
        return id.includes('algorithms') || id.includes('system_design') || id.includes('databases') || id.includes('backend');
      case 'behavioral_out_of_box':
        return id.includes('delivery') || id.includes('software') || id.includes('testing') || id.includes('devops');
      default:
        return true;
    }
  }

  private isTopicRelevantForRound(type: RoundType, topic: string): boolean {
    const t = topic.toLowerCase();
    switch (type) {
      case 'hr_intro':
        return t.includes('experience') || t.includes('career') || t.includes('role') || t.includes('background');
      case 'technical':
        return t.includes('architecture') || t.includes('database') || t.includes('api') || t.includes('cloud') || t.includes('infrastructure');
      case 'logic_problem_solving':
        return t.includes('algorithm') || t.includes('scale') || t.includes('design') || t.includes('trade-off') || t.includes('query');
      case 'behavioral_out_of_box':
        return t.includes('incident') || t.includes('failure') || t.includes('team') || t.includes('decision') || t.includes('conflict');
      default:
        return true;
    }
  }

  private isTechRelevantForRound(type: RoundType, tech: string): boolean {
    const t = tech.toLowerCase();
    switch (type) {
      case 'technical':
      case 'logic_problem_solving':
        return true;
      case 'hr_intro':
      case 'behavioral_out_of_box':
        return t.includes('git') || t.includes('agile') || t.includes('jira') || t.includes('docker');
      default:
        return true;
    }
  }

  private computeLevelDifficultyRange(
    band: string,
    targetDifficulty?: Difficulty,
  ): { min: Difficulty; max: Difficulty } {
    if (targetDifficulty) {
      const min = Math.max(1, targetDifficulty - 1) as Difficulty;
      const max = Math.min(5, targetDifficulty + 1) as Difficulty;
      return { min, max };
    }
    switch (band) {
      case 'junior':
        return { min: 1, max: 3 };
      case 'senior':
        return { min: 3, max: 5 };
      case 'mid':
      default:
        return { min: 2, max: 4 };
    }
  }

  private adjustDifficultyForRound(
    type: RoundType,
    base: { min: Difficulty; max: Difficulty },
  ): { min: Difficulty; max: Difficulty } {
    switch (type) {
      case 'hr_intro':
        return { min: 1, max: Math.min(3, base.max) as Difficulty };
      case 'logic_problem_solving':
        return { min: Math.max(2, base.min) as Difficulty, max: Math.min(5, base.max + 1) as Difficulty };
      case 'technical':
      case 'behavioral_out_of_box':
      default:
        return base;
    }
  }

  private fallbackTemplate(type: RoundType): RoundTemplate {
    return {
      type,
      name: `Round — ${type}`,
      description: `Evaluate candidate capabilities for ${type}.`,
      defaultQuestionTypes: ['conceptual', 'behavioral'],
      evaluationCriteria: ['communication', 'problem_solving', 'domain_knowledge'],
      defaultDifficultyRange: { min: 2, max: 4 },
    };
  }
}

export const defaultPlanner = new InterviewPlanner();
