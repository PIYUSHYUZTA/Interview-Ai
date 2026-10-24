import { describe, expect, it } from 'vitest';
import { CareerPathDetector } from './CareerPathDetector.js';
import { ProfileBuilder } from './ProfileBuilder.js';

const detector = new CareerPathDetector();
const builder = new ProfileBuilder();

describe('resume-based career path detection', () => {
  it('recognizes an AI and machine-learning direction from resume evidence', () => {
    const resume = `Priya Patel\nMachine Learning Engineer\n\nExperience\nMachine Learning Engineer at ShopCo\nBuilt recommendation systems in Python and machine learning.\n\nProjects\nDeep learning ranking model using PyTorch.`;
    const result = detector.detect(builder.build({ resumeText: resume }), resume);
    expect(result.recommendedRoleId).toBe('data');
    expect(result.title).toBe('Data & ML Engineer');
    expect(result.evidence.length).toBeGreaterThan(1);
    expect(result.needsClarification).toBe(false);
  });

  it('recognizes frontend and backend evidence together as full-stack work', () => {
    const resume = `Jordan Lee\nFull-Stack Engineer\n\nExperience\nBuilt React and TypeScript web applications with Node.js APIs and PostgreSQL.`;
    const result = detector.detect(builder.build({ resumeText: resume }), resume);
    expect(result.recommendedRoleId).toBe('fullstack');
    expect(result.title).toBe('Full-Stack Engineer');
    expect(result.evidence).toContain('Frontend and backend experience both appear in the resume');
  });

  it('requests clarification when the resume has no reliable role-specific signals', () => {
    const resume = 'Jordan Lee\nProfessional experience\nWorked with teams to deliver projects and support customers.';
    const result = detector.detect(builder.build({ resumeText: resume }), resume);
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationPrompt).toContain('Which role');
    expect(result.relatedRoles.length).toBeGreaterThan(1);
  });
});
