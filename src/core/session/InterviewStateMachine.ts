import { selectSessionQuestion } from './QuestionSelection.js';
import { randomUUID } from 'node:crypto';
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
import type { AIProvider } from '../provider/AIProvider.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { RollingSkillState } from '../assessment/SkillState.js';
import { CompositeEvaluator } from '../assessment/evaluators/CompositeEvaluator.js';
import { EvidenceTracer } from '../assessment/EvidenceTracer.js';
import { AdaptiveEngine } from '../adaptation/AdaptiveEngine.js';
import { QuestionGenerator } from '../adaptation/QuestionGenerator.js';
import { norm, round } from '../utils/norm.js';
import { INTERVIEW_INTEGRITY_POLICY, type IntegrityEventInput, type IntegrityEventRecord, type TabIncident, transitionTabIncident, validateIntegrityEvent } from './IntegrityPolicy.js';

export enum InterviewState {
  CREATED = 'CREATED',
  READY = 'READY',
  IN_PROGRESS = 'IN_PROGRESS',
  EVALUATING = 'EVALUATING',
  COMPLETED = 'COMPLETED',
  TERMINATED_FOR_INTEGRITY = 'TERMINATED_FOR_INTEGRITY',
}

export class InvalidStateTransitionError extends Error {
  constructor(
    readonly fromState: InterviewState,
    readonly attemptedAction: string,
    readonly allowedStates: readonly InterviewState[],
  ) {
    super(
      `Invalid state transition: cannot perform action "${attemptedAction}" while in state "${fromState}". ` +
        `Allowed states: [${allowedStates.join(', ')}].`,
    );
    this.name = 'InvalidStateTransitionError';
  }
}

export interface InterviewTiming {
  sessionStartedAt: number | null;
  roundStartedAt: number | null;
  questionStartedAt: number | null;
  questionTimeLimitSec: number;
}

export interface QuestionHistoryEntry {
  readonly question: Question;
  readonly answer: CandidateAnswer | null;
  readonly evaluation: QuestionEvaluation | null;
  readonly round: number;
  readonly timestamp: number;
}

export interface PublicQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly type: QuestionType;
  readonly skillId: string;
  readonly difficulty: number; // 1-10
  readonly timeLimitSec: number;
}

export interface PublicInterviewState {
  readonly sessionId: string;
  readonly state: InterviewState;
  readonly currentRound: number;
  readonly maxRounds: number;
  readonly currentQuestion: PublicQuestion | null;
  readonly currentDifficulty: number;
  readonly currentTopic: string;
  readonly timing: {
    readonly sessionStartedAt: number | null;
    readonly roundStartedAt: number | null;
    readonly questionStartedAt: number | null;
    readonly elapsedSec: number;
    readonly timeLimitSec: number;
  };
  readonly progress: {
    readonly questionsAnsweredInRound: number;
    readonly questionBudgetInRound: number;
    readonly totalQuestionsAnswered: number;
  };
  readonly questionHistory: readonly {
    readonly questionId: string;
    readonly skillId: string;
    readonly questionType: QuestionType;
    readonly score?: number;
    readonly feedbackSummary?: string;
  }[];
  readonly skillEstimates: readonly {
    readonly skillId: string;
    readonly estimate: number;
    readonly confidence: number;
  }[];
  readonly integrity: {
    readonly warningCount: number;
    readonly maximumWarnings: number;
    readonly terminatedAt: string | null;
    readonly terminationReason: string | null;
  };
}

export interface StateMachineDeps {
  readonly provider: LLMProvider | AIProvider;
  readonly seed?: number;
  readonly adaptivity?: {
    readonly requirementBias?: number;
    readonly gapBias?: number;
  };
}

export interface SerializedStateMachine {
  readonly completedAt?: number | null;
  readonly lastSelectionRationale?: string;
  readonly sessionId: string;
  readonly config: SessionConfig;

