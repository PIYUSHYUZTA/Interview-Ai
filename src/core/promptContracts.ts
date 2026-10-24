/**
 * Versionable prompt contracts for the AI Mock Interview Platform.
 * Each contract is immutable and includes a `version` field so the application
 * can identify which prompt version produced any given AI result.
 *
 * Prompt versioning format: "vYYYYMMDD-N" (date-based) or "vMAJOR.MINOR.PATCH"
 * To bump: update the `version` string and ensure backward compatibility where possible.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** Input to every prompt — candidate profile + role requirement context. */
export interface PromptInput {
  /** Candidate's name (for role-play grounding). */
  candidateName?: string;
  /** Candidate's profile extracted from resume. */
  candidateProfile?: {
    readonly skills: readonly { readonly skillId: string; readonly claim: string }[];
    readonly experienceYears: number;
    readonly levelBand: 'junior' | 'mid' | 'senior';
    readonly technologies: readonly string[];
  };
  /** Job description or role requirements. */
  roleRequirement?: {
    readonly title: string;
    readonly requiredSkills: readonly { readonly skillId: string; readonly weight: number; readonly requiredLevel: 'junior' | 'mid' | 'senior' }[];
    readonly softRequirements: readonly string[];
  };
}

/** Output metadata attached to every AI result for provenance. */
export interface PromptOutputMeta {
  /** Prompt contract version that produced this result. */
  readonly promptVersion: string;
  /** The contract ID (e.g. 'resume-analyzer') for registry lookup. */
  readonly contractId: string;
  /** Timestamp of when the prompt was generated (ISO string). */
  readonly generatedAt: string;
}

/**
 * Base contract structure shared by all prompt contracts.
 * Subtypes add domain‑specific fields while guaranteeing versionability.
 */
export interface PromptContractBase {
  readonly version: string;
  readonly role: string;
  readonly objective: string;
  readonly inputContract: object;
  readonly rules: readonly string[];
  readonly constraints: {
    /** Maximum tokens the LLM should generate. */
    maxTokens?: number;
    /** Optional format constraints (json, text, etc). */
    outputFormat?: 'json' | 'text' | 'structured';
  };
  readonly outputSchema: object;
  readonly examples?: readonly any[];
  readonly antiHallucination: readonly string[];
}

// ---------------------------------------------------------------------------
// 1. Resume Analyzer
// ---------------------------------------------------------------------------

/**
 * Analyzes a candidate's resume against a target role.
 * Produces a structured skill map, claim extraction, and preliminary gap list.
 */
export interface ResumeAnalyzerContract extends PromptContractBase {
  readonly contractId: 'resume-analyzer';
  readonly version: 'v1.0.0';
  readonly role: 'Resume Analyzer';
  readonly objective: 'Extract candidate skills, experiences, and claims from a resume; map them to role requirements; surface unverified claims and initial gap areas.';
  readonly inputContract: PromptInput & {
    readonly resumeText: string;
    readonly targetRole?: string;
  };
  readonly rules: readonly string[];
  readonly constraints: {
    maxTokens: 2048;
    outputFormat: 'structured';
  };
  readonly outputSchema: {
    readonly candidateName?: string;
    readonly skills: readonly {
      readonly skillId: string;
      readonly claim: string;
      readonly confidence: number; // 0..1, based on resume language cues
    }[];
    readonly claims: readonly {
      readonly id: string;
      readonly text: string;
      readonly source: 'resume' | 'self_reported' | 'inferred';
      readonly verdict: 'validated' | 'refuted' | 'partial' | 'unverified';
    }[];
    readonly gapAreas: readonly string[];
    readonly levelBandEstimate: 'junior' | 'mid' | 'senior';
    readonly technologyStack: readonly string[];
  };
  readonly examples: readonly [
    {
      resumeText: string;
      targetRole: string;
      output: ResumeAnalyzerContract['outputSchema'];
    }
  ];
  readonly antiHallucination: readonly string[];
}

// ---------------------------------------------------------------------------
// 2. Job Requirement Analyzer
// ---------------------------------------------------------------------------

/**
 * Analyzes a job description / role requirement and extracts structured requirements,
 * required skills, nice-to-haves, and evaluation criteria.
 */
