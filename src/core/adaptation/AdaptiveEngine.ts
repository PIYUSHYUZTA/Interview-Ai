import type {
  Difficulty,
  HighPriorityGap,
  InterviewTarget,
  LevelBand,
  RoleRequirement,
  SkillState,
  SkillsTaxonomy,
  Question,
  CandidateAnswer,
  QuestionEvaluation,
  JobDescriptionAnalysis,
} from '../types.js';
import type { AnswerEvaluatorOutput } from '../assessment/evaluators/AnswerEvaluator.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { norm, round } from '../utils/norm.js';

export interface AdaptiveEngineDeps {
  readonly taxonomy?: SkillsTaxonomy;
  readonly requirementBias?: number; // how strongly role weight drives topic choice (0..1)
  readonly gapBias?: number; // how strongly uncertainty/gaps drive topic choice (0..1)
  /** How strongly JD-derived interview targets steer selection (0..1, additive). */
  readonly targetBias?: number;
  readonly seed?: number;
}

export interface Selection {
  readonly skillId: string;
  readonly difficulty: Difficulty;
  readonly reason: string;
}

/**
 * Service 4: Adaptive Engine Action Types
 */
export type AdaptiveAction =
  | 'increase_difficulty'
  | 'deepen_topic'
  | 'hold_difficulty'
  | 'probe_understanding'
  | 'drop_difficulty'
  | 'test_fundamentals'
  | string;

/**
 * Service 4: Adaptive Engine Input Contract
 * Input: latest evaluation + rolling skill state + current difficulty + full history + target role
 */
export interface AdaptiveDecisionInput {
  readonly latest_evaluation?:
    | AnswerEvaluatorOutput
    | QuestionEvaluation
    | {
        readonly grade?: number;
        readonly score?: number;
        readonly correctness?: number;
        readonly reasoning?: number;
        readonly technical_depth?: number;
        readonly communication?: number;
        readonly confidence?: number;
        readonly feedback?: string;
        readonly knowledge_gaps?: readonly string[];
        readonly rationale?: string;
        readonly skillId?: string;
        readonly target_skill?: string;
        readonly topic?: string;
        [key: string]: unknown;
      }
    | null;
  readonly latestEvaluation?: AdaptiveDecisionInput['latest_evaluation'];
  readonly rolling_skill_state:
    | readonly SkillState[]
    | Record<string, SkillState | { estimate: number; confidence: number; samples?: number }>
    | { readonly [skillId: string]: any };
  readonly rollingSkillState?: AdaptiveDecisionInput['rolling_skill_state'];
  readonly current_difficulty: number; // 1-10
  readonly currentDifficulty?: number;
  readonly full_history: readonly (
    | {
        readonly question?: Question | { id?: string; skillId?: string; topic?: string; difficulty?: number; prompt?: string };
        readonly answer?: CandidateAnswer | { text?: string; code?: string };
        readonly evaluation?: QuestionEvaluation | AnswerEvaluatorOutput | { grade?: number; score?: number; correctness?: number };
        readonly skillId?: string;
        readonly topic?: string;
        readonly difficulty?: number;
        readonly score?: number;
        readonly grade?: number;
        [key: string]: unknown;
      }
    | Question
    | string
  )[];
  readonly fullHistory?: AdaptiveDecisionInput['full_history'];
  readonly target_role:
    | RoleRequirement
    | JobDescriptionAnalysis
    | { readonly title: string; readonly skills: readonly { readonly skillId: string; readonly weight?: number; readonly requiredLevel?: LevelBand | string }[] }
    | { readonly roleRequirement: RoleRequirement };
  readonly targetRole?: AdaptiveDecisionInput['target_role'];
  readonly current_topic?: string;
  readonly currentTopic?: string;
  readonly action_preference?: 'increase_difficulty' | 'deepen_topic';
}

/**
 * Service 4: Adaptive Engine Output Contract
 * Output: JSON — next_action, next_difficulty, next_topic, rationale
 */
export interface AdaptiveDecisionOutput {
  readonly next_action: AdaptiveAction;
  readonly next_difficulty: number; // 1-10
  readonly next_topic: string;
  readonly rationale: string;

