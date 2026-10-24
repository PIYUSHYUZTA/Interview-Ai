import { describe, expect, it } from 'vitest';
import { answerFeedback, roleReadiness } from './assessmentPresentation.js';
import type { RoleRequirement, QuestionEvaluation } from '../core/types.js';
const role: RoleRequirement = { title: 'Engineer', softRequirements: [], skills: [
  {skillId:'backend',weight:3,requiredLevel:'mid'}, {skillId:'databases',weight:1,requiredLevel:'mid'},
] };
describe('public assessment presentation', () => {
  it('does not invent readiness for unassessed skills or empty roles', () => {
    expect(roleReadiness(role, {}).score).toBeNull();
    expect(roleReadiness(role, {}).coverage).toBe(0);
    expect(roleReadiness({...role,skills:[]}, {}).score).toBeNull();
    expect(roleReadiness(role, {backend:{samples:0,verdict:'meets'}}).score).toBeNull();
  });
  it('weights existing verdicts and separately reports coverage', () => {
    const partial = roleReadiness(role, {backend:{samples:3,verdict:'partially_meets'}});
    expect(partial.score).toBe(37.5);expect(partial.coverage).toBe(75);expect(partial.assessedSkills).toBe(1);
    const full = roleReadiness(role, {backend:{samples:3,verdict:'meets'},databases:{samples:2,verdict:'gap'}});
    expect(full.score).toBe(75);expect(full.coverage).toBe(100);
    expect(roleReadiness(role,{backend:{samples:3,verdict:'gap'}}).score).toBe(0);
  });
  it('builds actionable feedback only from scored rubric fields', () => {
    const evaluation: QuestionEvaluation = { questionId:'q1',skillId:'backend',grade:5,rubricCompliance:.5,
      rationale:'PRIVATE PROVIDER TRACE', criteria:{knowledgeDepth:8,recallPrecision:7,reasoning:4,appliedEvidence:2,communication:6} };
    const result = answerFeedback(evaluation);
    expect(result.criteria).toHaveLength(5);expect(result.strengths).toHaveLength(2);
    expect(result.improvements[0]).toContain('Concrete examples scored 2.0/10');
    expect(result.improvements[1]).toContain('Reasoning scored 4.0/10');
    expect(JSON.stringify(result)).not.toContain('PRIVATE PROVIDER TRACE');
  });
});