  readonly state: InterviewState;
  readonly currentRound: number;
  readonly maxRounds: number;
  readonly currentQuestion: Question | null;
  readonly currentDifficulty: number;
  readonly currentTopic: string;
  readonly timing: InterviewTiming;
  readonly questionHistory: readonly {
    readonly question: Question;
    readonly answer: CandidateAnswer | null;
    readonly evaluation: QuestionEvaluation | null;
    readonly round: number;
    readonly timestamp: number;
  }[];
  readonly skillStates: readonly {
    readonly skillId: string;
    readonly estimate: number;
    readonly confidence: number;
    readonly samples: number;
    readonly history: readonly {
      readonly questionId: string;
      readonly score: number;
      readonly evidenceQuality: number;
      readonly weight: number;
      readonly difficulty: Difficulty;
      readonly timestamp: number;
    }[];
    readonly lastAnsweredAt: number | null;
  }[];
  readonly recentSkills: readonly string[];
  readonly askedIds: readonly string[];
  readonly integrity?: {
    readonly warningCount: number;
    readonly tabIncident?: TabIncident | null;
    readonly lastWarningAt?: number | null;
    readonly events: readonly IntegrityEventRecord[];
    readonly terminatedAt: string | null;
    readonly terminationReason: string | null;
  };
}

const TYPE_WEIGHT: Record<QuestionType, number> = {
  conceptual: 0.9,
  system_design: 1.0,
  behavioral: 0.7,
  situational: 0.8,
  code: 0.85,
  numerical: 0.6,
  mcq: 0.5,
};

const DEFAULT_TIME_LIMITS: Record<QuestionType, number> = {
  conceptual: 120,
  system_design: 300,
  behavioral: 180,
  situational: 180,
  code: 600,
  numerical: 120,
  mcq: 60,
};

/**
 * Section 17 State Machine: Backend Single Source of Truth
 *
 * Enforces:
 *   CREATED → READY → IN_PROGRESS → ROUNDS(1-4) → EVALUATING → COMPLETED
 *
 * Backend owns:
 *   - current round (1-4)
 *   - current question
 *   - question history
 *   - current difficulty (1-10)
 *   - skill states
 *   - timing & elapsed seconds
 *   - page refresh & reconnect survival without leaking expected points
 */
export class InterviewStateMachine {
  private _completedAt: number | null = null;
  get completedAt(): number | null { return this._completedAt; }
  get hasCompletedPlan(): boolean {
    return Array.from({ length: this._maxRounds }, (_, index) => index + 1).every((round) => {
      const budget = this.config.interviewPlan?.rounds.find((planned) => planned.roundNumber === round)?.questionBudget ?? this.config.roundConfig.questionBudget;
      return this._questionHistory.filter((item) => item.round === round && item.evaluation !== null).length >= budget;
    });
  }
  readonly sessionId: string;
  readonly config: SessionConfig;
  lastSelectionRationale = '';
  private _state: InterviewState;
  private _currentRound: number;
  private readonly _maxRounds: number;
  private _currentQuestion: Question | null = null;
  private _currentDifficulty: number = 5;
  private _currentTopic: string = 'backend';
  private readonly _timing: InterviewTiming;
  private readonly _questionHistory: QuestionHistoryEntry[] = [];
  private readonly _states = new Map<string, SkillState>();
  private readonly _tracer: EvidenceTracer;
  private readonly _adaptive: AdaptiveEngine;
  private readonly _generator: QuestionGenerator;
  private readonly _evaluator: CompositeEvaluator;
  private readonly _skillStateManager: RollingSkillState;
  private readonly _askedIds = new Set<string>();
  private _recentSkills: string[] = [];
  private _integrityWarningCount = 0;
  private _integrityEvents: IntegrityEventRecord[] = [];
  private _tabIncident: TabIncident | null = null;
  private _lastIntegrityWarningAt: number | null = null;
  private _terminatedAt: string | null = null;
  private _terminationReason: string | null = null;