  // TypeScript developer convenience aliases
  readonly nextAction?: AdaptiveAction;
  readonly nextDifficulty?: number;
  readonly nextTopic?: string;
  readonly rollingSkillEstimate?: number;
  readonly candidateLevelHypothesis?: LevelBand;
}

export interface AdaptiveEngineAuditResult {
  readonly passes: boolean;
  readonly findings: readonly {
    readonly severity: 'ok' | 'violation' | 'warning';
    readonly scope: string;
    readonly message: string;
  }[];
}

/** Deterministic seeded PRNG so adaptive behaviour is reproducible in tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Service 4: Adaptive Engine (the actual "decision maker")
 *
 * Mandate:
 * Input: latest evaluation + rolling skill state + current difficulty + full history + target role
 * Output: JSON — next_action, next_difficulty, next_topic, rationale
 *
 * Decision policy to implement:
 *  - Score ≥80% → increase difficulty or go deeper on the same topic
 *  - Score 50–79% → hold difficulty, probe understanding
 *  - Score <50% → drop difficulty, test fundamentals
 *
 * Hard rule:
 *  - One weak answer must never alone determine candidate level — maintain a rolling/weighted
 *    skill estimate across multiple data points, not a single last-answer flag.
 */
export class AdaptiveEngine {
  private readonly taxonomy: SkillsTaxonomy;
  private readonly requirementBias: number;
  private readonly gapBias: number;
  private readonly targetBias: number;
  private readonly random: () => number;

  constructor(deps: AdaptiveEngineDeps = {}) {
    this.taxonomy = deps.taxonomy ?? defaultTaxonomy;
    this.requirementBias = deps.requirementBias ?? 0.5;
    this.gapBias = deps.gapBias ?? 0.5;
    this.targetBias = deps.targetBias ?? 0.6;
    this.random = mulberry32(deps.seed ?? 42);
  }

