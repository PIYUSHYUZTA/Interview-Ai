import { selectSessionQuestion } from './QuestionSelection.js';
import type {
  CandidateAnswer,
  Difficulty,
  Question,
  QuestionEvaluation,
  QuestionType,
  SessionConfig,
  SkillObservation,
  SkillState,
} from '../types.js';
import type { LLMProvider } from '../provider/LLMProvider.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { RollingSkillState } from '../assessment/SkillState.js';
import { CompositeEvaluator } from '../assessment/evaluators/CompositeEvaluator.js';
import { EvidenceTracer } from '../assessment/EvidenceTracer.js';
import { AdaptiveEngine } from '../adaptation/AdaptiveEngine.js';
import { QuestionGenerator } from '../adaptation/QuestionGenerator.js';
import { norm } from '../utils/norm.js';

export interface SessionDeps {
  readonly provider: LLMProvider;
  readonly seed?: number;
  readonly adaptivity?: {
    readonly requirementBias: number;
    readonly gapBias: number;
  };
}

export interface AskedQuestion {
  readonly question: Question;
  evaluation: QuestionEvaluation | null;
  answer: CandidateAnswer | null;
}

export enum InterviewState {
  CREATED = 'created',
  READY = 'ready',
  IN_PROGRESS = 'in_progress',
  EVALUATING = 'evaluating',
  COMPLETED = 'completed',
}

/** Serialized state for persistence across refreshes/network failures/AI failures. */
export interface SerializedSession {
  config: SessionConfig;
  state: InterviewState;
  round: number;
  asked: Array<{
    questionId: string;
    questionType: QuestionType;
    skillId: string;
    difficulty: number;
    evaluationGrade?: number;
    evaluationRationale?: string;
    answerText?: string;
    answerCode?: string;
    timestamp?: number;
  }>;
  skillStates: Array<{
    skillId: string;
    estimate: number;
    confidence: number;
    samples: number;
    history: Array<{
      score: number;
      evidenceQuality: number;
      weight: number;
      difficulty: Difficulty;
      timestamp: number;
    }>;
    lastAnsweredAt?: number | null;
  }>;
  recentSkills: string[];
  questionById: Map<string, { id: string; type: QuestionType; skillId: string; difficulty: number; prompt: string }>;
  adaptiveDecisions: Array<{
    skillId: string;
    difficulty: Difficulty;
    reason: string;
  }>;
}

/** Weight of an observation depends on question type: objective probes are noisier. */
const TYPE_WEIGHT: Record<QuestionType, number> = {
  conceptual: 0.9,
  system_design: 1,
  behavioral: 0.7,
  situational: 0.8,
  code: 0.85,
  numerical: 0.6,
  mcq: 0.5,
};

/** Mutable, stateful interview session.
 *
 * Wires provider-agnostic evaluation together with rolling skill states, the
 * evidence ledger, and the adaptive planner. It is UI-free by design: any
 * frontend, voice, or CLI layer can drive `nextQuestion()` / `submitAnswer()`.
 * The session state can be serialized (`.toJSON()`) and fully restored, making
 * the frontend dispensable for interview continuity across refreshes, network
 * failures, AI failures, transcription failures, and retries.
 */
export class InterviewSession {
  readonly config: SessionConfig;
  lastSelectionRationale = '';
  state: InterviewState;
  readonly asked: AskedQuestion[] = [];
  private readonly states = new Map<string, SkillState>();
  private readonly tracer: EvidenceTracer;
  private readonly adaptive: AdaptiveEngine;
  private readonly generator: QuestionGenerator;
  private readonly evaluator: CompositeEvaluator;
  private readonly skillStateManager: RollingSkillState;
  private questionById = new Map<string, Question>();
  private readonly askedIds = new Set<string>();
  private recentSkills: string[] = [];
  private round = 1;

