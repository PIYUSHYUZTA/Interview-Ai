import { describe, expect, it } from 'vitest';
import { InterviewPlanner } from './InterviewPlanner.js';
import { ProfileBuilder } from '../understanding/ProfileBuilder.js';
import { JobRequirementIntelligence } from '../jobs/JobRequirementIntelligence.js';
import type { RoundTemplate } from '../types.js';

describe('InterviewPlanner (Module 6)', () => {
  const planner = new InterviewPlanner();
  const profileBuilder = new ProfileBuilder();
  const jobIntelligence = new JobRequirementIntelligence();

  const candidateProfile = profileBuilder.build({
    resumeText: `
Piyush Sharma
Senior Fullstack Engineer with 6 years of experience building Node.js, TypeScript, and React web apps.

Skills:
- Node.js, TypeScript, React, PostgreSQL, REST APIs

Experience:
Senior Engineer at Tech Corp (2021 - Present)
- Designed and built backend APIs with Node.js and TypeScript.
- Worked on database performance optimization using PostgreSQL.
- Handled production outages and team technical mentorship.
`,
  });

  const jdText = `
Senior Backend & Infrastructure Engineer

Requirements:
- Strong Node.js and TypeScript experience
- Backend architecture & databases (PostgreSQL)
- Cloud deployment & DevOps (AWS, Docker, Kubernetes)
- System design and microservices
`;

  const gapOutput = jobIntelligence.analyze(jdText);
  const comparison = jobIntelligence.compare({ profile: candidateProfile, role: gapOutput });

  it('builds a complete 4-round default interview plan with all required evaluation criteria', () => {
    const plan = planner.plan({
      profile: candidateProfile,
      role: gapOutput,
      comparison,
    });

    expect(plan.requiredRoundsCount).toBe(4);
    expect(plan.rounds.length).toBe(4);
    expect(plan.totalQuestionBudget).toBe(16);

    const [r1, r2, r3, r4] = plan.rounds;

    // Round 1 — HR / Intro
    expect(r1.type).toBe('hr_intro');
    expect(r1.name).toContain('Round 1');
    expect(r1.evaluationCriteria).toContain('communication');
    expect(r1.evaluationCriteria).toContain('motivation');
    expect(r1.evaluationCriteria).toContain('background');
    expect(r1.questionTypes).toContain('behavioral');

    // Round 2 — Technical
    expect(r2.type).toBe('technical');
    expect(r2.name).toContain('Round 2');
    expect(r2.evaluationCriteria).toContain('technical knowledge');
    expect(r2.evaluationCriteria).toContain('resume claims');
    expect(r2.evaluationCriteria).toContain('technical depth');

    // Round 3 — Logic / Problem Solving / Project Building
    expect(r3.type).toBe('logic_problem_solving');
    expect(r3.name).toContain('Round 3');
    expect(r3.evaluationCriteria).toContain('decomposition');
    expect(r3.evaluationCriteria).toContain('algorithms');
    expect(r3.evaluationCriteria).toContain('trade-offs');

    // Round 4 — Behavioral / Out-of-the-Box
    expect(r4.type).toBe('behavioral_out_of_box');
    expect(r4.name).toContain('Round 4');
    expect(r4.evaluationCriteria).toContain('self-awareness');
    expect(r4.evaluationCriteria).toContain('failure handling');
    expect(r4.evaluationCriteria).toContain('teamwork');
    expect(r4.evaluationCriteria).toContain('creativity');
  });

  it('distributes validation gaps, candidate topics, and role topics across rounds', () => {
    const plan = planner.plan({
      profile: candidateProfile,
      role: gapOutput,
      comparison,
    });

    const allValidation = plan.rounds.flatMap((r) => r.areasRequiringValidation);
    expect(allValidation.length).toBeGreaterThan(0);

    const allCandidateTopics = plan.rounds.flatMap((r) => r.candidateSpecificTopics);
    expect(allCandidateTopics.length).toBeGreaterThan(0);

    const allRoleTopics = plan.rounds.flatMap((r) => r.roleSpecificTopics);
    expect(allRoleTopics.length).toBeGreaterThan(0);
  });

  it('supports custom round selection and customized question budgets', () => {
    const plan = planner.plan(
      { profile: candidateProfile, role: gapOutput },
      {
        requiredRounds: ['technical', 'logic_problem_solving'],
        questionsPerRound: 3,
      },
    );

    expect(plan.requiredRoundsCount).toBe(2);
    expect(plan.rounds.map((r) => r.type)).toEqual(['technical', 'logic_problem_solving']);
    expect(plan.totalQuestionBudget).toBe(6);
  });

  it('supports registering and executing custom round templates for future interview types', () => {
    const customTemplate: RoundTemplate = {
      type: 'pair_programming',
      name: 'Round 5 — Live Pair Programming',
      description: 'Collaborative code writing, debugging, and live feedback response.',
      defaultQuestionTypes: ['code'],
      evaluationCriteria: ['coding fluency', 'debugging', 'collaboration', 'feedback response'],
      defaultDifficultyRange: { min: 3, max: 5 },
    };

    planner.registerTemplate(customTemplate);

    const plan = planner.plan(
      { profile: candidateProfile, role: gapOutput },
      { requiredRounds: ['technical', 'pair_programming'] },
    );

    expect(plan.rounds.length).toBe(2);
    expect(plan.rounds[1].type).toBe('pair_programming');
    expect(plan.rounds[1].name).toBe('Round 5 — Live Pair Programming');
    expect(plan.rounds[1].evaluationCriteria).toContain('coding fluency');
  });
});
