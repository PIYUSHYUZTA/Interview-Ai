import type {
  CandidateProfile,
  CodeQuestion,
  Difficulty,
  DynamicQuestionInput,
  DynamicQuestionResult,
  JobDescriptionAnalysis,
  PlannedRound,
  Question,
  QuestionType,
  RoleRequirement,
  SkillDef,
  SkillsTaxonomy,
  SkillState,
  StructuredQuestionPayload,
} from '../types.js';
import type { AIProvider } from '../provider/AIProvider.js';
import type { LLMProvider } from '../provider/LLMProvider.js';
import { QUESTION_TEMPLATES, type BaseQuestion } from './questionBank.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { parseJsonData } from '../ai/json.js';

/**
 * Service 2: Question Generator Input Contract
 * Input: candidate profile + role requirements + round + rolling skill state + question history
 */
export interface GenerateQuestionServiceInput {
  readonly candidateProfile: CandidateProfile;
  readonly roleRequirements:
    | RoleRequirement
    | JobDescriptionAnalysis
    | { readonly roleRequirement: RoleRequirement }
    | { readonly title: string; readonly skills: readonly { readonly skillId: string; readonly weight?: number; readonly requiredLevel?: string }[] };
  readonly round: number | PlannedRound | string;
  readonly rollingSkillState: readonly SkillState[];
  readonly questionHistory: readonly (
    | Question
    | string
    | { readonly question: Question }
    | { readonly id: string; readonly prompt?: string; readonly subtopic?: string; readonly target_skill?: string; readonly skillId?: string }
  )[];
  readonly targetSkill?: string;
  readonly targetDifficulty?: number; // 1-10
}

/**
 * Service 2: Question Generator Output Contract
 * Output: JSON — question, topic, subtopic, difficulty (1-10), question_type, target_skill, expected_answer_points
 */
export interface GeneratedQuestionJSON {
  readonly question: string;
  readonly topic: string;
  readonly subtopic: string;
  readonly difficulty: number; // 1-10
  readonly question_type: string;
  readonly target_skill: string;
  readonly expected_answer_points: readonly string[];
}

export interface GenerateOptions {
  readonly skillId: string;
  readonly difficulty: Difficulty;
  readonly excludeIds?: ReadonlySet<string>;
  /** Preferred question types in order; used as a soft filter. */
  readonly preferTypes?: readonly QuestionType[];
}

export interface QuestionGeneratorDeps {
  readonly taxonomy?: SkillsTaxonomy;
  readonly templates?: ReadonlyMap<string, readonly BaseQuestion[]>;
  readonly provider?: AIProvider | LLMProvider;
}

const TIME_BY_TYPE: Record<QuestionType, (d: Difficulty) => number> = {
  conceptual: (d) => 90 + d * 40,
  behavioral: (d) => 120 + d * 30,
  situational: (d) => 120 + d * 40,
  system_design: (d) => 180 + d * 60,
  code: () => 600,
  numerical: (d) => 90 + d * 30,
  mcq: () => 60,
};

/**
 * QUESTION GENERATION ENGINE (Module 7)
 *
 * Dynamically generates structured, context-aware, personalized interview questions.
 * Evaluates candidate profile, role requirements, current round, history, difficulty,
 * target skill, and recent evaluations to emit structured JSON output (`StructuredQuestionPayload`)
 * and materialized `Question` objects.
 */
export class QuestionGenerator {
  private readonly taxonomy: SkillsTaxonomy;
  private readonly templates: ReadonlyMap<string, readonly BaseQuestion[]>;
  private readonly provider?: AIProvider | LLMProvider;
  private readonly cursors = new Map<string, number>();
  /** Subtopics already exercised per skill — prevents mirror-questions. */
  private readonly used = new Set<string>();

  constructor(deps: QuestionGeneratorDeps = {}) {
    this.taxonomy = deps.taxonomy ?? defaultTaxonomy;
    this.templates = deps.templates ?? QUESTION_TEMPLATES;
    this.provider = deps.provider;
  }

  get aiProvider(): AIProvider | LLMProvider | undefined {
    return this.provider;
  }