export interface JobRequirementAnalyzerContract extends PromptContractBase {
  readonly contractId: 'job-requirement-analyzer';
  readonly version: 'v1.0.0';
  readonly role: 'Job Requirement Analyzer';
  readonly objective: 'Parse a job description or role requirement document; identify required and preferred skills, experience level, soft requirements, and domain knowledge expectations.';
  readonly inputContract: PromptInput & {
    readonly jobDescription?: string;
    readonly roleSpec?: string;
  };
  readonly rules: readonly string[];
  readonly constraints: {
    maxTokens: 2048;
    outputFormat: 'structured';
  };
  readonly outputSchema: {
    readonly title: string;
    readonly expectedLevel: 'junior' | 'mid' | 'senior';
    readonly requiredSkills: readonly {
      readonly skillId: string;
      readonly weight: number; // 0..1
      readonly level: 'junior' | 'mid' | 'senior';
    }[];
    readonly preferredSkills: readonly {
      readonly skillId: string;
      readonly weight: number;
      readonly level: 'junior' | 'mid' | 'senior';
    }[];
    readonly softRequirements: readonly string[];
    readonly domainKnowledge: readonly string[];
    readonly problemSolvingExpectations: readonly string[];
    readonly companyExpectations: readonly string[];
  };
  readonly examples: readonly [
    {
      jobDescription: string;
      output: JobRequirementAnalyzerContract['outputSchema'];
    }
  ];
  readonly antiHallucination: readonly string[];
}

// ---------------------------------------------------------------------------
// 3. Interview Planner
// ---------------------------------------------------------------------------

/**
 * Designs an interview plan (rounds, question budgets, target skills) given a
 * candidate profile and role requirements.
 */
export interface InterviewPlannerContract extends PromptContractBase {
  readonly contractId: 'interview-planner';
  readonly version: 'v1.0.0';
  readonly role: 'Interview Planner';
  readonly objective: 'Given a candidate profile and role requirements, produce a structured interview plan with rounds, question budgets, target skill coverage, and evaluation criteria per round.';
  readonly inputContract: PromptInput & {
    readonly numRounds?: number;
    readonly targetDifficulty?: '1' | '2' | '3' | '4' | '5';
    readonly customTemplates?: readonly any[];
  };
  readonly rules: readonly string[];
  readonly constraints: {
    maxTokens: 4096;
    outputFormat: 'structured';
  };
  readonly outputSchema: {
    readonly roleTitle: string;
    readonly candidateName: string;
    readonly rounds: readonly {
      readonly roundNumber: number;
      readonly type: string;
      readonly name: string;
      readonly description: string;
      readonly targetSkills: readonly string[];
      readonly difficultyRange: { min: number; max: number };
      readonly questionTypes: readonly string[];
      readonly evaluationCriteria: readonly string[];
    }[];
    readonly totalQuestionBudget: number;
    readonly summary: string;
  };
  readonly examples: readonly [
    {
      candidateProfile: PromptInput['candidateProfile'];
      roleRequirement: PromptInput['roleRequirement'];
      output: InterviewPlannerContract['outputSchema'];
    }
  ];
  readonly antiHallucination: readonly string[];
}

// ---------------------------------------------------------------------------
// 4. Question Generator
// ---------------------------------------------------------------------------

/**
 * Generates a structured interview question for a given skill, difficulty, and
 * candidate context (resume claims, prior answers).
 */
export interface QuestionGeneratorContract extends PromptContractBase {
  readonly contractId: 'question-generator';
  readonly version: 'v1.0.0';
  readonly role: 'Question Generator';
  readonly objective: 'Given a target skill, difficulty level, and candidate context, generate a concrete, askable interview question with rubric hints and optional parameterization.';
  readonly inputContract: PromptInput & {
    readonly targetSkill: string;
    readonly difficulty: '1' | '2' | '3' | '4' | '5';
    readonly questionType?: 'conceptual' | 'code' | 'system_design' | 'mcq' | 'situational' | 'behavioral';
    readonly recentEvaluation?: {
      readonly grade: number;
      readonly criteria: {
        readonly knowledgeDepth: number;
        readonly recallPrecision: number;
        readonly reasoning: number;
        readonly appliedEvidence: number;
        readonly communication: number;
      };
    };
    readonly subtopic?: string;
  };
  readonly rules: readonly string[];
  readonly constraints: {
    maxTokens: 2048;
    outputFormat: 'structured';
  };
  readonly outputSchema: {
    readonly question: string;
    readonly subtopic: string;
    readonly type: string;
    readonly difficulty: number;
    readonly rubricHints: readonly string[];
    readonly timeBudgetSec?: number;
    readonly params?: Record<string, string | number>;
    readonly choices?: readonly string[];
    readonly correctChoiceIndex?: number;
    readonly starterCode?: string;
    readonly language?: string;
  };
  readonly examples: readonly [
    {
      targetSkill: string;
      difficulty: number;
      questionType?: string;
      output: QuestionGeneratorContract['outputSchema'];
    }
  ];
  readonly antiHallucination: readonly string[];
}

