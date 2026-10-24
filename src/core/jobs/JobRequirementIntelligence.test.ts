import { describe, expect, it } from 'vitest';
import { JobRequirementIntelligence } from './JobRequirementIntelligence.js';
import { ProfileBuilder } from '../understanding/ProfileBuilder.js';
import { AdaptiveEngine } from '../adaptation/AdaptiveEngine.js';

describe('JobRequirementIntelligence', () => {
  const intelligence = new JobRequirementIntelligence();
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

  const jdText = `
Senior Backend & Cloud Engineer

Requirements:
- Strong Node.js and TypeScript experience
- Backend architecture & databases (PostgreSQL)
- Cloud deployment & DevOps (AWS, Docker, Kubernetes)
- System design and microservices

Preferred:
- Frontend experience with React
`;

  it('analyzes job description and extracts requirements', () => {
    const gapOutput = intelligence.analyze(jdText);

    expect(gapOutput.roleTitle).toContain('Senior Backend & Cloud Engineer');
    expect(gapOutput.roleSkills.length).toBeGreaterThan(0);
    expect(gapOutput.roleRequirement.skills.length).toBeGreaterThan(0);
  });

  it('analyzes structured JobRequirementInput combining JD text and company expectations', () => {
    const gapOutput = intelligence.analyze({
      jobDescription: jdText,
      companyExpectations: {
        cultureValues: ['High Ownership', 'Customer First'],
        leadershipExpectations: ['Technical Mentorship'],
      },
      title: 'Principal Engineer',
      expectedLevel: 'senior',
    });

    expect(gapOutput.roleTitle).toBe('Principal Engineer');
    expect(gapOutput.expectedLevel).toBe('senior');
    expect(gapOutput.analysis.companyExpectations).toContain('High Ownership');
    expect(gapOutput.analysis.companyExpectations).toContain('Technical Mentorship');
  });

  it('compares Candidate Profile against Role Requirements producing matched, missing, weak skills, high priority gaps, and interview targets', () => {
    const gapOutput = intelligence.analyze(jdText);
    const comparison = intelligence.compare({
      profile: candidateProfile,
      role: gapOutput,
    });

    expect(comparison.roleTitle).toBe(gapOutput.roleTitle);

    // Candidate has backend, typescript, postgresql, frontend on profile
    expect(comparison.matchedSkills.some((s) => s.skillId === 'backend')).toBe(true);

    // Candidate lacks cloud / devops on profile
    expect(comparison.missingSkills.some((s) => s.skillId === 'cloud' || s.skillId === 'devops')).toBe(true);

    // Claimed skills without interview evidence should be flagged as weak (unvalidated hypothesis)
    expect(comparison.weakSkills.length).toBeGreaterThan(0);

    // High priority gaps and interview targets should be generated
    expect(comparison.highPriorityGaps.length).toBeGreaterThan(0);
    expect(comparison.interviewTargets.length).toBeGreaterThan(0);

    // High priority gaps are sorted by priority desc
    for (let i = 0; i < comparison.highPriorityGaps.length - 1; i++) {
      expect(comparison.highPriorityGaps[i].priority).toBeGreaterThanOrEqual(comparison.highPriorityGaps[i + 1].priority);
    }
  });

  it('feeds gaps and interview targets into AdaptiveEngine to steer next question selection', () => {
    const gapOutput = intelligence.analyze(jdText);
    const comparison = intelligence.compare({
      profile: candidateProfile,
      role: gapOutput,
    });

    const adaptiveEngine = new AdaptiveEngine({ seed: 42 });
    const initialStates = gapOutput.roleRequirement.skills.map((s) => ({
      skillId: s.skillId,
      estimate: 5.0,
      confidence: 0,
      samples: 0,
      history: [],
      lastAnsweredAt: null,
    }));

    const selection = adaptiveEngine.selectNext(
      initialStates,
      gapOutput.roleRequirement,
      [],
      [],
      {
        targets: comparison.interviewTargets,
        gaps: comparison.highPriorityGaps,
      },
    );

    expect(selection.skillId).toBeDefined();
    expect(selection.reason).toBeDefined();
  });
});