  /**
   * Service 4 Decoupled Decision API:
   * Decides next_action, next_difficulty, next_topic, and rationale.
   */
  decide(input: AdaptiveDecisionInput): AdaptiveDecisionOutput {
    const latestEvaluation = input.latest_evaluation ?? input.latestEvaluation ?? null;
    const rollingSkillStates = normalizeSkillStates(input.rolling_skill_state ?? input.rollingSkillState);
    const fullHistory = input.full_history ?? input.fullHistory ?? [];
    const roleReq = normalizeRoleRequirement(input.target_role ?? input.targetRole);

    const rawDifficulty = input.current_difficulty ?? input.currentDifficulty ?? 5;
    const currentDifficulty = norm.clamp10(Math.max(1, Math.min(10, Math.round(rawDifficulty))));

    // Determine current topic from input, evaluation, history, or role
    const currentTopic =
      input.current_topic ??
      input.currentTopic ??
      extractTopicFromLatest(latestEvaluation) ??
      extractTopicFromHistory(fullHistory) ??
      resolveTopRoleSkill(roleReq) ??
      'backend';

    const scoreRatio = extractScoreRatio(latestEvaluation);

    // Compute or update the multi-sample rolling estimate for current topic
    const rollingStats = this.computeRollingEstimate(
      fullHistory,
      currentTopic,
      scoreRatio,
      currentDifficulty,
      rollingSkillStates,
    );
    const targetSkillReq = roleReq.skills.find((s) => s.skillId === currentTopic);
    const candidateLevel = this.inferCandidateLevel(
      rollingStats.estimate,
      rollingStats.samples,
      targetSkillReq?.requiredLevel,
    );

    // Streak on current topic
    const topicStreak = countTopicStreak(fullHistory, currentTopic);

    let nextAction: AdaptiveAction;
    let nextDifficulty: number;
    let nextTopic: string;
    let rationale: string;

    // Case 1: First question / no latest evaluation
    if (scoreRatio === null) {
      nextAction = 'probe_understanding';
      nextDifficulty = currentDifficulty;
      nextTopic = resolveTopRoleSkill(roleReq) ?? currentTopic;
      rationale = `Initial interview question: establishing baseline proficiency on role-critical topic "${nextTopic}" at difficulty ${nextDifficulty}.`;
    }
    // Case 2: Score ≥ 80% → increase difficulty or go deeper on the same topic
    else if (scoreRatio >= 0.80) {
      const percentage = Math.round(scoreRatio * 100);
      // If at ceiling or requested to deepen or streak is low
      if (currentDifficulty >= 10) {
        nextAction = 'deepen_topic';
        nextDifficulty = 10;
        nextTopic = currentTopic;
        rationale =
          `Score was ${percentage}% (≥80%), demonstrating mastery on "${currentTopic}". ` +
          `Difficulty is at maximum (10); deepening probe into advanced architecture and trade-offs. ` +
          `Rolling estimate: ${rollingStats.estimate.toFixed(1)}/10 across ${rollingStats.samples} sample(s) (level: ${candidateLevel}).`;
      } else if (input.action_preference === 'deepen_topic' || (topicStreak < 2 && this.random() < 0.35)) {
        // Go deeper on same topic
        nextAction = 'deepen_topic';
        nextDifficulty = Math.min(10, currentDifficulty + 1);
        nextTopic = currentTopic;
        rationale =
          `Score was ${percentage}% (≥80%), demonstrating mastery on "${currentTopic}". ` +
          `Policy: going deeper on the same topic with advanced probe at difficulty ${nextDifficulty}. ` +
          `Rolling estimate: ${rollingStats.estimate.toFixed(1)}/10 across ${rollingStats.samples} sample(s) (level: ${candidateLevel}).`;
      } else if (topicStreak < 2) {
        // Increase difficulty on same topic
        nextDifficulty = Math.min(10, currentDifficulty + 1);
        nextAction = 'increase_difficulty';
        nextTopic = currentTopic;
        rationale =
          `Score was ${percentage}% (≥80%), demonstrating strong competence on "${currentTopic}". ` +
          `Policy: increasing difficulty from ${currentDifficulty} to ${nextDifficulty} to test upper technical ceiling on this topic. ` +
          `Rolling estimate: ${rollingStats.estimate.toFixed(1)}/10 across ${rollingStats.samples} sample(s) (level: ${candidateLevel}).`;
      } else {
        // Streak >= 2: candidate has thoroughly mastered this topic, escalate difficulty onto next required role topic
        nextDifficulty = Math.min(10, currentDifficulty + 1);
        nextAction = 'increase_difficulty';
        nextTopic = resolveNextRoleTopic(roleReq, fullHistory, currentTopic) ?? currentTopic;
        rationale =
          `Score was ${percentage}% (≥80%) on "${currentTopic}" (streak ${topicStreak}). ` +
          `Policy: mastery established; rotating to high-priority requirement "${nextTopic}" at escalated difficulty ${nextDifficulty}. ` +
          `Rolling estimate for ${currentTopic}: ${rollingStats.estimate.toFixed(1)}/10 across ${rollingStats.samples} sample(s).`;
      }
    }
    // Case 3: Score 50–79% → hold difficulty, probe understanding
    else if (scoreRatio >= 0.50) {
      const percentage = Math.round(scoreRatio * 100);
      nextDifficulty = currentDifficulty;
      nextAction = topicStreak === 0 ? 'probe_understanding' : 'hold_difficulty';

      if (topicStreak < 2) {
        nextTopic = currentTopic;
        rationale =
          `Score was ${percentage}% (50–79%) on "${currentTopic}", reflecting developing knowledge with unprobed edge cases. ` +
          `Policy: holding difficulty at ${nextDifficulty} and probing understanding to clarify boundaries. ` +
          `Rolling estimate: ${rollingStats.estimate.toFixed(1)}/10 across ${rollingStats.samples} sample(s) (level: ${candidateLevel}).`;
      } else {
        nextTopic = resolveNextRoleTopic(roleReq, fullHistory, currentTopic) ?? currentTopic;
        rationale =
          `Score was ${percentage}% (50–79%) on "${currentTopic}". ` +
          `Policy: holding difficulty at ${nextDifficulty} and transitioning to probe understanding on "${nextTopic}". ` +
          `Rolling estimate for ${currentTopic}: ${rollingStats.estimate.toFixed(1)}/10 across ${rollingStats.samples} sample(s).`;
      }
    }
    // Case 4: Score < 50% → drop difficulty, test fundamentals
    else {
      const percentage = Math.round(scoreRatio * 100);
      nextDifficulty = Math.max(1, currentDifficulty - 1);
      nextAction = currentDifficulty <= 2 ? 'test_fundamentals' : 'drop_difficulty';
      nextTopic = currentTopic;

      // Hard Rule: State clearly that one weak answer does not alone determine candidate level!
      rationale =
        `Score was ${percentage}% (<50%) on "${currentTopic}", revealing knowledge gaps. ` +
        `Policy: dropping difficulty from ${currentDifficulty} to ${nextDifficulty} to test fundamentals. ` +
        `HARD RULE: Candidate level is NOT determined by this single weak answer alone. ` +
        `Maintaining multi-sample rolling estimate of ${rollingStats.estimate.toFixed(1)}/10 across ${rollingStats.samples} data point(s) ` +
        `(candidate level hypothesis: ${candidateLevel}, confidence: ${rollingStats.confidence.toFixed(2)}).`;
    }

    return {
      next_action: nextAction,
      next_difficulty: nextDifficulty,
      next_topic: nextTopic,
      rationale,
      nextAction,
      nextDifficulty,
      nextTopic,
      rollingSkillEstimate: round(rollingStats.estimate, 1),
      candidateLevelHypothesis: candidateLevel,
    };
  }

