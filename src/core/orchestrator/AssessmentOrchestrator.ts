import type {
  AssessmentReport,
  CandidateAnswer,
  LevelBand,
  Question,
  RoleRequirement,
  SessionConfig,
  SkillState,
} from '../types.js';
import type { LLMProvider } from '../provider/LLMProvider.js';
import { InterviewSession } from '../session/InterviewSession.js';
import { GapAnalyzer } from '../improve/GapAnalyzer.js';
import { RoadmapPlanner } from '../improve/RoadmapPlanner.js';
import { CandidateIntelligenceModelBuilder } from '../intelligence/CandidateIntelligenceModel.js';
import { InterviewPlanner } from '../planner/InterviewPlanner.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { norm, round } from '../utils/norm.js';

export interface OrchestratorDeps {
  readonly provider: LLMProvider;
  readonly seed?: number;
}

/** Callback the host app supplies to produce candidate answers (UI, voice, CLI, simulation). */
export type Answerer = (question: Question, session: InterviewSession) => Promise<CandidateAnswer>;

/**
 * Runs the full intelligence loop following the coordinated flow:
 *
 *   CANDIDATE INPUT
 *     ↓
 *   RESUME ANALYZER → CANDIDATE PROFILE
 *     ↓
 *   JOB REQUIREMENT ANALYZER
 *     ↓
 *   INTERVIEW PLANNER → ROUND STRUCTURE
 *     ↓
 *   QUESTION GENERATOR → CANDIDATE ANSWER
 *     ↓
 *   ANSWER EVALUATOR → SKILL STATE UPDATER
 *     ↓
 *   ADAPTIVE ENGINE → NEXT QUESTION
 *     ↓
 *   (REPEAT question generator → answer → evaluator → adapter)
 *     ↓
 *   SCORING → KNOWLEDGE GAP ENGINE
 *     ↓
 *   FEEDBACK GENERATOR → ROADMAP GENERATOR
 *
 * `run()` is the convenience path; `buildSession()` exposes the live session
 * for interactive flows where answers arrive over time.
 *
 * Responsibilities are separated: the orchestrator coordinates modules but
 * does not contain their logic — each module keeps its own class/responsibility.
 *
 * The SessionConfig is the orchestration entry point: it already carries a
 * CandidateProfile (from the Resume Analyzer) and a RoleRequirement (from the
 * Job Requirement Analyzer). The orchestrator wires these modules together
 * without re-implementing their internal logic.
 */
export class AssessmentOrchestrator {
  private readonly jobPlanner: InterviewPlanner;
  private readonly gapAnalyzer: GapAnalyzer;
  private readonly roadmapPlanner: RoadmapPlanner;
  private readonly intelligenceBuilder: CandidateIntelligenceModelBuilder;

  constructor(private readonly deps: OrchestratorDeps) {
    this.jobPlanner = new InterviewPlanner();
    this.gapAnalyzer = new GapAnalyzer();
    this.roadmapPlanner = new RoadmapPlanner();
    this.intelligenceBuilder = new CandidateIntelligenceModelBuilder();
  }

  /**
   * Build a live interview session from a config.
   * The session manages skill state rolling updates, evidence tracking,
   * and question serving — the orchestrator coordinates the surrounding flow.
   */
  buildSession(config: SessionConfig): InterviewSession {
    const interviewPlan = config.interviewPlan ?? this.jobPlanner.plan({ profile: config.profile, role: config.role }, {
      requiredRounds: ['hr_intro', 'technical', 'logic_problem_solving', 'behavioral_out_of_box'].slice(0, config.numRounds),
      questionsPerRound: config.roundConfig.questionBudget,
    });
    return new InterviewSession({ ...config, interviewPlan }, {
      provider: this.deps.provider,
      seed: this.deps.seed,
    });
  }