  /**
   * Module 7 Dynamic Question Generation:
   * Generates a single personalized question dynamically based on candidate profile,
   * role requirements, history, and recent evaluation.
   */
  generateDynamic(input: DynamicQuestionInput): DynamicQuestionResult {
    const { targetSkill, currentDifficulty, candidateProfile, roleRequirements, recentEvaluation, questionHistory = [] } = input;

    // Check for previous question history to avoid repetition
    const historyAskedIds = new Set<string>();
    const historySubtopics = new Set<string>();
    for (const item of questionHistory) {
      if ('question' in item && item.question) {
        historyAskedIds.add(item.question.id);
        if (item.question.skillId === targetSkill) historySubtopics.add(item.question.subtopic);
      } else if ('id' in item) {
        historyAskedIds.add(item.id);
        if (item.skillId === targetSkill && item.subtopic) historySubtopics.add(item.subtopic);
      }
    }

    const roleTitle =
      'roleRequirement' in roleRequirements ? roleRequirements.roleRequirement.title :
      'title' in roleRequirements ? roleRequirements.title :
      'Target Role';
    const planned = typeof input.currentRound === 'object' ? input.currentRound : undefined;

    // Determine candidate experience context for personalization
    const experienceMatch = candidateProfile.experience.find((e) =>
      e.bullets.some((b) => b.toLowerCase().includes(targetSkill.toLowerCase())) ||
      e.role.toLowerCase().includes(targetSkill.toLowerCase()),
    );

    const claimMatch = candidateProfile.claims.find((c) => c.skillIds.includes(targetSkill));

    // Determine follow-up state
    let isFollowUp = false;
    let followUpPrompt: string | undefined;
    let followUpPurpose: string | undefined;
    const priorSkillQuestions = questionHistory.filter((item) => 'question' in item && item.question.skillId === targetSkill).length;

    if (recentEvaluation && recentEvaluation.skillId === targetSkill) {
      const unresolved = unresolvedRubricPoints(recentEvaluation.rationale);
      const missingPoint = unresolved.split(/[,;]/).at(-1)?.trim().replace(/[.!?]+$/, '');
      if (recentEvaluation.grade < 5.0) {
        isFollowUp = true;
        followUpPrompt = missingPoint
          ? `Let's revisit the fundamentals. In your own words, what does ${missingPoint} mean, and where would you use it?`
          : `Let's revisit the fundamentals of ${targetSkill}. In your own words, what is the core idea, and where would you use it?`;
        followUpPurpose = 'Foundational follow-up based on a concept not demonstrated in the previous answer.';
      } else if (recentEvaluation.grade < 8.5) {
        isFollowUp = true;
        const probeLead = ['Could you clarify', 'To make this more concrete, could you explain', 'Could you give a focused example of'][priorSkillQuestions % 3];
        followUpPrompt = missingPoint
          ? `${probeLead} ${missingPoint}${priorSkillQuestions % 3 === 2 ? '?' : ' with one focused example?'}`
          : `${probeLead} one point from your answer about ${targetSkill} with a focused example?`;
        followUpPurpose = 'Clarification probe for a concept that was not clearly demonstrated in the previous answer.';
      } else if (recentEvaluation.grade >= 8.5) {
        isFollowUp = true;
        const strongProbes = [
          `Building on your answer, how would you handle a higher-complexity ${targetSkill} scenario, and what trade-off would guide your approach?`,
          `Let's raise the complexity: how would you handle a higher-complexity ${targetSkill} scenario, and what trade-off would guide your approach?`,
          `Now consider a more demanding case: how would you handle a higher-complexity ${targetSkill} scenario, and what trade-off would guide your approach?`,
        ];
        followUpPrompt = strongProbes[priorSkillQuestions % strongProbes.length];
        followUpPurpose = `Level-up probe following strong performance on previous question.`;
      }
    }

    // Allowed question types from constraints or round
    const allowedTypes = input.interviewConstraints?.allowedTypes ?? planned?.questionTypes;

    // Pick base question template
    const available = this.templates.get(targetSkill) ?? buildFallback(this.taxonomy.assert(targetSkill));
    let bankAll = allowedTypes ? available.filter((b) => allowedTypes.includes(b.type)) : available;
    if (!bankAll.length && allowedTypes) bankAll = buildFallback(this.taxonomy.assert(targetSkill)).filter((b) => allowedTypes.includes(b.type));
    if (!bankAll.length) throw new Error(`No question templates for ${targetSkill} with allowed types ${allowedTypes?.join(', ')}.`);
    const unusedBank = bankAll.filter((b) => !historySubtopics.has(b.subtopic) && !this.used.has(this.keyOf(b, targetSkill)));
    const candidates = unusedBank.length > 0 ? unusedBank : bankAll;
    const exhaustedQuestionPool = unusedBank.length === 0;

    const ranked = this.rank(candidates, currentDifficulty, input.interviewConstraints?.preferredTypes);
    let base = ranked[0] ?? buildFallback(this.taxonomy.assert(targetSkill))[0];
    this.used.add(this.keyOf(base, targetSkill));

    // Open with a concise, role-aware background question. It still targets a
    // planned skill and uses the behavioral type allowed by the intro round.
    const isOpening = planned?.type === 'hr_intro' && questionHistory.length === 0;
    if (isOpening && allowedTypes?.includes('behavioral')) {
      base = {
        ...base,
        subtopic: 'professional background',
        type: 'behavioral',
        prompt: `To start, could you briefly introduce your professional background and describe the experience most relevant to a ${roleTitle} role?`,
        hints: ['relevant professional experience', 'clear personal contribution', 'connection to the target role'],
      };
    }

    let cursor = this.cursors.get(targetSkill) ?? 0;
    while (historyAskedIds.has(this.idFor(base, targetSkill, cursor))) cursor++;
    this.cursors.set(targetSkill, cursor + 1);

    // Personalize prompt
    let finalPrompt = followUpPrompt ?? base.prompt;
    if (isOpening) {
      // The opening prompt above is already resume and role oriented.
    } else if (!followUpPrompt && experienceMatch) {
      finalPrompt = `On your resume, you listed experience as ${experienceMatch.role} at ${experienceMatch.company || 'your previous company'}. ${base.prompt}`;
    } else if (!followUpPrompt && claimMatch) {
      finalPrompt = `Based on your resume claim ("${claimMatch.text.slice(0, 80)}..."), ${base.prompt}`;
    }

    if (currentDifficulty !== base.difficulty && !followUpPrompt && !isOpening) {
      finalPrompt += currentDifficulty > base.difficulty
        ? '\n\nPlease include the trade-offs, edge cases, and failure modes that matter at this level.'
        : '\n\nStart with the core idea and one simple example.';
    }
    if (exhaustedQuestionPool) {
      const angles = [
        'the initial design', 'the implementation', 'testing and verification', 'a production failure',
        'a high-traffic situation', 'a safe rollout', 'ongoing maintenance', 'a review of trade-offs',
      ];
      const angle = angles[(questionHistory.length - 1) % angles.length];
      finalPrompt += `\n\nTo explore a different angle, consider ${base.subtopic} during ${angle}.`;
    }
    const plannedResumeTopic = planned?.candidateSpecificTopics[0];
    if (!isOpening && !followUpPrompt && plannedResumeTopic) {
      finalPrompt += `\n\nIf it fits your experience, ground your answer in this resume detail: ${plannedResumeTopic}.`;
    }

    const topicName = this.taxonomy.get(targetSkill)?.label ?? targetSkill;
    const subtopicName = base.subtopic;

    const purposeText =
      followUpPurpose ??
      (experienceMatch
        ? `Personalized probe validating claimed experience at ${experienceMatch.company || 'previous role'} for ${targetSkill}.`
        : `Targeted evaluation of ${targetSkill} (${subtopicName}) at difficulty d${currentDifficulty}.`);

    const expectedPoints = base.hints && base.hints.length > 0 ? base.hints : [
      `Demonstrate conceptual correctness for ${topicName}`,
      `Address practical trade-offs and edge cases`,
      `Provide structured communication and concrete evidence`,
    ];

    const structuredOutput: StructuredQuestionPayload = {
      question: finalPrompt,
      topic: topicName,
      subtopic: subtopicName,
      difficulty: currentDifficulty,
      question_type: base.type,
      target_skill: targetSkill,
      expected_answer_points: expectedPoints,
      purpose: purposeText,
    };

    const materializedQuestion = this.materializeWithPrompt(base, targetSkill, currentDifficulty, cursor, finalPrompt);

    return {
      structuredOutput,
      question: materializedQuestion,
      isFollowUp,
    };
  }