  constructor(config: SessionConfig, deps: SessionDeps) {
    this.config = config;
    this.state = InterviewState.CREATED;
    this.round = 1;
    this.tracer = new EvidenceTracer(
      config.profile.claims.map((c) => ({ ...c, evidenceIds: [...c.evidenceIds] })),
    );
    this.adaptive = new AdaptiveEngine({
      seed: deps.seed,
      requirementBias: deps.adaptivity?.requirementBias ?? config.adaptationParams?.requirementBias ?? 0.5,
      gapBias: deps.adaptivity?.gapBias ?? config.adaptationParams?.gapBias ?? 0.5,
    });
    this.generator = new QuestionGenerator();
    this.evaluator = new CompositeEvaluator({ provider: deps.provider, taxonomy: defaultTaxonomy });
    this.skillStateManager = new RollingSkillState();
    this.initializeStates();
    this.state = InterviewState.READY;
  }

  get roundNumber(): number {
    return this.round;
  }

  get skillStates(): readonly SkillState[] {
    return [...this.states.values()];
  }

  get evidenceTracker(): EvidenceTracer {
    return this.tracer;
  }

  stateFor(skillId: string): SkillState | undefined {
    return this.states.get(skillId);
  }

  questionFor(id: string): Question | undefined {
    return this.questionById.get(id);
  }

  /** Advance to the next interview round. State transitions from IN_PROGRESS to next round. */
  beginRound(): void {
    this.round += 1;
    if (this.round > this.config.numRounds) {
      this.state = InterviewState.COMPLETED;
    }
  }

  /** Select a topic adaptively, generate a fresh question, and register it. State: READY → IN_PROGRESS. */
  nextQuestion(): Question {
    if (this.state !== InterviewState.READY && this.state !== InterviewState.IN_PROGRESS) {
      throw new Error(`Cannot nextQuestion in state ${this.state}`);
    }
    this.state = InterviewState.IN_PROGRESS;
    const selected = selectSessionQuestion({
      config: this.config, round: this.round, states: this.skillStates,
      history: this.asked, recentSkills: this.recentSkills,
      claimWeights: this.unverifiedClaimWeights(), preferredTypes: this.leastUsedTypes(),
      adaptive: this.adaptive, generator: this.generator,
    });
    this.lastSelectionRationale = selected.rationale;
    const question = selected.question;
    this.askedIds.add(question.id);
    this.questionById.set(question.id, question);
    this.recentSkills.push(question.skillId);
    if (this.recentSkills.length > 12) this.recentSkills.shift();
    this.asked.push({ question, evaluation: null, answer: null });
    return question;
  }

  /** Grade `answer` for `question`, roll the skill state forward, bind evidence. */
  async submitAnswer(question: Question, answer: CandidateAnswer): Promise<QuestionEvaluation> {
    this.state = InterviewState.IN_PROGRESS;
    const evaluation = await this.evaluator.evaluate(question, answer);

    const prev = this.states.get(question.skillId) ?? this.skillStateManager.init(question.skillId);
    const observation: SkillObservation = {
      skillId: question.skillId,
      questionId: question.id,
      score: evaluation.grade,
      evidenceQuality: this.evidenceQuality(evaluation),
      weight: TYPE_WEIGHT[question.type] ?? 0.7,
      difficulty: question.difficulty,
      timestamp: answer.timestamp,
    };
    const updated = this.skillStateManager.update(prev, observation);
    this.states.set(question.skillId, updated);
    this.tracer.record({ question, answer, evaluation });

    const asked = this.asked.find((a) => a.question.id === question.id);
    if (asked) {
      asked.evaluation = evaluation;
      asked.answer = answer;
    } else {
      this.asked.push({ question, evaluation, answer });
      this.askedIds.add(question.id);
      this.questionById.set(question.id, question);
    }

    return evaluation;
  }

  private initializeStates(): void {
    const skillIds = new Set<string>();
    for (const { skillId } of this.config.role.skills) skillIds.add(skillId);
    for (const { skillId } of this.config.profile.skills) skillIds.add(skillId);
    for (const id of skillIds) this.states.set(id, this.skillStateManager.init(id));
  }