// ---------------------------------------------------------------------------
// 5. Answer Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates a candidate's answer against a question rubric and produces scored
 * criteria plus a holistic grade.
 */
export interface AnswerEvaluatorContract extends PromptContractBase {
  readonly contractId: 'answer-evaluator';
  readonly version: 'v1.0.0';
  readonly role: 'Answer Evaluator';
  readonly objective: 'Given a question and a candidate answer, score the 5 rubric criteria (knowledgeDepth, recallPrecision, reasoning, appliedEvidence, communication) and produce a holistic grade (0..10) with rationale.';
  readonly inputContract: PromptInput & {
    readonly question: {
      readonly id: string;
      readonly prompt: string;
      readonly rubricHints: readonly string[];
      readonly type: string;
    };
    readonly answer: string;
  };
  readonly rules: readonly string[];
  readonly constraints: {
    maxTokens: 2048;
    outputFormat: 'structured';
  };
  readonly outputSchema: {
    readonly questionId: string;
    readonly grade: number; // 0..10
    readonly criteria: {
      readonly knowledgeDepth: number;
      readonly recallPrecision: number;
      readonly reasoning: number;
      readonly appliedEvidence: number;
      readonly communication: number;
    };
    readonly rubricCompliance: number; // 0..1
    readonly rationale: string;
  };
  readonly examples: readonly [
    {
      question: { id: string; prompt: string; rubricHints: string[] };
      answer: string;
      output: AnswerEvaluatorContract['outputSchema'];
    }
  ];
  readonly antiHallucination: readonly string[];
}

// ---------------------------------------------------------------------------
// 6. Adaptive Engine
// ---------------------------------------------------------------------------

/**
 * Adaptive question selection engine: given current skill state, recent evaluations,
 * and role requirements, select the next best question (subtopic, difficulty, type).
 */
export interface AdaptiveEngineContract extends PromptContractBase {
  readonly contractId: 'adaptive-engine';
  readonly version: 'v1.0.0';
  readonly role: 'Adaptive Engine';
  readonly objective: 'Given the candidate\'s rolling skill state, recent evaluation results, and open gaps, select the next optimal question parameters (skill, subtopic, difficulty, type) to maximize evidence gathering per interview minute.';
  readonly inputContract: PromptInput & {
    readonly currentRound: number;
    readonly rollingSkillStates: readonly {
      readonly skillId: string;
      readonly estimate: number;
      readonly confidence: number;
    }[];
    readonly recentEvaluations: readonly {
      readonly questionId: string;
      readonly grade: number;
    }[];
    readonly availableSkillIds: readonly string[];
    readonly gapPriorities?: readonly {
      readonly skillId: string;
      readonly priority: number;
    }[];
  };
  readonly rules: readonly string[];
  readonly constraints: {
    maxTokens: 2048;
    outputFormat: 'structured';
  };
  readonly outputSchema: {
    readonly selectedSkillId: string;
    readonly subtopic: string;
    readonly difficulty: number;
    readonly questionType: string;
    readonly rationale: string; // why this question was chosen
    readonly estimatedGapSeverity: number; // 0..1
  };
  readonly examples: readonly [
    {
      currentRound: number;
      rollingSkillStates: any[];
      recentEvaluations: any[];
      availableSkillIds: string[];
      output: AdaptiveEngineContract['outputSchema'];
    }
  ];
  readonly antiHallucination: readonly string[];
}

// ---------------------------------------------------------------------------
// 7. Feedback Generator
// ---------------------------------------------------------------------------

/**
 * Generates candidate feedback after an interview or a set of answers: strengths,
// gaps, recommended study path, and next-interview guidance.
 */