  /**
   * Full run: profile → plan → interview loop → post-interview report.
   * Each phase delegates to its own module; the orchestrator wires them
   * together without re-implementing their logic.
   *
   * The config carries a pre-built CandidateProfile (from Resume Analyzer)
   * and a RoleRequirement (from Job Requirement Analyzer). If either is
   * missing, the orchestrator falls back to deterministic defaults so the
   * loop can still run for testing/demo purposes.
   */
  async run(config: SessionConfig, answerer: Answerer): Promise<AssessmentReport> {
    // ---- 1. UNDERSTAND: Profile is already built by Resume Analyzer ----
    // SessionConfig carries profile from the resume analyzer. Use it as-is.
    let profile = config.profile;
    if (!profile) {
      // Fallback: if no profile, create a minimal one so the loop can run.
      // In production, the host app always provides a profile via the Resume Analyzer.
      profile = {
        candidateName: 'Candidate',
        skills: [],
        experienceYears: 0,
        levelBand: 'mid',
        education: [],
        experience: [],
        projects: [],
        certifications: [],
        technologies: [],
        responsibilities: [],
        claims: [],
        notes: [],
        candidateLevelHypothesis: {
          band: 'mid',
          basis: 'No resume provided; estimate will be neutral prior.',
          status: 'hypothesis',
          evidenceOverride: false,
        },
        potentialInterviewTopics: [],
        evidenceSourceReferences: [],
      };
    }
    config = { ...config, profile };

    // ---- 2. JOB REQUIREMENT: RoleRequirement is already in SessionConfig ----
    // SessionConfig carries role: RoleRequirement from the job requirement analyzer.
    const role: RoleRequirement = config.role ?? {
      title: 'Target Role',
      teamSizes: undefined,
      stackNotes: undefined,
      skills: [],
      softRequirements: [],
    };

    // ---- 3. INTERVIEW PLANNER → Round Structure ----
    const plannerInput = {
      profile: profile as import('../types.js').CandidateProfile,
      role,
      states: [], // populated as interview progresses
    } as import('../planner/InterviewPlanner.js').PlannerInput;

    // questionsPerRound comes from roundConfig; targetDifficulty from planner options
    const questionsPerRound = config.roundConfig.questionBudget ?? 4;
    // target difficulty defaults to 3 (mid); the planner may override via options
    const targetDifficulty = 3;

    const interviewPlan = config.interviewPlan ?? this.jobPlanner.plan(plannerInput, {
      requiredRounds: ['hr_intro', 'technical', 'logic_problem_solving', 'behavioral_out_of_box'].slice(0, config.numRounds),
      questionsPerRound,
      targetDifficulty,
    });

    // ---- 4. INTERVIEW LOOP: Question → Answer → Evaluation → Adaptation ----
    const session = this.buildSession({ ...config, role, interviewPlan });
    const started = Date.now();

    for (let round = 1; round <= config.numRounds; round++) {
      if (round > 1) session.beginRound();

      const roundConfig = interviewPlan.rounds[round - 1];
      if (!roundConfig) break;

      for (let q = 0; q < roundConfig.questionBudget; q++) {
        const question = session.nextQuestion();
        const answer = await answerer(question, session);
        const stamped: CandidateAnswer = { ...answer, timestamp: started + 60_000 * session.asked.length };
        await session.submitAnswer(question, stamped);
      }
    }

    // ---- 5. SCORING & KNOWLEDGE GAP ENGINE ----
    const states = session.skillStates;
    const evidence = session.evidenceTracker.resolve();
    // Gap analysis needs evidence tagged by skill. The claim ledger is resume-claim
    // scoped, so use the evaluated interview probes here, including skills not
    // mentioned on the resume.
    const gaps = this.gapAnalyzer.analyze(role as RoleRequirement, states, {
      records: session.asked.flatMap((item) => item.evaluation
        ? [{
            id: item.question.id,
            skillId: item.question.skillId,
            supportStrength: item.evaluation.grade / 10,
          } as Record<string, unknown>]
        : []),
    } as { records: readonly Record<string, unknown>[] });

    // ---- 6. ROADMAP GENERATOR ----
    const roadmap = this.roadmapPlanner.plan(gaps, role as RoleRequirement);

    // ---- 7. SCORING ----
    const overallScore = weightedRequirementMean(role as RoleRequirement, states);

    // ---- 8. CANDIDATE INTELLIGENCE MODEL ----
    const questionsMap = new Map(session.asked.map((a) => [a.question.id, a.question]));
    const candidateIntelligence = this.intelligenceBuilder.build({
      profile,
      role,
      states: states ?? [],
      evidence: evidence ?? { claims: [], records: [], counts: { validated: 0, refuted: 0, partial: 0, unverified: 0 } },
      gaps: gaps ?? [],
      roadmap: roadmap ?? [],
      questions: questionsMap,
    });

    return {
      roleTitle: role.title,
      candidatePriority: round(norm.clamp01(overallScore / 10), 2),
      overallScore: round(overallScore, 1),
      skillSummary: this.buildSkillSummary(role as RoleRequirement, states),
      claimsResolved: evidence.claims,
      gaps,
      roadmap,
      roundsPerformed: config.numRounds,
      questionsAsked: session.asked.length,
      candidateIntelligence,
    };
  }



  private buildSkillSummary(role: RoleRequirement, states: readonly SkillState[]): AssessmentReport['skillSummary'] {
    return role.skills.map((req) => {
      const state = states.find((s) => s.skillId === req.skillId);
      return {
        skillId: req.skillId,
        estimate: round(state?.estimate ?? 5, 1),
        confidence: round(state?.confidence ?? 0, 2),
        verdict: verdictFor(state, req.skillId, req.requiredLevel),
      };
    });
  }
}

type Verdict = AssessmentReport['skillSummary'][number]['verdict'];

function verdictFor(state: SkillState | undefined, skillId: string, requiredLevel: LevelBand): Verdict {
  if (!state || state.samples === 0) return 'unverified';
  const window = defaultTaxonomy.assert(skillId).competencyWindow[requiredLevel];
  const midpoint = (window.min + window.max) / 2;
  if (state.estimate >= midpoint) return 'meets';
  if (state.estimate < window.min) return 'gap';
  return 'partially_meets';
}

/** Overall score = requirement-weighted mean of rolling estimates. */
function weightedRequirementMean(role: RoleRequirement, states: readonly SkillState[]): number {
  const totalWeight = role.skills.reduce((acc, r) => acc + r.weight, 0);
  if (totalWeight === 0) return 0;
  const acc = role.skills.reduce((sum, r) => {
    const estimate = states.find((s) => s.skillId === r.skillId)?.estimate ?? 0;
    return sum + estimate * r.weight;
  }, 0);
  return acc / totalWeight;
}