  generate(options: GenerateOptions): Question {
    const { skillId, difficulty, excludeIds = new Set<string>(), preferTypes } = options;
    const bankAll = this.templates.get(skillId) ?? buildFallback(this.taxonomy.assert(skillId));
    const fresh = bankAll.filter((b) => !this.used.has(this.keyOf(b, skillId)));
    // fall back to reuse (with a fresh id) only when the skill's pool is exhausted
    const candidates: BaseQuestion[] = fresh.length > 0 ? fresh : [...bankAll];
    if (candidates.length === 0) {
      throw new Error(`No available questions for skill "${skillId}" at difficulty ${difficulty}.`);
    }

    const ranked = this.rank(candidates, difficulty, preferTypes);
    const base = ranked[0];
    this.used.add(this.keyOf(base, skillId));

    const cursor = this.cursors.get(skillId) ?? 0;
    this.cursors.set(skillId, cursor + 1);
    void excludeIds; // global id-filtering is subsumed by per-skill template tracking

    return this.materialize(base, skillId, difficulty, cursor);
  }

  /**
   * Service 2: Question Generator
   *
   * Input: candidate profile + role requirements + round + rolling skill state + question history
   * Output: JSON — question, topic, subtopic, difficulty (1-10), question_type, target_skill, expected_answer_points
   * Rule: never repeat a recent question; never exceed interview scope
   */
  generateQuestion(input: GenerateQuestionServiceInput): GeneratedQuestionJSON {
    const {
      candidateProfile,
      roleRequirements,
      round,
      rollingSkillState = [],
      questionHistory = [],
    } = input;

    // 1. Extract and enforce interview scope from role requirements
    const roleTitle =
      'roleRequirement' in roleRequirements && roleRequirements.roleRequirement?.title
        ? roleRequirements.roleRequirement.title
        : 'title' in roleRequirements && typeof roleRequirements.title === 'string'
        ? roleRequirements.title
        : 'Target Role';

    const rawSkills =
      'roleRequirement' in roleRequirements && roleRequirements.roleRequirement?.skills
        ? roleRequirements.roleRequirement.skills
        : 'skills' in roleRequirements && Array.isArray(roleRequirements.skills)
        ? roleRequirements.skills
        : 'requiredSkills' in roleRequirements && Array.isArray((roleRequirements as any).requiredSkills)
        ? (roleRequirements as any).requiredSkills
        : [];

    const allowedSkills = new Set<string>(rawSkills.map((s: any) => s.skillId));

    if (allowedSkills.size === 0) {
      for (const s of candidateProfile.skills) allowedSkills.add(s.skillId);
    }

    // Rule: never exceed interview scope
    let targetSkill = input.targetSkill;
    if (targetSkill) {
      if (!allowedSkills.has(targetSkill)) {
        throw new Error(
          `Target skill "${targetSkill}" exceeds interview scope for role "${roleTitle}". Allowed skills: ${[...allowedSkills].join(', ')}`,
        );
      }
    } else {
      targetSkill = this.selectInScopeSkill(allowedSkills, rawSkills, rollingSkillState, questionHistory);
    }

    // 2. Rule: never repeat a recent question
    const historyPrompts = new Set<string>();
    const historyIds = new Set<string>();
    const historySubtopics = new Set<string>();

    for (const item of questionHistory) {
      if (typeof item === 'string') {
        historyIds.add(item);
        historyPrompts.add(item.toLowerCase().trim());
      } else if ('question' in item && item.question) {
        historyIds.add(item.question.id);
        historyPrompts.add(item.question.prompt.toLowerCase().trim());
        if (item.question.subtopic) historySubtopics.add(item.question.subtopic.toLowerCase().trim());
      } else if ('id' in item) {
        historyIds.add(item.id);
        if ('prompt' in item && typeof item.prompt === 'string') {
          historyPrompts.add(item.prompt.toLowerCase().trim());
        }
        if ('subtopic' in item && typeof item.subtopic === 'string') {
          historySubtopics.add(item.subtopic.toLowerCase().trim());
        }
      }
    }

    // 3. Calibrate difficulty strictly to 1..10
    let difficulty10: number;
    if (input.targetDifficulty !== undefined) {
      difficulty10 = Math.max(1, Math.min(10, Math.round(input.targetDifficulty)));
    } else {
      const state = rollingSkillState.find((s) => s.skillId === targetSkill);
      if (state && state.samples > 0) {
        difficulty10 = Math.max(1, Math.min(10, Math.round(state.estimate)));
      } else {
        const roundNum =
          typeof round === 'number'
            ? round
            : typeof round === 'object' && round !== null && 'roundNumber' in round
            ? (round as any).roundNumber
            : 1;
        difficulty10 = roundNum === 1 ? 4 : roundNum === 2 ? 6 : 8;
      }
    }

    // 4. Select question template for targetSkill avoiding any recent questions
    const bankAll = this.templates.get(targetSkill) ?? buildFallback(this.taxonomy.assert(targetSkill));

    const freshCandidates = bankAll.filter((b) => {
      const promptMatch = historyPrompts.has(b.prompt.toLowerCase().trim());
      const subtopicMatch = historySubtopics.has(b.subtopic.toLowerCase().trim());
      const usedMatch = this.used.has(this.keyOf(b, targetSkill!));
      return !promptMatch && !subtopicMatch && !usedMatch;
    });

    const fallbackCandidates = bankAll.filter((b) => {
      const promptMatch = historyPrompts.has(b.prompt.toLowerCase().trim());
      const usedMatch = this.used.has(this.keyOf(b, targetSkill!));
      return !promptMatch && !usedMatch;
    });

    const candidateTemplates =
      freshCandidates.length > 0
        ? freshCandidates
        : fallbackCandidates.length > 0
        ? fallbackCandidates
        : bankAll.filter((b) => !historyPrompts.has(b.prompt.toLowerCase().trim()));

    const diff5: Difficulty = Math.max(1, Math.min(5, Math.ceil(difficulty10 / 2))) as Difficulty;
    let base: BaseQuestion;
    let isVariant = false;

    if (candidateTemplates.length > 0) {
      const ranked = this.rank(candidateTemplates, diff5);
      base = ranked[0];
    } else {
      isVariant = true;
      const seedBase = bankAll[0] ?? buildFallback(this.taxonomy.assert(targetSkill))[0];
      const variantSuffix = `(Scenario variation v${questionHistory.length + 1}: focus on resiliency, failover, and extreme scale.)`;
      base = {
        ...seedBase,
        subtopic: `${seedBase.subtopic} (variant)`,
        prompt: `${seedBase.prompt}\n\n${variantSuffix}`,
      };
    }

    this.used.add(this.keyOf(base, targetSkill));

    // 5. Personalize prompt using candidate experience/claims
    let finalPrompt = base.prompt;
    const experienceMatch = candidateProfile.experience.find(
      (e) =>
        e.bullets.some((b) => b.toLowerCase().includes(targetSkill!.toLowerCase())) ||
        e.role.toLowerCase().includes(targetSkill!.toLowerCase()),
    );
    const claimMatch = candidateProfile.claims.find((c) => c.skillIds.includes(targetSkill!));

    if (!isVariant && experienceMatch) {
      finalPrompt = `On your resume, you listed experience as ${experienceMatch.role} at ${experienceMatch.company || 'your previous company'}. ${base.prompt}`;
    } else if (!isVariant && claimMatch) {
      finalPrompt = `Based on your resume claim ("${claimMatch.text.slice(0, 80)}..."), ${base.prompt}`;
    }

    if (difficulty10 >= 8 && !finalPrompt.includes('Level-up')) {
      finalPrompt = `${finalPrompt}\n\n(Level-up: strengthen your answer with concrete trade-offs, edge cases, failure modes, and considerations at scale.)`;
    } else if (difficulty10 <= 3 && !finalPrompt.includes('Simplify')) {
      finalPrompt = `${finalPrompt}\n\n(Simplify: focus on the fundamentals and keep it concise; a high-level answer is fine.)`;
    }

    if (historyPrompts.has(finalPrompt.toLowerCase().trim())) {
      finalPrompt = `${finalPrompt} [Variant v${questionHistory.length + 1}]`;
    }

    const topicName = this.taxonomy.get(targetSkill)?.label ?? targetSkill;
    const expectedPoints =
      base.hints && base.hints.length > 0
        ? base.hints
        : [
            `Demonstrate conceptual correctness for ${topicName}`,
            `Address practical trade-offs and edge cases`,
            `Provide structured communication and concrete evidence`,
          ];

    return {
      question: finalPrompt,
      topic: topicName,
      subtopic: base.subtopic,
      difficulty: difficulty10,
      question_type: base.type,
      target_skill: targetSkill,
      expected_answer_points: expectedPoints,
    };
  }