  constructor(
    config: SessionConfig,
    deps: StateMachineDeps,
    options?: { sessionId?: string },
  ) {
    this.sessionId = options?.sessionId ?? `session_${randomUUID()}`;
    this.config = config;
    this._state = InterviewState.CREATED;
    this._currentRound = 1;
    this._maxRounds = Math.min(4, Math.max(1, config.numRounds ?? 2));

    this._timing = {
      sessionStartedAt: null,
      roundStartedAt: null,
      questionStartedAt: null,
      questionTimeLimitSec: 120,
    };

    this._tracer = new EvidenceTracer(
      config.profile.claims.map((c) => ({ ...c, evidenceIds: [...c.evidenceIds] })),
    );

    this._adaptive = new AdaptiveEngine({
      seed: deps.seed,
      requirementBias: deps.adaptivity?.requirementBias ?? config.adaptationParams?.requirementBias ?? 0.5,
      gapBias: deps.adaptivity?.gapBias ?? config.adaptationParams?.gapBias ?? 0.5,
    });

    this._generator = new QuestionGenerator();
    this._evaluator = new CompositeEvaluator({
      provider: deps.provider as LLMProvider,
      taxonomy: defaultTaxonomy,
    });
    this._skillStateManager = new RollingSkillState();

    this.initializeStates();
    this._currentTopic = config.role.skills[0]?.skillId ?? 'backend';
    this._currentDifficulty = 5;
  }

  // ---------------------------------------------------------------------------
  // State Machine Getters
  // ---------------------------------------------------------------------------

  get state(): InterviewState {
    return this._state;
  }

  get currentRound(): number {
    return this._currentRound;
  }

  get maxRounds(): number {
    return this._maxRounds;
  }

  get currentQuestion(): Question | null {
    return this._currentQuestion;
  }

  get currentDifficulty(): number {
    return this._currentDifficulty;
  }

  get currentTopic(): string {
    return this._currentTopic;
  }

  get timing(): Readonly<InterviewTiming> {
    return this._timing;
  }

  get questionHistory(): readonly QuestionHistoryEntry[] {
    return this._questionHistory;
  }

  get integrityEvents(): readonly IntegrityEventRecord[] {
    return this._integrityEvents;
  }

  /** Backend-only transition. Duplicate event IDs are idempotent across retries. */
  recordIntegrityWarning(event: IntegrityEventInput): {
    warningCount: number;
    duplicate: boolean;
    suppressed: boolean;
    terminated: boolean;
  } {
    if (this._state === InterviewState.TERMINATED_FOR_INTEGRITY) {
      return { warningCount: this._integrityWarningCount, duplicate: false, suppressed: false, terminated: true };
    }
    if (![InterviewState.IN_PROGRESS, InterviewState.EVALUATING].includes(this._state)) {
      throw new InvalidStateTransitionError(this._state, 'recordIntegrityWarning', [InterviewState.IN_PROGRESS, InterviewState.EVALUATING]);
    }
    if (this._integrityEvents.some((record) => record.eventId === event.eventId)) {
      return { warningCount: this._integrityWarningCount, duplicate: true, suppressed: false, terminated: false };
    }

    const lastEvent = [...this._integrityEvents].reverse().find((record) => record.eventType === event.eventType);
    const suppressed = !!lastEvent && event.occurredAt - event.durationMs < lastEvent.occurredAt + INTERVIEW_INTEGRITY_POLICY.duplicateSuppressionMs;
    let policyDecision: NonNullable<IntegrityEventRecord['policyDecision']> = 'context_only';
    let incidentSuppressed = suppressed;
    if (event.eventType === 'tab_hidden' || event.eventType === 'tab_visible') {
      const valid = validateIntegrityEvent(event,{sessionStartedAt:this.timing.sessionStartedAt,now:event.occurredAt}).eligible;
      const reliable = event.severity !== 'technical' && (!event.details || event.details.source === 'browser') &&
        (event.confidence == null || (Number.isFinite(event.confidence) && event.confidence >= INTERVIEW_INTEGRITY_POLICY.minimumReportedConfidence && event.confidence <= 1));
      if (valid && reliable) {
        const transition = transitionTabIncident(event,this._tabIncident,this._lastIntegrityWarningAt);
        this._tabIncident = transition.incident; policyDecision = transition.decision;
        incidentSuppressed = ['same_incident','cooldown'].includes(policyDecision);
      } else incidentSuppressed = true;
    }
    const warningEligible = policyDecision === 'confirmed_violation';
    if (warningEligible) {this._integrityWarningCount += 1;this._lastIntegrityWarningAt=event.occurredAt;}
    this._integrityEvents.push({ ...event, policyDecision, warningNumber: warningEligible ? this._integrityWarningCount : 0 });
    // Bound retained operational metadata while keeping enough history to suppress replays.
    if (this._integrityEvents.length > 500) this._integrityEvents.splice(0, this._integrityEvents.length - 500);

    if (this._integrityWarningCount >= INTERVIEW_INTEGRITY_POLICY.terminationViolationCount) {
      this._state = InterviewState.TERMINATED_FOR_INTEGRITY;
      this._currentQuestion = null;
      this._terminatedAt = new Date().toISOString();
      this._terminationReason = `Three distinct sustained hidden-tab incidents reached the warning limit. Each met the ${INTERVIEW_INTEGRITY_POLICY.minimumTabHiddenDurationMs / 1000}-second duration rule, with visible recovery and cooldown between incidents. This is a policy outcome, not a determination of intent.`;
    }
    return {
      warningCount: this._integrityWarningCount,
      duplicate: false,
      suppressed: incidentSuppressed,
      terminated: this._state === InterviewState.TERMINATED_FOR_INTEGRITY,
    };
  }