export interface FeedbackGeneratorContract extends PromptContractBase {
  readonly contractId: 'feedback-generator';
  readonly version: 'v1.0.0';
  readonly role: 'Feedback Generator';
  readonly objective: 'Produce candidate-friendly feedback that summarizes performance, identifies specific skill gaps with evidence, and suggests actionable next steps for study or the next interview round.';
  readonly inputContract: PromptInput & {
    readonly interviewSummary: {
      readonly roundsPerformed: number;
      readonly totalQuestionsAsked: number;
      readonly skillEstimates: readonly {
        readonly skillId: string;
        readonly estimate: number;
        readonly confidence: number;
        readonly verdict: 'meets' | 'partially_meets' | 'gap' | 'unverified';
      }[];
      readonly highPriorityGaps: readonly {
        readonly skillId: string;
        readonly reason: string;
      }[];
    };
    readonly candidateAnswers?: readonly {
      readonly questionId: string;
      readonly answer: string;
      readonly evaluation?: {
        readonly grade: number;
        readonly criteria: {
          readonly knowledgeDepth: number;
          readonly recallPrecision: number;
          readonly reasoning: number;
          readonly appliedEvidence: number;
          readonly communication: number;
        };
      };
    }[];
  };
  readonly rules: readonly string[];
  readonly constraints: {
    maxTokens: 4096;
    outputFormat: 'text'; // human-readable narrative
  };
  readonly outputSchema: {
    readonly candidateName: string;
    readonly overallSummary: string;
    readonly strengths: readonly string[];
    readonly skillGaps: readonly {
      readonly skillId: string;
      readonly gapDescription: string;
      readonly evidence: string;
    }[];
    readonly recommendedActions: readonly string[];
    readonly nextRoundFocus: readonly string[];
  };
  readonly examples: readonly [
    {
      interviewSummary: FeedbackGeneratorContract['inputContract']['interviewSummary'];
      candidateAnswers?: FeedbackGeneratorContract['inputContract']['candidateAnswers'];
      output: FeedbackGeneratorContract['outputSchema'];
    }
  ];
  readonly antiHallucination: readonly string[];
}

// ---------------------------------------------------------------------------
// 8. Roadmap Generator
// ---------------------------------------------------------------------------

/**
 * Generates a personalized learning roadmap based on identified gaps, target role,
 * and candidate level band.
 */
export interface RoadmapGeneratorContract extends PromptContractBase {
  readonly contractId: 'roadmap-generator';
  readonly version: 'v1.0.0';
  readonly role: 'Roadmap Generator';
  readonly objective: 'Given identified skill gaps, candidate level band, and target role requirements, produce a structured, prioritized learning roadmap with actions, resources, and effort estimates (short/medium/long term).';
  readonly inputContract: PromptInput & {
    readonly currentLevelBand: 'junior' | 'mid' | 'senior';
    readonly targetLevelBand: 'junior' | 'mid' | 'senior';
    readonly identifiedGaps: readonly {
      readonly skillId: string;
      readonly gapSeverity: number; // 0..1
      readonly currentEstimate: number;
    }[];
    readonly preferredLearningStyles?: readonly string[];
  };
  readonly rules: readonly string[];
  readonly constraints: {
    maxTokens: 4096;
    outputFormat: 'structured';
  };
  readonly outputSchema: {
    readonly roadmapId: string;
    readonly candidateLevelBand: 'junior' | 'mid' | 'senior';
    readonly targetLevelBand: 'junior' | 'mid' | 'senior';
    readonly phases: readonly {
      readonly name: string;
      readonly priority: number; // 1 = highest
      readonly duration: 'short' | 'medium' | 'long';
      readonly actions: readonly {
        readonly skillId: string;
        readonly action: string;
        readonly rationale: string;
        readonly effort: 'short' | 'medium' | 'long';
      }[];
    }[];
    readonly totalEstimatedWeeks: number;
  };
  readonly examples: readonly [
    {
      currentLevelBand: 'mid';
      targetLevelBand: 'senior';
      identifiedGaps: { skillId: string; gapSeverity: number; currentEstimate: number }[];
      output: RoadmapGeneratorContract['outputSchema'];
    }
  ];
  readonly antiHallucination: readonly string[];
}

// ---------------------------------------------------------------------------
// Union type for all prompt contracts
// ---------------------------------------------------------------------------

export type PromptContract =
  | ResumeAnalyzerContract
  | JobRequirementAnalyzerContract
  | InterviewPlannerContract
  | QuestionGeneratorContract
  | AnswerEvaluatorContract
  | AdaptiveEngineContract
  | FeedbackGeneratorContract
  | RoadmapGeneratorContract;

// ---------------------------------------------------------------------------
// Helper: extract prompt version from any AI result that was generated via a contract
// ---------------------------------------------------------------------------

/**
 * Narrow a result to its prompt contract metadata, if present.
 * This enables the application to track which prompt version produced each AI output.
 */
export function getPromptMeta<T extends PromptContract>(
  result: T & { readonly _promptMeta?: PromptOutputMeta }
): PromptOutputMeta | undefined {
  return result._promptMeta;
}

// Version cheat-sheet (keep in sync with each contract's `version` field):
/*
  v1.0.0 — initial release
  To bump: patch for bug fix, minor for new prompt behavior, major for breaking contract change.
*/