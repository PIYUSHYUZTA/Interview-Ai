import { InterviewPlanner } from '../planner/InterviewPlanner.js';
import { describe, expect, it } from 'vitest';
import { buildProfile, STRONG_RESUME } from '../../testSupport/fixtures.js';
import { DeterministicProvider } from '../provider/DeterministicProvider.js';
import type { CandidateAnswer, Question, RoleRequirement, SessionConfig } from '../types.js';
import { InterviewSession } from './InterviewSession.js';
import { InterviewStateMachine } from './InterviewStateMachine.js';

const role: RoleRequirement = {
  title: 'Backend Engineer',
  skills: [{ skillId: 'backend', weight: 1, requiredLevel: 'mid' }],
  softRequirements: [],
};

function makeSession(seed = 17): InterviewSession {
  const config: SessionConfig = {
    profile: buildProfile(STRONG_RESUME),
    role,
    numRounds: 1,
    roundConfig: { questionBudget: 8, maxSameSkillInRow: 1 },
  };
  return new InterviewSession(config, { provider: new DeterministicProvider(), seed });
}

function answer(question: Question, quality: 'strong' | 'partial' | 'weak'): CandidateAnswer {
  if (question.type === 'mcq') {
    return {
      text: '',
      selectedChoiceIndex: quality === 'strong' ? question.correctChoiceIndex : 0,
      timestamp: Date.now(),
    };
  }

  if (quality === 'weak') return { text: 'I do not know.', timestamp: Date.now() };

  const hints = quality === 'strong' ? question.rubricHints : question.rubricHints.slice(0, 2);
  const explanation =
    'First, I designed and shipped this in production because concurrency creates failure modes. ' +
    'Secondly, we measured latency and compared the trade-off and complexity. ' +
    'In summary, my team deployed the change and documented the result. ';
  return {
    text: `${hints.join('. ')}. ${explanation.repeat(4)}`,
    timestamp: Date.now(),
  };
}

describe('InterviewSession adaptive end-to-end path', () => {
  it('uses strong and weak evaluations to choose deeper versus foundational follow-ups', async () => {
    const strongSession = makeSession();
    const weakSession = makeSession();
    const strongFirst = strongSession.nextQuestion();
    const weakFirst = weakSession.nextQuestion();
    expect(strongFirst.id).toBe(weakFirst.id);

    const strongGrade = await strongSession.submitAnswer(strongFirst, answer(strongFirst, 'strong'));
    const weakGrade = await weakSession.submitAnswer(weakFirst, answer(weakFirst, 'weak'));
    const strongFollowUp = strongSession.nextQuestion();
    const weakFollowUp = weakSession.nextQuestion();

    expect(strongGrade.grade).toBeGreaterThanOrEqual(8.5);
    expect(weakGrade.grade).toBeLessThan(5);
    expect(strongFollowUp.difficulty).toBeGreaterThan(weakFollowUp.difficulty);
    expect(strongFollowUp.prompt).toContain('higher-complexity');
    expect(weakFollowUp.prompt).toContain('fundamentals');
    expect(strongSession.stateFor('backend')?.samples).toBe(1);
    expect(weakSession.stateFor('backend')?.samples).toBe(1);
  });

  it('uses the same evaluation-driven policy in the API state machine', async () => {
    const makeMachine = () => {
      const machine = new InterviewStateMachine(
        {
          profile: buildProfile(STRONG_RESUME),
          role,
          numRounds: 1,
          roundConfig: { questionBudget: 8, maxSameSkillInRow: 1 },
        },
        { provider: new DeterministicProvider(), seed: 17 },
      );
      machine.prepare();
      return machine;
    };

    const strong = makeMachine();
    const weak = makeMachine();
    const strongQuestion = strong.nextQuestion();
    const weakQuestion = weak.nextQuestion();
    const strongAnswer = answer(strongQuestion, 'strong');
    const weakAnswer = answer(weakQuestion, 'weak');
    await strong.submitAnswer({ text: strongAnswer.text, selectedChoiceIndex: strongAnswer.selectedChoiceIndex });
    await weak.submitAnswer({ text: weakAnswer.text, selectedChoiceIndex: weakAnswer.selectedChoiceIndex });
    const strongFollowUp = strong.nextQuestion();
    const weakFollowUp = weak.nextQuestion();

    expect(strongFollowUp.difficulty).toBeGreaterThan(weakFollowUp.difficulty);
    expect(strongFollowUp.prompt).toContain('higher-complexity');
    expect(weakFollowUp.prompt).toContain('fundamentals');
  });

  it('names an unaddressed rubric concept in a partial-answer follow-up', async () => {
    const session = makeSession();
    const question = session.nextQuestion();
    const evaluation = await session.submitAnswer(question, answer(question, 'partial'));
    const followUp = session.nextQuestion();
    const missingCue = question.rubricHints[2];

    expect(evaluation.rationale).toContain(`Unaddressed rubric cues: ${missingCue}`);
    expect(followUp.prompt).toContain(missingCue);
    expect(followUp.prompt).toContain('focused example');
  });

  it('keeps a rolling estimate after one weak answer and varies questions after exhausting templates', async () => {
    const session = makeSession(23);
    const firstPrompts: string[] = [];
    let stateEstimate = 5;

    for (let i = 0; i < 4; i += 1) {
      const question = session.nextQuestion();
      firstPrompts.push(question.prompt);
      await session.submitAnswer(question, answer(question, 'strong'));
      stateEstimate = session.stateFor('backend')!.estimate;
    }

    const beforeWeak = stateEstimate;
    const weakQuestion = session.nextQuestion();
    firstPrompts.push(weakQuestion.prompt);
    await session.submitAnswer(weakQuestion, answer(weakQuestion, 'weak'));
    const afterWeak = session.stateFor('backend')!.estimate;

    expect(beforeWeak).toBeGreaterThan(6);
    expect(afterWeak).toBeGreaterThan(4);
    expect(afterWeak).toBeGreaterThan(beforeWeak - 1.5);
    expect(new Set(firstPrompts).size).toBe(firstPrompts.length);
    expect(firstPrompts[3]).toContain('different angle');
  });
});