  get skillStates(): readonly SkillState[] {
    return [...this._states.values()];
  }

  get evidenceTracker(): EvidenceTracer {
    return this._tracer;
  }

  // ---------------------------------------------------------------------------
  // State Machine Transitions
  // ---------------------------------------------------------------------------

  /**
   * Transition: CREATED → READY
   * Primes the session and locks the interview configuration.
   */
  prepare(): void {
    this.assertState('prepare', [InterviewState.CREATED]);
    this._state = InterviewState.READY;
  }

  /**
   * Transition: READY → IN_PROGRESS (or starts the session).
   */
  start(): void {
    this.assertState('start', [InterviewState.READY]);
    const now = Date.now();
    this._timing.sessionStartedAt = now;
    this._timing.roundStartedAt = now;
    this._state = InterviewState.IN_PROGRESS;
  }

  /**
   * Transition: READY / IN_PROGRESS / EVALUATING → IN_PROGRESS
   * Emits the next question adaptively.
   */
  nextQuestion(): Question {
    this.assertState('nextQuestion', [
      InterviewState.READY,
      InterviewState.IN_PROGRESS,
      InterviewState.EVALUATING,
    ]);

    const now = Date.now();
    if (!this._timing.sessionStartedAt) {
      this._timing.sessionStartedAt = now;
      this._timing.roundStartedAt = now;
    }

    const selected = selectSessionQuestion({
      config: this.config, round: this._currentRound, states: this.skillStates,
      history: this._questionHistory, recentSkills: this._recentSkills,
      claimWeights: this.unverifiedClaimWeights(), preferredTypes: this.leastUsedTypes(),
      adaptive: this._adaptive, generator: this._generator,
    });
    this.lastSelectionRationale = selected.rationale;
    const question = selected.question;

    this._askedIds.add(question.id);
    this._recentSkills.push(question.skillId);
    if (this._recentSkills.length > 12) this._recentSkills.shift();

    this._currentQuestion = question;
    this._currentTopic = question.skillId;
    this._currentDifficulty = question.difficulty * 2; // scale 1..5 to 1..10
    this._timing.questionStartedAt = now;
    this._timing.questionTimeLimitSec = DEFAULT_TIME_LIMITS[question.type] ?? 120;
    this._state = InterviewState.IN_PROGRESS;

    return question;
  }

