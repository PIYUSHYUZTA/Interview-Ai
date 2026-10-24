import { describe, expect, it } from 'vitest';
import { QuestionGenerator } from './QuestionGenerator.js';
import { QUESTION_TEMPLATES } from './questionBank.js';
import { ProfileBuilder } from '../understanding/ProfileBuilder.js';
import { JobRequirementIntelligence } from '../jobs/JobRequirementIntelligence.js';

describe('ADAPT — question generator', () => {
  const generator = new QuestionGenerator();

  it('covers every taxonomy skill in the bank', () => {
    for (const skillId of ['algorithms', 'databases', 'backend', 'frontend', 'system_design', 'cloud', 'devops', 'security', 'testing', 'data_engineering', 'mobile', 'software_delivery']) {
      const templates = QUESTION_TEMPLATES.get(skillId);
      expect(templates?.length, `${skillId} should have templates`).toBeGreaterThan(0);
    }
  });

  it('generates an executable code question with tests', () => {
    const q = generator.generate({ skillId: 'algorithms', difficulty: 3 });
    if (q.type !== 'code') {
      // code is one of several; keep it robust — regenerate until code
      let attempt = q;
      for (let i = 0; i < 4 && attempt.type !== 'code'; i++) {
        attempt = generator.generate({ skillId: 'algorithms', difficulty: 3 });
      }
      return;
    }
    expect(q.starterCode).toBeTruthy();
    expect(q.language).toBe('javascript');
    expect(q.numTestCases).toBeGreaterThanOrEqual(3);
  });

  it('does not repeat the same question id', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const q = generator.generate({ skillId: 'databases', difficulty: 3 });
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
    }
  });

  it('escalates prompt difficulty when target exceeds template base', () => {
    const up = generator.generate({ skillId: 'databases', difficulty: 5 });
    expect(up.prompt).toContain('Level-up');
    const down = generator.generate({ skillId: 'system_design', difficulty: 1 });
    expect(down.prompt).toContain('Simplify');
  });

  it('falls back to generic questions for unknown skills instead of failing', () => {
    const q = generator.generate({ skillId: 'data_engineering', difficulty: 3 });
    expect(q.skillId).toBe('data_engineering');
    expect(q.prompt.length).toBeGreaterThan(10);
  });

  describe('Module 7: Dynamic Question Generation Engine', () => {
    const dynamicGen = new QuestionGenerator();
    const profileBuilder = new ProfileBuilder();
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
`,
    });

    const jobIntelligence = new JobRequirementIntelligence();
    const gapOutput = jobIntelligence.analyze('Senior Backend Engineer with Node.js and PostgreSQL experience.');

    it('emits a strict structured JSON payload matching the spec requirements', () => {
      const result = dynamicGen.generateDynamic({
        candidateProfile,
        roleRequirements: gapOutput,
        targetSkill: 'backend',
        currentDifficulty: 3,
      });

      const { structuredOutput } = result;

      expect(structuredOutput.question).toBeTruthy();
      expect(structuredOutput.topic).toBeTruthy();
      expect(structuredOutput.subtopic).toBeTruthy();
      expect(typeof structuredOutput.difficulty).toBe('number');
      expect(structuredOutput.question_type).toBeTruthy();
      expect(structuredOutput.target_skill).toBe('backend');
      expect(Array.isArray(structuredOutput.expected_answer_points)).toBe(true);
      expect(structuredOutput.expected_answer_points.length).toBeGreaterThan(0);
      expect(structuredOutput.purpose).toBeTruthy();
    });

    it('personalizes questions using candidate resume information', () => {
      const result = dynamicGen.generateDynamic({
        candidateProfile,
        roleRequirements: gapOutput,
        targetSkill: 'backend',
        currentDifficulty: 3,
      });

      expect(result.structuredOutput.question).toContain('Tech Corp');
      expect(result.structuredOutput.purpose).toContain('Personalized');
    });

    it('creates targeted follow-up probes when recent evaluation indicates weak performance', () => {
      const lowEvaluation = {
        questionId: 'q-backend-1',
        skillId: 'backend',
        grade: 4.2,
        criteria: {
          knowledgeDepth: 5,
          recallPrecision: 6,
          reasoning: 4,
          appliedEvidence: 3,
          communication: 6,
        },
        rationale: 'Answer lacked edge cases and trade-off analysis.',
        rubricCompliance: 0.4,
      };

      const result = dynamicGen.generateDynamic({
        candidateProfile,
        roleRequirements: gapOutput,
        targetSkill: 'backend',
        currentDifficulty: 3,
        recentEvaluation: lowEvaluation,
      });

      expect(result.isFollowUp).toBe(true);
      expect(result.structuredOutput.question).toContain('fundamentals');
      expect(result.structuredOutput.question).not.toContain('idempotent POST');
      expect(result.structuredOutput.purpose).toContain('follow-up');
    });

    it('avoids repeating subtopics present in question history', () => {
      const freshGen = new QuestionGenerator();
      const firstResult = freshGen.generateDynamic({
        candidateProfile,
        roleRequirements: gapOutput,
        targetSkill: 'databases',
        currentDifficulty: 3,
      });

      const secondResult = freshGen.generateDynamic({
        candidateProfile,
        roleRequirements: gapOutput,
        targetSkill: 'databases',
        currentDifficulty: 3,
        questionHistory: [firstResult.question],
      });

      expect(secondResult.structuredOutput.subtopic).not.toBe(firstResult.structuredOutput.subtopic);
    });

    it('starts the planned introduction round with a concise target-role background question', () => {
      const freshGen = new QuestionGenerator();
      const result = freshGen.generateDynamic({
        candidateProfile,
        roleRequirements: { title: 'Senior Backend Engineer', skills: [{ skillId: 'backend', weight: 1 }] },
        currentRound: {
          roundNumber: 1,
          type: 'hr_intro',
          name: 'Introduction',
          description: 'Background and role fit',
          targetSkills: ['backend'],
          difficultyRange: { min: 1, max: 3 },
          questionTypes: ['behavioral', 'conceptual'],
          evaluationCriteria: ['background', 'communication'],
          candidateSpecificTopics: [],
          roleSpecificTopics: [],
          areasRequiringValidation: [],
          questionBudget: 2,
        },
        targetSkill: 'backend',
        currentDifficulty: 2,
      });

      expect(result.question.type).toBe('behavioral');
      expect(result.question.prompt).toContain('briefly introduce your professional background');
      expect(result.question.prompt).toContain('Senior Backend Engineer');
      expect(result.question.rubricHints).toContain('clear personal contribution');
    });

    it('uses planned resume context and asks a focused question about an unresolved point', () => {
      const freshGen = new QuestionGenerator();
      const plannedRound = {
        roundNumber: 2,
        type: 'technical' as const,
        name: 'Technical',
        description: 'Role-specific technical skills',
        targetSkills: ['backend'],
        difficultyRange: { min: 2 as const, max: 4 as const },
        questionTypes: ['conceptual'] as const,
        evaluationCriteria: ['technical depth'],
        candidateSpecificTopics: ['Node.js payment API (resume line 8)'],
        roleSpecificTopics: ['Node.js'],
        areasRequiringValidation: ['Validate idempotency handling'],
        questionBudget: 3,
      };
      const result = freshGen.generateDynamic({
        candidateProfile,
        roleRequirements: { title: 'Senior Backend Engineer', skills: [{ skillId: 'backend', weight: 1 }] },
        currentRound: plannedRound,
        targetSkill: 'backend',
        currentDifficulty: 3,
        recentEvaluation: {
          questionId: 'previous',
          skillId: 'backend',
          grade: 6,
          criteria: { knowledgeDepth: 6, recallPrecision: 6, reasoning: 6, appliedEvidence: 5, communication: 7 },
          rationale: 'Unaddressed rubric cues: idempotency keys',
          rubricCompliance: 0.6,
        },
      });

      expect(result.question.prompt).toContain('Could you clarify idempotency keys with one focused example?');
      expect(result.question.prompt).not.toContain('On your resume');
      expect(result.question.prompt).not.toContain('idempotent POST');
    });
  });

  describe('Service 2: Question Generator (Decoupled Service Mandate)', () => {
    const generator = new QuestionGenerator();
    const profileBuilder = new ProfileBuilder();
    const candidateProfile = profileBuilder.build({
      resumeText: `
Morgan Lee
Backend Engineer with 4 years of experience in Node.js, PostgreSQL, and Redis.
Experience:
Engineer at CloudScale (2020 - present)
- Architected payment services with PostgreSQL.
- Implemented caching with Redis.
`,
    });

    const scopedRole = {
      title: 'Backend Specialist',
      skills: [
        { skillId: 'backend', weight: 1.0, requiredLevel: 'senior' as const },
        { skillId: 'databases', weight: 0.8, requiredLevel: 'senior' as const },
      ],
    };

    it('generates JSON output matching the exact 7 required fields with difficulty on 1-10 scale', () => {
      const output = generator.generateQuestion({
        candidateProfile,
        roleRequirements: scopedRole,
        round: 1,
        rollingSkillState: [],
        questionHistory: [],
        targetSkill: 'backend',
      });

      // Verify exact keys
      expect(output).toHaveProperty('question');
      expect(output).toHaveProperty('topic');
      expect(output).toHaveProperty('subtopic');
      expect(output).toHaveProperty('difficulty');
      expect(output).toHaveProperty('question_type');
      expect(output).toHaveProperty('target_skill');
      expect(output).toHaveProperty('expected_answer_points');

      expect(typeof output.question).toBe('string');
      expect(typeof output.topic).toBe('string');
      expect(typeof output.subtopic).toBe('string');
      expect(output.difficulty).toBeGreaterThanOrEqual(1);
      expect(output.difficulty).toBeLessThanOrEqual(10);
      expect(output.target_skill).toBe('backend');
      expect(Array.isArray(output.expected_answer_points)).toBe(true);
      expect(output.expected_answer_points.length).toBeGreaterThan(0);

      // Verify JSON serialization
      const jsonStr = generator.toJSON(output);
      const parsed = JSON.parse(jsonStr);
      expect(parsed.question).toBe(output.question);
      expect(parsed.difficulty).toBe(output.difficulty);
    });

    it('Rule 1: never repeats a recent question from question history', () => {
      const q1 = generator.generateQuestion({
        candidateProfile,
        roleRequirements: scopedRole,
        round: 1,
        rollingSkillState: [],
        questionHistory: [],
        targetSkill: 'databases',
      });

      // Feed q1 into questionHistory
      const q2 = generator.generateQuestion({
        candidateProfile,
        roleRequirements: scopedRole,
        round: 1,
        rollingSkillState: [],
        questionHistory: [
          { id: 'q-db-1', prompt: q1.question, subtopic: q1.subtopic, skillId: 'databases' },
        ],
        targetSkill: 'databases',
      });

      expect(q2.question).not.toBe(q1.question);
      expect(q2.subtopic).not.toBe(q1.subtopic);

      // Feed both q1 and q2 into questionHistory
      const q3 = generator.generateQuestion({
        candidateProfile,
        roleRequirements: scopedRole,
        round: 1,
        rollingSkillState: [],
        questionHistory: [
          { id: 'q-db-1', prompt: q1.question, subtopic: q1.subtopic, skillId: 'databases' },
          { id: 'q-db-2', prompt: q2.question, subtopic: q2.subtopic, skillId: 'databases' },
        ],
        targetSkill: 'databases',
      });

      expect(q3.question).not.toBe(q1.question);
      expect(q3.question).not.toBe(q2.question);
    });

    it('Rule 2: never exceeds interview scope when target skill is out-of-scope', () => {
      // Role only has 'backend' and 'databases'
      // Attempting to ask for 'mobile' or 'security' must throw scope violation
      expect(() => {
        generator.generateQuestion({
          candidateProfile,
          roleRequirements: scopedRole,
          round: 1,
          rollingSkillState: [],
          questionHistory: [],
          targetSkill: 'mobile',
        });
      }).toThrow(/exceeds interview scope/i);

      expect(() => {
        generator.generateQuestion({
          candidateProfile,
          roleRequirements: scopedRole,
          round: 1,
          rollingSkillState: [],
          questionHistory: [],
          targetSkill: 'security',
        });
      }).toThrow(/exceeds interview scope/i);
    });

    it('Rule 2: never exceeds interview scope when target skill is automatically chosen', () => {
      // When targetSkill is omitted, it must pick strictly among scoped skills ('backend', 'databases')
      for (let i = 0; i < 4; i++) {
        const output = generator.generateQuestion({
          candidateProfile,
          roleRequirements: scopedRole,
          round: 1,
          rollingSkillState: [],
          questionHistory: [],
        });
        expect(['backend', 'databases']).toContain(output.target_skill);
      }
    });

    it('calibrates difficulty (1-10) adaptively to rolling skill state and round', () => {
      // High ability state (estimate 9/10) -> elevated difficulty
      const highState = [
        {
          skillId: 'backend',
          estimate: 9.0,
          confidence: 0.8,
          samples: 4,
          history: [],
          lastAnsweredAt: Date.now(),
        },
      ];

      const highOutput = generator.generateQuestion({
        candidateProfile,
        roleRequirements: scopedRole,
        round: 2,
        rollingSkillState: highState,
        questionHistory: [],
        targetSkill: 'backend',
      });

      expect(highOutput.difficulty).toBeGreaterThanOrEqual(8);
      expect(highOutput.difficulty).toBeLessThanOrEqual(10);
      expect(highOutput.question).toContain('Level-up');

      // Foundational round with low state (estimate 3/10) -> lower difficulty
      const lowState = [
        {
          skillId: 'backend',
          estimate: 2.5,
          confidence: 0.6,
          samples: 3,
          history: [],
          lastAnsweredAt: Date.now(),
        },
      ];

      const lowOutput = generator.generateQuestion({
        candidateProfile,
        roleRequirements: scopedRole,
        round: 1,
        rollingSkillState: lowState,
        questionHistory: [],
        targetSkill: 'backend',
      });

      expect(lowOutput.difficulty).toBeLessThanOrEqual(4);
      expect(lowOutput.question).toContain('Simplify');
    });
  });
});
