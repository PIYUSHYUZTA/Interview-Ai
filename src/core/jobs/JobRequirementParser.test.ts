import { describe, expect, it } from 'vitest';
import { JobRequirementParser } from './JobRequirementParser.js';

describe('JobRequirementParser', () => {
  const parser = new JobRequirementParser();

  it('extracts inline required and preferred sections without conflating them', () => {
    const result = parser.parse('Database Engineer. Required: PostgreSQL and SQL. Preferred: AWS.');
    expect(result.requiredSkills).toContain('databases');
    expect(result.requiredSkills).not.toContain('cloud');
    expect(result.preferredSkills).toContain('cloud');
  });

  it('extracts role title, level, required vs preferred skills, and all 7 extractions', () => {
    const jdText = `
Senior Backend Engineer

About the Team:
We build high-performance distributed systems in a fast-paced environment with strong technical ownership.

Responsibilities:
- Design and scale distributed microservices
- Build reliable REST and GraphQL APIs

Requirements:
- Strong experience with Node.js and TypeScript
- Deep understanding of backend architecture and databases (PostgreSQL, Redis)
- 5+ years of software engineering experience

Preferred Qualifications:
- Experience with Cloud infrastructure on AWS and Docker
- Knowledge of Kubernetes and DevOps practices

Technologies:
Node.js, TypeScript, PostgreSQL, Redis, AWS, Docker, Kubernetes

Company Expectations:
We expect high engineering standards, collaborative problem solving, and proactive communication.
`;

    const analysis = parser.parse(jdText);

    expect(analysis.title).toContain('Senior Backend Engineer');
    expect(analysis.expectedLevel).toBe('senior');

    // Required & preferred skills extraction
    expect(analysis.requiredSkills.length).toBeGreaterThan(0);
    expect(analysis.requiredSkills).toContain('backend');
    expect(analysis.preferredSkills).toContain('cloud');

    // Extractions check
    expect(analysis.responsibilities.length).toBeGreaterThan(0);
    expect(analysis.responsibilities.some((r) => r.includes('distributed microservices'))).toBe(true);

    expect(analysis.relevantTechnologies.length).toBeGreaterThan(0);
    expect(analysis.relevantTechnologies.map((t) => t.toLowerCase())).toContain('typescript');

    expect(analysis.problemSolvingExpectations).toContain('system design');
    expect(analysis.companyExpectations.length).toBeGreaterThan(0);
  });

  it('handles sparse job descriptions gracefully with safe fallbacks', () => {
    const analysis = parser.parse('Frontend Developer with React experience');

    expect(analysis.title).toContain('Frontend Developer');
    expect(analysis.expectedLevel).toBeUndefined();
    expect(analysis.requiredSkills.length).toBeGreaterThanOrEqual(0);
    expect(analysis.companyExpectations).toEqual([]);
  });
});