  /**
   * Generate an interview question asynchronously via injected AIProvider if available,
   * falling back reliably to deterministic question generation.
   */
  async generateQuestionAsync(input: GenerateQuestionServiceInput): Promise<GeneratedQuestionJSON> {
    if (this.provider && typeof (this.provider as AIProvider).generate === 'function') {
      try {
        const targetSkill = this.selectInScopeSkill(
          new Set(
            ('roleRequirement' in input.roleRequirements && input.roleRequirements.roleRequirement?.skills
              ? input.roleRequirements.roleRequirement.skills
              : 'skills' in input.roleRequirements && Array.isArray(input.roleRequirements.skills)
              ? input.roleRequirements.skills
              : []
            ).map((s: any) => s.skillId),
          ),
          [],
          input.rollingSkillState ?? [],
          input.questionHistory ?? [],
        );
        const diffHint = input.targetDifficulty ?? 6;
        const prompt =
          `You are an expert technical interviewer. Generate a structured interview question strictly as JSON with keys:\n` +
          `question, topic, subtopic, difficulty (1-10), question_type, target_skill, expected_answer_points.\n` +
          `- Target Skill: ${targetSkill}\n` +
          `- Target Difficulty: ${diffHint}\n` +
          `- Role: ${'title' in input.roleRequirements ? (input.roleRequirements as any).title : 'Senior Backend Engineer'}\n` +
          `- Candidate Claims/Experience: ${input.candidateProfile.claims.slice(0, 3).map((c) => c.text).join('; ') || 'Backend engineering'}\n` +
          `Never wrap with extra prose. Emit only valid JSON.`;
        const raw = await (this.provider as AIProvider).generate(prompt, { json: true });
        const parsed = parseJsonData(raw) as Partial<GeneratedQuestionJSON> | null;
        if (parsed && typeof parsed.question === 'string' && parsed.question.length > 5) {
          const diff = Number(parsed.difficulty);
          const difficulty = isNaN(diff) ? diffHint : Math.max(1, Math.min(10, Math.round(diff)));
          const topic = typeof parsed.topic === 'string' ? parsed.topic : (this.taxonomy.get(targetSkill)?.label ?? targetSkill);
          const subtopic = typeof parsed.subtopic === 'string' ? parsed.subtopic : 'Core Principles';
          const qType = typeof parsed.question_type === 'string' ? parsed.question_type : 'conceptual';
          const points =
            Array.isArray(parsed.expected_answer_points) && parsed.expected_answer_points.length > 0
              ? parsed.expected_answer_points.map(String)
              : [
                  `Explain core mechanisms and principles of ${topic}`,
                  `Address practical concurrency, performance, and failure modes`,
                  `Provide clear reasoning and production trade-offs`,
                ];

          return {
            question: parsed.question,
            topic,
            subtopic,
            difficulty,
            question_type: qType,
            target_skill: typeof parsed.target_skill === 'string' ? parsed.target_skill : targetSkill,
            expected_answer_points: points,
          };
        }
      } catch {
        // Fall back gracefully to deterministic generation
      }
    }
    return this.generateQuestion(input);
  }