describe('planned live question selection', () => {
  function plannedConfig(min: 1 | 2 | 3 = 2, max: 3 | 4 = 4): SessionConfig {
    const profile = buildProfile(STRONG_RESUME);
    const multiRole: RoleRequirement = { ...role, skills: [...role.skills, { skillId: 'databases', weight: 10, requiredLevel: 'senior' }] };
    const plan = new InterviewPlanner().plan({ profile, role: multiRole }, { requiredRounds: ['technical'], questionsPerRound: 8 });
    return { profile, role: multiRole, numRounds: 1, roundConfig: { questionBudget: 8, maxSameSkillInRow: 3 },
      interviewPlan: { ...plan, rounds: [{ ...plan.rounds[0], targetSkills: ['backend'], questionTypes: ['conceptual'], difficultyRange: { min, max } }] } };
  }

  for (const mode of ['session', 'machine'] as const) {
    it(`${mode}: obeys target skill, types and range while strong and weak answers diverge`, async () => {
      const create = () => {
        const config = plannedConfig();
        if (mode === 'session') return new InterviewSession(config, { provider: new DeterministicProvider(), seed: 17 });
        const machine = new InterviewStateMachine(config, { provider: new DeterministicProvider(), seed: 17 });
        machine.prepare();
        return machine;
      };
      const paths: Question[] = [];
      for (const quality of ['strong', 'weak'] as const) {
        const session = create();
        const first = session.nextQuestion();
        expect(first.skillId).toBe('backend');
        expect(first.type).toBe('conceptual');
        const response = answer(first, quality);
        const evaluation = session instanceof InterviewSession ? await session.submitAnswer(first, response) : await session.submitAnswer(response);
        expect(quality === 'strong' ? evaluation.grade >= 8.5 : evaluation.grade < 5).toBe(true);
        const next = session.nextQuestion();
        expect(next.skillId).toBe('backend');
        expect(next.type).toBe('conceptual');
        expect(next.difficulty).toBeGreaterThanOrEqual(2);
        expect(next.difficulty).toBeLessThanOrEqual(4);
        expect(next.prompt).not.toBe(first.prompt);
        expect(next.prompt).toContain(quality === 'strong' ? 'higher-complexity' : 'fundamentals');
        paths.push(next);
      }
      expect(paths[0].difficulty).toBeGreaterThan(paths[1].difficulty);
    });
  }

  it('records deterministic boundary conflicts and preserves foundational/deeper probes at the limit', async () => {
    for (const quality of ['strong', 'weak'] as const) {
      const session = new InterviewSession(plannedConfig(3, 3), { provider: new DeterministicProvider(), seed: 17 });
      const first = session.nextQuestion();
      await session.submitAnswer(first, answer(first, quality));
      const next = session.nextQuestion();
      expect(next.difficulty).toBe(3);
      expect(session.lastSelectionRationale).toContain('bounds requested');
      expect(next.prompt).toContain(quality === 'strong' ? 'higher-complexity' : 'fundamentals');
    }
  });

  it('uses the new round targets instead of carrying a weak prior-round topic forward', async () => {
    const config = plannedConfig();
    const plan = config.interviewPlan!;
    const session = new InterviewSession({ ...config, numRounds: 2, interviewPlan: { ...plan, rounds: [plan.rounds[0], { ...plan.rounds[0], roundNumber: 2, targetSkills: ['databases'] }] } }, { provider: new DeterministicProvider() });
    const first = session.nextQuestion();
    await session.submitAnswer(first, answer(first, 'weak'));
    session.beginRound();
    expect(session.nextQuestion().skillId).toBe('databases');
    expect(session.lastSelectionRationale).toContain('excludes adaptive topic backend');
  });

  it('probes a partial answer within the plan and preserves the rolling estimate after an isolated weak answer', async () => {
    const session = new InterviewSession(plannedConfig(), { provider: new DeterministicProvider(), seed: 17 });
    const first = session.nextQuestion();
    const response = answer(first, 'partial');
    const partial = await session.submitAnswer(first, { ...response, text: response.text.replace(first.rubricHints[1], '') });
    expect(partial.grade).toBeGreaterThanOrEqual(5);
    expect(partial.grade).toBeLessThan(8);
    const probe = session.nextQuestion();
    expect(probe.prompt).toContain(first.rubricHints[2]);
    expect(probe.difficulty).toBe(first.difficulty);
    await session.submitAnswer(probe, answer(probe, 'strong'));
    for (let i = 0; i < 3; i++) {
      const question = session.nextQuestion();
      await session.submitAnswer(question, answer(question, 'strong'));
    }
    const before = session.stateFor('backend')!.estimate;
    const question = session.nextQuestion();
    await session.submitAnswer(question, answer(question, 'weak'));
    expect(before - session.stateFor('backend')!.estimate).toBeLessThan(1.5);
  });

  it('can execute all four planned rounds, including a round requiring a design question', async () => {
    const profile = buildProfile(STRONG_RESUME);
    const plan = new InterviewPlanner().plan({ profile, role }, { questionsPerRound: 1 });
    const machine = new InterviewStateMachine({ profile, role, interviewPlan: plan, numRounds: 4, roundConfig: { questionBudget: 9, maxSameSkillInRow: 2 } }, { provider: new DeterministicProvider() });
    machine.prepare();
    for (const round of plan.rounds) {
      const question = machine.nextQuestion();
      expect(round.targetSkills).toContain(question.skillId);
      expect(round.questionTypes).toContain(question.type);
      expect(question.difficulty).toBeGreaterThanOrEqual(round.difficultyRange.min);
      expect(question.difficulty).toBeLessThanOrEqual(round.difficultyRange.max);
      expect(machine.toPublicState().progress.questionBudgetInRound).toBe(1);
      await machine.submitAnswer(answer(question, 'weak'));
      if (round.roundNumber < 4) machine.advanceRound();
    }
    expect(machine.state).toBe('COMPLETED');
  });

  it('retains plan and avoids repeated questions/IDs across state-machine reloads', async () => {
    let machine = new InterviewStateMachine(plannedConfig(), { provider: new DeterministicProvider() });
    machine.prepare();
    const seen = new Set<string>();
    const prompts = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const question = machine.nextQuestion();
      expect(seen.has(question.id)).toBe(false);
      expect(prompts.has(question.prompt)).toBe(false);
      seen.add(question.id); prompts.add(question.prompt);
      await machine.submitAnswer(answer(question, 'weak'));
      machine = InterviewStateMachine.deserialize(machine.serialize(), { provider: new DeterministicProvider() });
      expect(machine.config.interviewPlan?.rounds[0].targetSkills).toEqual(['backend']);
    }
  });
});
