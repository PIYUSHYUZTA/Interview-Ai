import { describe, expect, it } from 'vitest';
import { buildDetailedReport, transcriptAnswer } from './DetailedReport.js';
import { InterviewStateMachine } from '../core/session/InterviewStateMachine.js';
import { InterviewPlanner } from '../core/planner/InterviewPlanner.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';
import { GapAnalyzer } from '../core/improve/GapAnalyzer.js';
import { RoadmapPlanner } from '../core/improve/RoadmapPlanner.js';
import { ScoringEngine, SCORING_WEIGHTS } from '../core/score/ScoringEngine.js';
import { buildProfile, STRONG_RESUME, backendRole } from '../testSupport/fixtures.js';

describe('transcript-grounded detailed report', () => {
  it('identifies omissions using the actual answer and keeps examples distinct from evidence', async () => {
    const profile = buildProfile(STRONG_RESUME);
    const role = backendRole();
    const plan = new InterviewPlanner().plan({ profile, role }, { requiredRounds: ['hr_intro'], questionsPerRound: 2 });
    const session = new InterviewStateMachine({ profile, role, interviewPlan: plan, numRounds: 1, roundConfig: { questionBudget: 2, maxSameSkillInRow: 2 } }, { provider: new DeterministicProvider(), seed: 42 });
    session.prepare();
    session.nextQuestion();
    const actual = 'We built things with Node and React. The team did various tasks.';
    await session.submitAnswer({ text: actual });
    session.nextQuestion(); await session.submitAnswer({ text: 'I do not know.' });
    const gaps = new GapAnalyzer().analyze(role, session.skillStates, { records: session.questionHistory.map((entry) => ({ id: entry.question.id, skillId: entry.question.skillId, supportStrength: entry.evaluation!.grade / 10 })) });
    const roadmap = new RoadmapPlanner().plan(gaps, role);
    const score = ScoringEngine.calculate(session.questionHistory.flatMap((entry) => entry.evaluation ? [entry.evaluation] : []));
    const report = buildDetailedReport(session, gaps, roadmap, score.overallScore * 10);
    const first = report.answerCoaching[0];
    expect(first.clarity.map((issue) => issue.issue)).toContain('Your own contribution is not explicit in this answer.');
    expect(first.clarity.some((issue) => issue.issue.includes('things'))).toBe(true);
    expect(first.clarity.every((issue) => actual.includes(issue.excerpt))).toBe(true);
    expect(first.beforeAfter.before).toBe('We built things with Node and React.');
    expect(first.beforeAfter.after).toContain('[state your actual responsibility]');
    expect(first.example.kind).toBe('scaffold');
    expect(first.example.wording).toContain(role.title);
    expect(first.example.label).toContain('not the candidate');
    expect(transcriptAnswer(session.questionHistory[0])).toBe(actual);
    expect(report.scoringWeights).toEqual(SCORING_WEIGHTS);
    expect(report.difficultyProgression.map((item) => item.difficulty)).toEqual(session.questionHistory.map((entry) => entry.question.difficulty));
    expect(report.learningPlan.length).toBeLessThanOrEqual(5);
    for (const step of report.learningPlan) {
      expect(step.currentProficiency).toBe(session.skillStates.find((skill) => skill.skillId === step.skillId)!.samples ? session.skillStates.find((skill) => skill.skillId === step.skillId)!.estimate : null);
      expect(step.sequence.length).toBeGreaterThan(1);
      expect(step.successCriteria).toContain('Show a reproducible example or implementation with an edge-case test.');
    }
    expect(JSON.stringify(report)).not.toContain('lastSelectionRationale');
  });
});