  private selectInScopeSkill(
    allowedSkills: Set<string>,
    rawSkills: readonly any[],
    rollingSkillState: readonly SkillState[],
    questionHistory: readonly any[],
  ): string {
    const list = [...allowedSkills];
    if (list.length === 1) return list[0];

    let lastSkill: string | undefined;
    if (questionHistory.length > 0) {
      const last = questionHistory[questionHistory.length - 1];
      if (typeof last === 'object' && last !== null) {
        if ('question' in last && last.question) lastSkill = last.question.skillId;
        else if ('target_skill' in last) lastSkill = (last as any).target_skill;
        else if ('skillId' in last) lastSkill = (last as any).skillId;
      }
    }

    const pool = list.filter((s) => s !== lastSkill || list.length === 1);
    const candidates = pool.length > 0 ? pool : list;

    let bestSkill = candidates[0];
    let bestScore = -Infinity;

    for (const skillId of candidates) {
      const state = rollingSkillState.find((s) => s.skillId === skillId);
      const req = rawSkills.find((r: any) => r.skillId === skillId);
      const weight = req?.weight ?? 1.0;

      const infoGain = state ? (1 - state.confidence) * weight : 2.0 * weight;
      if (infoGain > bestScore) {
        bestScore = infoGain;
        bestSkill = skillId;
      }
    }

    return bestSkill;
  }