  /**
   * Transition: IN_PROGRESS → EVALUATING
   * Receives candidate free-text answer, evaluates against rubric, updates rolling skill states.
   */
  async submitAnswer(answerInput: {
    text?: string;
    code?: string;
    elapsedSec?: number;
    selectedChoiceIndex?: number;
  }): Promise<QuestionEvaluation> {
    this.assertState('submitAnswer', [InterviewState.IN_PROGRESS]);
    if (!this._currentQuestion) {
      throw new Error('No active question to submit answer for.');
    }

    const question = this._currentQuestion;
    const now = Date.now();
    const elapsedSec =
      answerInput.elapsedSec ??
      (this._timing.questionStartedAt ? Math.round((now - this._timing.questionStartedAt) / 1000) : 0);

    const candidateAnswer: CandidateAnswer = {
      questionId: question.id,
      text: answerInput.text ?? (answerInput.code ? `[Code Submission]` : ''),
      code: answerInput.code,
      selectedChoiceIndex: answerInput.selectedChoiceIndex,
      elapsedSec,
      timestamp: now,
    };

    // Transition to EVALUATING while evaluation is performed
    this._state = InterviewState.EVALUATING;

    let evaluation: QuestionEvaluation;
    try { evaluation = await this._evaluator.evaluate(question, candidateAnswer); }
    catch (error) { this._state = InterviewState.IN_PROGRESS; throw error; }

    // Update skill state
    const prev = this._states.get(question.skillId) ?? this._skillStateManager.init(question.skillId);
    const observation: SkillObservation = {
      skillId: question.skillId,
      questionId: question.id,
      score: evaluation.grade,
      evidenceQuality: this.evidenceQuality(evaluation),
      weight: TYPE_WEIGHT[question.type] ?? 0.7,
      difficulty: question.difficulty,
      timestamp: now,
    };
    const updated = this._skillStateManager.update(prev, observation);
    this._states.set(question.skillId, updated);
    this._tracer.record({ question, answer: candidateAnswer, evaluation });

    this._questionHistory.push({
      question,
      answer: candidateAnswer,
      evaluation,
      round: this._currentRound,
      timestamp: now,
    });

    // Check if current round or interview is complete
    const budget = this.config.interviewPlan?.rounds.find((r) => r.roundNumber === this._currentRound)?.questionBudget ?? this.config.roundConfig?.questionBudget ?? 4;
    const questionsInCurrentRound = this._questionHistory.filter((q) => q.round === this._currentRound).length;

    if (questionsInCurrentRound >= budget) {
      if (this._currentRound >= this._maxRounds) {
        this._state = InterviewState.COMPLETED;
        this._completedAt = Date.now();
      }
    }

    return evaluation;
  }

  /**
   * Advance to the next round (1..4).
   * Transition: EVALUATING → IN_PROGRESS (or COMPLETED if all rounds exhausted).
   */
  advanceRound(): void {
    this.assertState('advanceRound', [InterviewState.EVALUATING, InterviewState.IN_PROGRESS]);
    this._currentRound += 1;
    this._timing.roundStartedAt = Date.now();
    this._currentQuestion = null;

    if (this._currentRound > this._maxRounds) {
      this._state = InterviewState.COMPLETED;
      this._completedAt = Date.now();
    } else {
      this._state = InterviewState.IN_PROGRESS;
    }
  }

  /**
   * Explicitly complete the interview session.
   * Transition: EVALUATING / IN_PROGRESS → COMPLETED
   */
  complete(): void {
    this.assertState('complete', [InterviewState.EVALUATING, InterviewState.IN_PROGRESS]);
    if (!this.hasCompletedPlan) throw new Error('Complete all planned questions before finalizing the interview.');
    this._state = InterviewState.COMPLETED;
    this._completedAt = Date.now();
    this._currentQuestion = null;
  }

  // ---------------------------------------------------------------------------
  // Reconnect / Page Refresh Survival: Public Sanitized State
  // ---------------------------------------------------------------------------