  /** Alias for decide() */
  decideNext(input: AdaptiveDecisionInput): AdaptiveDecisionOutput {
    return this.decide(input);
  }

  /**
   * Serialize output to clean JSON matching the exact required schema:
   * next_action, next_difficulty, next_topic, rationale
   */
  toJSON(output: AdaptiveDecisionOutput): string {
    const clean = {
      next_action: output.next_action,
      next_difficulty: output.next_difficulty,
      next_topic: output.next_topic,
      rationale: output.rationale,
    };
    return JSON.stringify(clean, null, 2);
  }

  /**
   * Audit the decision against the Hard Rule:
   * "one weak answer must never alone determine candidate level — maintain a rolling/weighted
   *  skill estimate across multiple data points, not a single last-answer flag"
   */
  audit(
    history: readonly any[],
    decision: AdaptiveDecisionOutput,
    _rollingStates?: readonly SkillState[] | Record<string, SkillState>,
  ): AdaptiveEngineAuditResult {
    const findings: { severity: 'ok' | 'violation' | 'warning'; scope: string; message: string }[] = [];

    // 1. Difficulty bounds check
    if (decision.next_difficulty < 1 || decision.next_difficulty > 10) {
      findings.push({
        severity: 'violation',
        scope: 'difficulty_bounds',
        message: `next_difficulty ${decision.next_difficulty} is out of bounds (must be 1-10).`,
      });
    }

    // 2. Action validity check
    const validActions = [
      'increase_difficulty',
      'deepen_topic',
      'hold_difficulty',
      'probe_understanding',
      'drop_difficulty',
      'test_fundamentals',
    ];
    if (!validActions.includes(decision.next_action)) {
      findings.push({
        severity: 'warning',
        scope: 'action_validity',
        message: `next_action "${decision.next_action}" is non-standard.`,
      });
    }

    // 3. HARD RULE CHECK: Verify that one weak answer does not alone determine candidate level
    const scores = history
      .map((h) => {
        const ev = typeof h === 'object' && h !== null ? h.evaluation ?? h : undefined;
        return extractScoreRatio(ev);
      })
      .filter((s): s is number => s !== null);

    if (scores.length >= 2) {
      const priorScores = scores.slice(0, -1);
      const lastScore = scores[scores.length - 1];
      const priorAvg = priorScores.reduce((a, b) => a + b, 0) / priorScores.length;

      // If prior performance was strong (≥70%), and the latest answer is weak (<50%)
      if (priorAvg >= 0.70 && lastScore < 0.50) {
        if (decision.candidateLevelHypothesis === 'junior') {
          findings.push({
            severity: 'violation',
            scope: 'hard_rule_violation',
            message: `VIOLATION of Hard Rule: Candidate had prior average ${(priorAvg * 10).toFixed(1)}/10, but a single weak answer (${(lastScore * 10).toFixed(1)}/10) downgraded candidate level to junior!`,
          });
        }
        if (
          !decision.rationale.toLowerCase().includes('hard rule') &&
          !decision.rationale.toLowerCase().includes('single weak answer')
        ) {
          findings.push({
            severity: 'violation',
            scope: 'hard_rule_transparency',
            message: 'Rationale failed to document adherence to the Hard Rule regarding multi-sample estimation.',
          });
        }
      }
    }

    if (findings.length === 0) {
      findings.push({
        severity: 'ok',
        scope: 'policy_compliance',
        message: 'Adaptive decision policy and Hard Rule verified: multi-sample rolling estimate maintained.',
      });
    }

    return {
      passes: !findings.some((f) => f.severity === 'violation'),
      findings,
    };
  }