  /**
   * Serialize output to strict JSON string as requested by the contract.
   */
  toJSON(output: GeneratedQuestionJSON): string {
    return JSON.stringify(output, null, 2);
  }

  private keyOf(b: BaseQuestion, skillId: string): string {
    return `${skillId}|${b.type}|${b.subtopic}`;
  }

  private rank(candidates: readonly BaseQuestion[], target: Difficulty, preferTypes?: readonly QuestionType[]): BaseQuestion[] {
    const typePriority = (t: QuestionType): number => {
      const idx = preferTypes?.indexOf(t) ?? -1;
      return idx >= 0 ? idx : preferTypes?.length ?? 0;
    };
    return [...candidates].sort((a, b) => {
      const diffA = Math.abs(a.difficulty - target);
      const diffB = Math.abs(b.difficulty - target);
      if (diffA !== diffB) return diffA - diffB;
      return typePriority(a.type) - typePriority(b.type);
    });
  }

  private materialize(base: BaseQuestion, skillId: string, difficulty: Difficulty, seq: number): Question {
    return this.materializeWithPrompt(base, skillId, difficulty, seq, this.adaptedPrompt(base, difficulty));
  }

  private adaptedPrompt(base: BaseQuestion, target: Difficulty): string {
    if (target === base.difficulty) return base.prompt;
    if (target > base.difficulty) {
      return `${base.prompt}\n\n(Level-up: strengthen your answer with concrete trade-offs, edge cases, failure modes, and considerations at scale.)`;
    }
    return `${base.prompt}\n\n(Simplify: focus on the fundamentals and keep it concise; a high-level answer is fine.)`;
  }