  /**
   * Returns sanitized backend single source of truth for the client.
   * IMPORTANT: Redacts expected_answer_points, hints, and rubric criteria
   * to guarantee the candidate cannot cheat on reconnect/refresh!
   */
  toPublicState(): PublicInterviewState {
    const now = Date.now();
    const elapsedSec = this._timing.questionStartedAt
      ? Math.max(0, Math.round((now - this._timing.questionStartedAt) / 1000))
      : 0;

    let publicQuestion: PublicQuestion | null = null;
    if (this._currentQuestion && this._state === InterviewState.IN_PROGRESS) {
      publicQuestion = {
        id: this._currentQuestion.id,
        prompt: this._currentQuestion.prompt,
        type: this._currentQuestion.type,
        skillId: this._currentQuestion.skillId,
        difficulty: this._currentDifficulty,
        timeLimitSec: this._timing.questionTimeLimitSec,
      };
    }

    const budget = this.config.interviewPlan?.rounds.find((r) => r.roundNumber === this._currentRound)?.questionBudget ?? this.config.roundConfig?.questionBudget ?? 4;
    const answeredInRound = this._questionHistory.filter((q) => q.round === this._currentRound).length;

    return {
      sessionId: this.sessionId,
      state: this._state,
      currentRound: this._currentRound,
      maxRounds: this._maxRounds,
      currentQuestion: publicQuestion,
      currentDifficulty: this._currentDifficulty,
      currentTopic: this._currentTopic,
      timing: {
        sessionStartedAt: this._timing.sessionStartedAt,
        roundStartedAt: this._timing.roundStartedAt,
        questionStartedAt: this._timing.questionStartedAt,
        elapsedSec,
        timeLimitSec: this._timing.questionTimeLimitSec,
      },
      progress: {
        questionsAnsweredInRound: answeredInRound,
        questionBudgetInRound: budget,
        totalQuestionsAnswered: this._questionHistory.length,
      },
      questionHistory: this._questionHistory.map((h) => ({
        questionId: h.question.id,
        skillId: h.question.skillId,
        questionType: h.question.type,
        score: h.evaluation?.grade,
        feedbackSummary: h.evaluation?.rationale,
      })),
      skillEstimates: [...this._states.entries()].map(([skillId, s]) => ({
        skillId,
        estimate: round(s.estimate, 1),
        confidence: round(s.confidence, 2),
      })),
      integrity: {
        warningCount: this._integrityWarningCount,
        maximumWarnings: INTERVIEW_INTEGRITY_POLICY.maximumWarnings,
        terminatedAt: this._terminatedAt,
        terminationReason: this._terminationReason,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Serialization & Deserialization
  // ---------------------------------------------------------------------------

  serialize(): SerializedStateMachine {
    return {
      completedAt: this._completedAt,
      lastSelectionRationale: this.lastSelectionRationale,
      sessionId: this.sessionId,
      config: this.config,
      state: this._state,
      currentRound: this._currentRound,
      maxRounds: this._maxRounds,
      currentQuestion: this._currentQuestion,
      currentDifficulty: this._currentDifficulty,
      currentTopic: this._currentTopic,
      timing: { ...this._timing },
      questionHistory: this._questionHistory.map((h) => ({
        question: h.question,
        answer: h.answer,
        evaluation: h.evaluation,
        round: h.round,
        timestamp: h.timestamp,
      })),
      skillStates: [...this._states.entries()].map(([skillId, s]) => ({
        skillId,
        estimate: s.estimate,
        confidence: s.confidence,
        samples: s.samples,
        history: s.history.map((obs) => ({
          questionId: obs.questionId,
          score: obs.score,
          evidenceQuality: obs.evidenceQuality,
          weight: obs.weight,
          difficulty: obs.difficulty,
          timestamp: obs.timestamp,
        })),
        lastAnsweredAt: s.lastAnsweredAt,
      })),
      recentSkills: [...this._recentSkills],
      askedIds: [...this._askedIds],
      integrity: {
        warningCount: this._integrityWarningCount,
        tabIncident: this._tabIncident ? {...this._tabIncident} : null,
        lastWarningAt: this._lastIntegrityWarningAt,
        events: this._integrityEvents.map((event) => ({ ...event })),
        terminatedAt: this._terminatedAt,
        terminationReason: this._terminationReason,
      },
    };
  }

  static deserialize(
    snapshot: SerializedStateMachine,
    deps: StateMachineDeps,
  ): InterviewStateMachine {
    const sm = new InterviewStateMachine(snapshot.config, deps, { sessionId: snapshot.sessionId });
    sm.lastSelectionRationale = snapshot.lastSelectionRationale ?? '';
    sm._state = snapshot.state;
    sm._currentRound = snapshot.currentRound;
    sm._currentQuestion = snapshot.currentQuestion;
    sm._currentDifficulty = snapshot.currentDifficulty;
    sm._currentTopic = snapshot.currentTopic;

    sm._timing.sessionStartedAt = snapshot.timing.sessionStartedAt;
    sm._timing.roundStartedAt = snapshot.timing.roundStartedAt;
    sm._timing.questionStartedAt = snapshot.timing.questionStartedAt;
    sm._timing.questionTimeLimitSec = snapshot.timing.questionTimeLimitSec;

    // Restore history
    for (const h of snapshot.questionHistory) {
      sm._questionHistory.push({
        question: h.question,
        answer: h.answer,
        evaluation: h.evaluation,
        round: h.round,
        timestamp: h.timestamp,
      });
      if (h.answer && h.evaluation) {
        sm._tracer.record({ question: h.question, answer: h.answer, evaluation: h.evaluation });
      }
    }

    // Restore skill states
    for (const ss of snapshot.skillStates) {
      const state = sm._skillStateManager.init(ss.skillId);
      state.estimate = ss.estimate;
      state.confidence = ss.confidence;
      state.samples = ss.samples;
      state.lastAnsweredAt = ss.lastAnsweredAt;
      state.history = ss.history.map((obs) => ({
        skillId: ss.skillId,
        questionId: obs.questionId ?? '',
        score: obs.score,
        evidenceQuality: obs.evidenceQuality,
        weight: obs.weight,
        difficulty: obs.difficulty,
        timestamp: obs.timestamp,
      }));
      sm._states.set(ss.skillId, state);
    }

    sm._recentSkills = [...snapshot.recentSkills];
    for (const id of snapshot.askedIds) sm._askedIds.add(id);
    sm._integrityWarningCount = snapshot.integrity?.warningCount ?? 0;
    sm._integrityEvents = (snapshot.integrity?.events ?? []).map((event) => ({ ...event }));
    const lastWarning = [...sm._integrityEvents].reverse().find(event=>event.warningNumber>0);
    sm._lastIntegrityWarningAt = snapshot.integrity?.lastWarningAt ?? lastWarning?.occurredAt ?? null;
    sm._tabIncident = snapshot.integrity?.tabIncident ?? (sm._integrityWarningCount > 0 ? {
      startedAt:lastWarning ? lastWarning.occurredAt-lastWarning.durationMs : sm.timing.sessionStartedAt ?? 0,
      lastObservedAt:lastWarning?.occurredAt ?? sm.timing.sessionStartedAt ?? 0,
      recoveredAt:[...sm._integrityEvents].reverse().find(event=>event.eventType==='tab_visible'&&event.occurredAt>(lastWarning?.occurredAt??0))?.occurredAt??null,
    } : null);
    sm._terminatedAt = snapshot.integrity?.terminatedAt ?? null;
    sm._completedAt = snapshot.completedAt ?? null;
    sm._terminationReason = snapshot.integrity?.terminationReason ?? null;

    return sm;
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  private assertState(action: string, allowed: readonly InterviewState[]): void {
    if (!allowed.includes(this._state)) {
      throw new InvalidStateTransitionError(this._state, action, allowed);
    }
  }

  private initializeStates(): void {
    const skillIds = new Set<string>();
    for (const { skillId } of this.config.role.skills) skillIds.add(skillId);
    for (const { skillId } of this.config.profile.skills) skillIds.add(skillId);
    for (const id of skillIds) this._states.set(id, this._skillStateManager.init(id));
  }

  private leastUsedTypes(): QuestionType[] {
    const counts = new Map<QuestionType, number>();
    for (const h of this._questionHistory) {
      counts.set(h.question.type, (counts.get(h.question.type) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[1] - b[1]).map(([t]) => t);
  }

  private unverifiedClaimWeights(): { skillId: string; weight: number }[] {
    const out: { skillId: string; weight: number }[] = [];
    for (const claim of this._tracer.pendingClaims) {
      if (claim.verdict === 'validated' || claim.verdict === 'refuted') continue;
      for (const skillId of claim.skillIds) {
        out.push({ skillId, weight: claim.weight });
      }
    }
    return out;
  }

  private evidenceQuality(evaluation: QuestionEvaluation): number {
    return norm.clamp01(
      norm.to01(evaluation.criteria.appliedEvidence) * 0.6 +
        evaluation.rubricCompliance * 0.4,
    );
  }
}
