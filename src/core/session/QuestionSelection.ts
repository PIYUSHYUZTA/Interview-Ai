import type { CandidateAnswer, Difficulty, Question, QuestionEvaluation, QuestionType, SessionConfig, SkillState } from '../types.js';
import { AdaptiveEngine } from '../adaptation/AdaptiveEngine.js';
import { QuestionGenerator } from '../adaptation/QuestionGenerator.js';

/** Shared boundary between adaptive recommendations and mandatory round constraints. */
export function selectSessionQuestion(input: {
  config: SessionConfig;
  round: number;
  states: readonly SkillState[];
  history: readonly { question: Question; evaluation: QuestionEvaluation | null; answer: CandidateAnswer | null }[];
  recentSkills: readonly string[];
  claimWeights: readonly { skillId: string; weight: number }[];
  preferredTypes: readonly QuestionType[];
  adaptive: AdaptiveEngine;
  generator: QuestionGenerator;
}): { question: Question; rationale: string } {
  const { config, states, history, adaptive, generator } = input;
  const planned = config.interviewPlan?.rounds.find((r) => r.roundNumber === input.round);
  if (config.interviewPlan && !planned) throw new Error(`No plan for round ${input.round}.`);
  const eligible = planned ? states.filter((s) => planned.targetSkills.includes(s.skillId)) : states;
  if (!eligible.length) throw new Error(`No initialized target skills for round ${input.round}.`);
  const role = { ...config.role, skills: config.role.skills.filter((s) => eligible.some((e) => e.skillId === s.skillId)) };
  const targets = (config.practicePriorities ?? []).filter((p) => !states.find((s) => s.skillId === p.skillId)?.samples).map((p) => ({ ...p, label: p.skillId, reason: 'Previously observed practice gap', kind: 'required' as const, weight: p.priority }));
  const selection = adaptive.selectNext(eligible, role, input.recentSkills, input.claimWeights, { targets });
  let { skillId, difficulty } = selection;
  const reasons = [selection.reason];
  const prior = targets.find((p) => p.skillId === skillId);
  if (prior) reasons.push(`Practice priority from completed interview ${prior.sourceSessionId}; current answers take precedence.`);
  const latest = [...history].reverse().find((h) => h.evaluation);
  if (latest?.evaluation) {
    const decision = adaptive.decide({
      latest_evaluation: latest.evaluation,
      rolling_skill_state: states,
      current_difficulty: latest.question.difficulty * 2,
      full_history: history.map((h) => ({ question: h.question, ...(h.answer ? { answer: h.answer } : {}), ...(h.evaluation ? { evaluation: h.evaluation } : {}) })),
      target_role: role,
      current_topic: latest.question.skillId,
    });
    reasons.push(decision.rationale);
    if (eligible.some((s) => s.skillId === decision.next_topic)) skillId = decision.next_topic;
    else reasons.push(`Round ${input.round} excludes adaptive topic ${decision.next_topic}; selected eligible target ${skillId}.`);
    if (skillId === latest.question.skillId) {
      difficulty = Math.max(1, Math.min(5, latest.question.difficulty + Math.sign(decision.next_difficulty - latest.question.difficulty * 2))) as Difficulty;
    }
  }
  if (planned) {
    const limit = Math.max(1, config.roundConfig.maxSameSkillInRow);
    const streak = input.recentSkills.slice(-limit);
    const alternatives = eligible.filter((s) => s.skillId !== skillId);
    if (alternatives.length && streak.length === limit && streak.every((id) => id === skillId)) {
      const rotated = adaptive.selectNext(alternatives, role, input.recentSkills, input.claimWeights, { targets });
      reasons.push(`Round coverage limit ${limit} reached for ${skillId}; continue with ${rotated.skillId} using its rolling state.`);
      skillId = rotated.skillId;
      difficulty = rotated.difficulty;
    }
    const bounded = Math.max(planned.difficultyRange.min, Math.min(planned.difficultyRange.max, difficulty)) as Difficulty;
    if (bounded !== difficulty) reasons.push(`Round difficulty ${planned.difficultyRange.min}–${planned.difficultyRange.max} bounds requested ${difficulty} to ${bounded}; retain performance-driven follow-up within that bound.`);
    difficulty = bounded;
  }
  const generated = generator.generateDynamic({
    candidateProfile: config.profile, roleRequirements: config.role,
    currentRound: planned ?? input.round, rollingSkillState: states,
    questionHistory: history, targetSkill: skillId, currentDifficulty: difficulty,
    recentEvaluation: latest?.question.skillId === skillId ? latest.evaluation : null,
    interviewConstraints: { allowedTypes: planned?.questionTypes, preferredTypes: input.preferredTypes },
  });
  return { question: generated.question, rationale: reasons.join(' ') };
}