  private materializeWithPrompt(base: BaseQuestion, skillId: string, difficulty: Difficulty, seq: number, prompt: string): Question {
    const id = this.idFor(base, skillId, seq);
    let result: Question = {
      id,
      skillId,
      subtopic: base.subtopic,
      type: base.type,
      difficulty,
      prompt,
      rubricHints: base.hints,
      timeBudgetSec: TIME_BY_TYPE[base.type](difficulty),
    };

    if (base.params || base.choices) {
      result = {
        ...result,
        ...(base.params ? { params: base.params } : {}),
        ...(base.choices
          ? { choices: base.choices, correctChoiceIndex: base.correctChoiceIndex }
          : {}),
      };
    }

    if (base.type === 'code') {
      const codeQuestion: CodeQuestion = {
        ...result,
        type: 'code',
        starterCode: base.starterCode ?? '// your code here',
        language: base.language ?? 'javascript',
        numTestCases: base.testCases?.length ?? 0,
        testCases: base.testCases,
      };
      return codeQuestion;
    }
    return result;
  }

  private idFor(base: BaseQuestion, skillId: string, seq: number): string {
    const subtle = base.subtopic.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
    return `q-${skillId}-${subtle}-${seq}`;
  }

}

/** Generic fallback so every known skill can always be interviewed. */
function buildFallback(def: SkillDef): BaseQuestion[] {
  return [
    {
      subtopic: 'core fundamentals',
      type: 'conceptual',
      difficulty: 3,
      prompt: `Explain how you approach ${def.label} in a real project. Cover the key concepts, the pitfalls you have hit, and one concrete trade-off you had to make.`,
      hints: ['core concept definitions', 'pitfalls from practice', 'trade-off reasoning'],
    },
    {
      subtopic: 'experience evidence',
      type: 'behavioral',
      difficulty: 3,
      prompt: `Describe a project where ${def.label} mattered most. Use STAR and be specific about your role, decisions, and measurable outcomes.`,
      hints: ['STAR structure', 'personal role clarity', 'measurable outcome'],
    },
    {
      subtopic: 'technical trade-offs',
      type: 'situational',
      difficulty: 3,
      prompt: `A teammate proposes an approach for ${def.label} that works in demos but concerns you at production scale. How do you evaluate it, what trade-offs do you surface, and how do you decide?`,
      hints: ['evaluation criteria', 'trade-off communication', 'decision ownership'],
    },
    {
      subtopic: 'design and failure analysis',
      type: 'system_design',
      difficulty: 3,
      prompt: `Design a small production workflow where ${def.label} is essential. Define requirements, outline the components and their interactions, then explain one failure scenario and how you would recover.`,
      hints: ['explicit requirements', 'component interactions', 'failure recovery'],
    },
  ];
}

function unresolvedRubricPoints(rationale: string): string {
  const match = rationale.match(/Unaddressed rubric cues:\s*(.*?)(?:\s+Skill:|\s+Question:|$)/i);
  return match?.[1]?.trim() ?? '';
}