  /**
   * Computes a multi-sample rolling estimate with a conservative neutral prior.
   * Dampens noise so an anomalous weak or strong grade never moves the estimate too far.
   */
  computeRollingEstimate(
    history: readonly any[],
    skillId: string,
    currentScoreRatio?: number | null,
    _currentDifficulty?: number,
    existingStates?: readonly SkillState[],
  ): { estimate: number; samples: number; confidence: number } {
    const observations: { score: number; weight: number }[] = [];

    for (const item of history) {
      const q = typeof item === 'object' && item !== null ? item.question ?? item : item;
      const qSkill =
        typeof q === 'object' && q !== null
          ? (q as any).skillId ?? (q as any).target_skill ?? (q as any).topic
          : undefined;
      const ev = typeof item === 'object' && item !== null ? item.evaluation ?? item : undefined;
      const score = extractScoreRatio(ev);

      if (qSkill === skillId && score !== null) {
        observations.push({ score: score * 10, weight: 1.0 });
      }
    }

    if (currentScoreRatio !== null && currentScoreRatio !== undefined) {
      observations.push({ score: currentScoreRatio * 10, weight: 1.0 });
    }

    const existing = existingStates?.find((s) => s.skillId === skillId);
    if (observations.length === 0 && existing) {
      return {
        estimate: existing.estimate,
        samples: existing.samples,
        confidence: existing.confidence,
      };
    }

    if (observations.length === 0) {
      return { estimate: 5.0, samples: 0, confidence: 0 };
    }

    // Conservative Bayesian-style weighted estimation with neutral prior mass
    const PRIOR_MEAN = 5.0;
    const PRIOR_MASS = 1.25;

    let weightedSum = PRIOR_MEAN * PRIOR_MASS;
    let totalWeight = PRIOR_MASS;

    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i];
      // Gentle recency decay
      const recency = Math.pow(0.9, observations.length - 1 - i);
      const w = obs.weight * recency;
      weightedSum += obs.score * w;
      totalWeight += w;
    }

    const estimate = norm.clamp10(weightedSum / totalWeight);
    const samples = observations.length;
    const confidence = norm.clamp01((samples / (samples + 2)) * 0.9);

    return { estimate, samples, confidence };
  }

  /**
   * Infers candidate level hypothesis from rolling estimate and observation mass.
   * Never infers final junior level on a single weak observation.
   */
  inferCandidateLevel(rollingEstimate: number, samples: number, requiredLevel?: LevelBand | string): LevelBand {
    if (samples <= 1) {
      // With <= 1 sample, retain the target role expectation or neutral mid prior
      if (requiredLevel === 'senior' || requiredLevel === 'mid' || requiredLevel === 'junior') {
        return requiredLevel;
      }
      return 'mid';
    }

    if (rollingEstimate >= 7.0) return 'senior';
    if (rollingEstimate >= 4.5) return 'mid';
    return 'junior';
  }

  // ---------------------------------------------------------------------------
  // Existing Topic Selection & Difficulty Mapping (Preserved for backwards compatibility)
  // ---------------------------------------------------------------------------

  /**
   * Choose the next topic to probe.
   * @param states rolling skill states (usually one per candidate skill)
   * @param role the target role requirements
   * @param recentlyAskedIds skills asked in the last few questions
   * @param claimsForGaps claims still unverified (drives probing)
   * @param options optional JD-derived interview targets and high-priority gaps to steer selection
   */
  selectNext(
    states: readonly SkillState[],
    role: RoleRequirement,
    recentlyAskedIds: readonly string[],
    claimsForGaps: readonly { skillId: string; weight: number }[],
    options?: {
      targets?: readonly InterviewTarget[];
      gaps?: readonly HighPriorityGap[];
    },
  ): Selection {
    const scored = states.map((state) => {
      const requirement = role.skills.find((s) => s.skillId === state.skillId);
      const reqWeight = requirement?.weight ?? 0;

      const informationGain = this.informationGain(state, requirement?.requiredLevel, claimsForGaps);
      const requirementTerm = Math.pow(reqWeight, 0.75);

      let score = requirementTerm * (1 + informationGain);
      const streak = recentlyAskedIds.filter((id) => id === state.skillId).length;
      const streakPenalty = Math.pow(0.72, streak);
      score *= streakPenalty;

      const deficit = norm.to01(state.estimate) * (1 - state.confidence);
      score += this.gapBias * deficit * (1 + reqWeight);
      score += this.requirementBias * reqWeight * 0.4;

      if (options?.targets) {
        const target = options.targets.find((t) => t.skillId === state.skillId);
        if (target) {
          score += this.targetBias * target.priority * 1.5;
        }
      }

      if (options?.gaps) {
        const gap = options.gaps.find((g) => g.skillId === state.skillId);
        if (gap) {
          score += this.gapBias * gap.priority * gap.gapSeverity * 1.2;
        }
      }

      return { state, score, reqWeight, informationGain };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    if (!best) throw new Error('Cannot select a topic: no skill states available.');
    if (scored.every((s) => s.score === 0)) {
      // nothing loaded yet — pick the highest-weight requirement deterministically
      const topReq = [...role.skills].sort((a, b) => b.weight - a.weight)[0];
      const fallback = states.find((s) => s.skillId === topReq.skillId) ?? states[0];
      return { skillId: fallback.skillId, difficulty: this.adaptDifficulty(fallback), reason: 'fallback to highest-weight requirement' };
    }

    return {
      skillId: best.state.skillId,
      difficulty: this.adaptDifficulty(best.state),
      reason:
        `info-gain ${best.informationGain.toFixed(2)} × requirement ${best.reqWeight.toFixed(2)} ` +
        `(est ${best.state.estimate.toFixed(1)}, conf ${best.state.confidence.toFixed(2)}, streak ${recentlyAskedIds.filter((id) => id === best.state.skillId).length})`,
    };
  }

  /** Information gain = uncertainty + confirmed/expected gap pressure. */
  private informationGain(
    state: SkillState,
    requiredLevel: LevelBand | undefined,
    claimsForGaps: readonly { skillId: string; weight: number }[],
  ): number {
    const uncertainty = 1 - state.confidence;
    const claimPressure = claimsForGaps
      .filter((c) => c.skillId === state.skillId)
      .reduce((acc, c) => acc + c.weight, 0);
    const claimTerm = Math.min(1, claimPressure) * 0.35;

    let gapTerm = 0;
    if (requiredLevel) {
      const window = this.taxonomy.assert(state.skillId).competencyWindow[requiredLevel];
      const midpoint = (window.min + window.max) / 2;
      const deficit = Math.max(0, midpoint - state.estimate);
      const severity = deficit / 10;
      gapTerm = severity * state.confidence * 0.6; // real gaps weigh more when we are confident
    }

    return norm.clamp01(uncertainty * 0.6 + gapTerm + claimTerm);
  }

  /** Map the rolling estimate to the difficulty that gives ~70% success. */
  adaptDifficulty(state: SkillState): Difficulty {
    const e = state.estimate;
    let base: Difficulty;
    if (e < 2.5) base = 1;
    else if (e < 4) base = 2;
    else if (e < 5.5) base = 3;
    else if (e < 7) base = 4;
    else base = 5;

    // small exploration jitter around the mapped level
    const jitter = this.random();
    if (jitter < 0.15 && base > 1) return (base - 1) as Difficulty;
    if (jitter > 0.85 && base < 5) return (base + 1) as Difficulty;
    return base;
  }
}

// ---------------------------------------------------------------------------
// Helper Functions for Adaptive Decision Making
// ---------------------------------------------------------------------------

/**
 * Extracts a normalized 0..1 score ratio from any evaluation object shape.
 */
export function extractScoreRatio(evaluation: unknown): number | null {
  if (!evaluation || typeof evaluation !== 'object') return null;
  const ev = evaluation as Record<string, unknown>;

  if (typeof ev.correctness === 'number') {
    return norm.clamp01(ev.correctness / 10);
  }
  if (typeof ev.grade === 'number') {
    return norm.clamp01(ev.grade / 10);
  }
  if (typeof ev.score === 'number') {
    if (ev.score > 10) return norm.clamp01(ev.score / 100);
    if (ev.score > 1) return norm.clamp01(ev.score / 10);
    return norm.clamp01(ev.score);
  }
  if (typeof ev.rubricCompliance === 'number') {
    return norm.clamp01(ev.rubricCompliance);
  }
  return null;
}

function normalizeSkillStates(raw: unknown): SkillState[] {
  if (Array.isArray(raw)) return raw as SkillState[];
  if (raw && typeof raw === 'object') {
    return Object.entries(raw).map(([skillId, val]) => {
      const v = val as any;
      return {
        skillId,
        estimate: typeof v?.estimate === 'number' ? v.estimate : 5,
        confidence: typeof v?.confidence === 'number' ? v.confidence : 0,
        samples: typeof v?.samples === 'number' ? v.samples : 0,
        history: Array.isArray(v?.history) ? v.history : [],
        lastAnsweredAt: v?.lastAnsweredAt ?? null,
      };
    });
  }
  return [];
}

function normalizeRoleRequirement(raw: unknown): RoleRequirement {
  if (!raw || typeof raw !== 'object') {
    return {
      title: 'Software Engineer',
      skills: [{ skillId: 'backend', weight: 1.0, requiredLevel: 'mid' }],
      softRequirements: [],
    };
  }
  const obj = raw as any;
  if ('roleRequirement' in obj && typeof obj.roleRequirement === 'object') {
    return normalizeRoleRequirement(obj.roleRequirement);
  }
  if (Array.isArray(obj.skills)) {
    return {
      title: obj.title ?? 'Software Engineer',
      skills: obj.skills.map((s: any) => ({
        skillId: s.skillId,
        weight: typeof s.weight === 'number' ? s.weight : 1.0,
        requiredLevel: (s.requiredLevel ?? s.level ?? 'mid') as LevelBand,
        kind: s.kind ?? 'required',
      })),
      softRequirements: Array.isArray(obj.softRequirements) ? obj.softRequirements : [],
    };
  }
  return {
    title: 'Software Engineer',
    skills: [{ skillId: 'backend', weight: 1.0, requiredLevel: 'mid' }],
    softRequirements: [],
  };
}

function resolveTopRoleSkill(role: RoleRequirement): string {
  if (role.skills.length === 0) return 'backend';
  const sorted = [...role.skills].sort((a, b) => b.weight - a.weight);
  return sorted[0].skillId;
}

function resolveNextRoleTopic(
  role: RoleRequirement,
  history: readonly any[],
  currentTopic: string,
): string {
  const otherSkills = role.skills.filter((s) => s.skillId !== currentTopic);
  if (otherSkills.length === 0) return currentTopic;

  const scored = otherSkills.map((s) => {
    const askCount = history.filter((h) => {
      const q = typeof h === 'object' && h !== null ? h.question ?? h : h;
      const qSkill = typeof q === 'object' && q !== null ? q.skillId ?? q.target_skill ?? q.topic : undefined;
      return qSkill === s.skillId;
    }).length;
    return { skillId: s.skillId, priority: s.weight / (askCount + 1) };
  });

  scored.sort((a, b) => b.priority - a.priority);
  return scored[0]?.skillId ?? currentTopic;
}

function extractTopicFromLatest(latestEvaluation: unknown): string | undefined {
  if (!latestEvaluation || typeof latestEvaluation !== 'object') return undefined;
  const ev = latestEvaluation as any;
  return ev.skillId ?? ev.target_skill ?? ev.topic;
}

function extractTopicFromHistory(history: readonly any[]): string | undefined {
  if (!Array.isArray(history) || history.length === 0) return undefined;
  const last = history[history.length - 1];
  if (!last || typeof last !== 'object') return undefined;
  const q = last.question ?? last;
  return q.skillId ?? q.target_skill ?? q.topic;
}

function countTopicStreak(history: readonly any[], topic: string): number {
  if (!Array.isArray(history) || history.length === 0) return 0;
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const item = history[i];
    const q = typeof item === 'object' && item !== null ? item.question ?? item : item;
    const skill = typeof q === 'object' && q !== null ? q.skillId ?? q.target_skill ?? q.topic : undefined;
    if (skill === topic) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}