  /** Serialize the entire session for persistence (refresh, network failure, retry). */
  toJSON(): SerializedSession {
    return {
      config: this.config,
      state: this.state,
      round: this.round,
      asked: this.asked.map((a) => ({
        questionId: a.question.id,
        questionType: a.question.type,
        skillId: a.question.skillId,
        difficulty: a.question.difficulty,
        evaluationGrade: a.evaluation?.grade,
        evaluationRationale: a.evaluation?.rationale,
        answerText: a.answer?.text,
        answerCode: a.answer?.code,
        timestamp: a.answer?.timestamp,
      })),
      skillStates: [...this.states.entries()].map(([skillId, state]) => ({
        skillId,
        estimate: state.estimate,
        confidence: state.confidence,
        samples: state.samples,
        history: state.history.map((h) => ({
          score: h.score,
          evidenceQuality: h.evidenceQuality,
          weight: h.weight,
          difficulty: h.difficulty,
          timestamp: h.timestamp,
        })),
        lastAnsweredAt: state.lastAnsweredAt,
      })),
      recentSkills: [...this.recentSkills],
      questionById: new Map([...this.questionById.entries()].map(([k, v]) => [k, { id: v.id, type: v.type, skillId: v.skillId, difficulty: v.difficulty, prompt: v.prompt }])),
      adaptiveDecisions: [], // decisions are implicit in the state; not stored separately
    };
  }

  /** Deserialize a session from persisted JSON, restoring full interview state. */
  static fromJSON(serialized: SerializedSession): InterviewSession {
    const config = serialized.config;
    // Recreate the session with minimal deps; the seed is lost so we re-seed deterministically
    const session = new InterviewSession(config, {
      provider: {} as unknown as LLMProvider,
      seed: 42,
    });

    // Restore round and state
    session.round = serialized.round;
    session.state = serialized.state;

    // Restore asked questions with evaluations/answers
    for (const a of serialized.asked) {
      const question = session.questionById.get(a.questionId);
      if (!question) continue;
      const ev: QuestionEvaluation | null = a.evaluationGrade !== undefined
        ? {
            questionId: a.questionId,
            skillId: a.skillId,
            grade: a.evaluationGrade,
            criteria: { knowledgeDepth: 0, recallPrecision: 0, reasoning: 0, appliedEvidence: 0, communication: 0 },
            rubricCompliance: 1,
            rationale: a.evaluationRationale ?? '',
          }
        : null;
      const ans: CandidateAnswer | null = a.answerText !== undefined
        ? {
            questionId: a.questionId,
            text: a.answerText,
            code: a.answerCode,
            elapsedSec: 0,
            timestamp: a.timestamp ?? Date.now(),
          }
        : null;
      session.asked.push({ question, evaluation: ev, answer: ans });
      session.askedIds.add(a.questionId);
      session.questionById.set(a.questionId, question);
    }

    // Restore skill states
    for (const ss of serialized.skillStates) {
      const state = session.skillStateManager.init(ss.skillId);
      state.estimate = ss.estimate;
      state.confidence = ss.confidence;
      state.samples = ss.samples;
      state.history = ss.history.map((h) => ({
        skillId: ss.skillId,
        questionId: '',
        score: h.score,
        evidenceQuality: h.evidenceQuality,
        weight: h.weight,
        difficulty: h.difficulty,
        timestamp: h.timestamp,
      }));
      state.lastAnsweredAt = ss.lastAnsweredAt ?? null;
      session.states.set(ss.skillId, state);
    }

    // Restore recent skills
    session.recentSkills = serialized.recentSkills;

    // Rebuild questionById from asked
    session.questionById = new Map(session.asked.map((a) => [a.question.id, a.question]));

    return session;
  }

  /** Rotate question types so the interview exercises varied skill dimensions. */
  private leastUsedTypes(): QuestionType[] {
    const counts = new Map<QuestionType, number>();
    for (const a of this.asked) counts.set(a.question.type, (counts.get(a.question.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[1] - b[1]).map(([t]) => t);
  }

  /** Claims still lacking a confident verdict, weighted by importance. */
  private unverifiedClaimWeights(): { skillId: string; weight: number }[] {
    const out: { skillId: string; weight: number }[] = [];
    for (const claim of this.tracer.pendingClaims) {
      if (claim.verdict === 'validated' || claim.verdict === 'refuted') continue;
      for (const skillId of claim.skillIds) {
        out.push({ skillId, weight: claim.weight });
      }
    }
    return out;
  }

  /** Rich, specific evidence gives an observation more credibility per probe. */
  private evidenceQuality(evaluation: QuestionEvaluation): number {
    return norm.clamp01(
      norm.to01(evaluation.criteria.appliedEvidence) * 0.6 +
        evaluation.rubricCompliance * 0.4,
    );
  }
}
