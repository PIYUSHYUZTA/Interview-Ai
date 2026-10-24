import { describe, expect, it } from 'vitest';
import { ResumeIntelligence } from './ResumeIntelligence.js';
import type { InterviewTopic } from '../types.js';
import { ML_RESUME, STRONG_RESUME, WEAK_RESUME } from '../../testSupport/fixtures.js';

describe('UNDERSTAND — Resume Intelligence service', () => {
  const intelligence = new ResumeIntelligence();

  it('builds a structured profile from raw resume text', () => {
    const profile = intelligence.analyze(STRONG_RESUME);
    expect(profile.candidateName).toBe('Alex Morgan');
    expect(profile.education).toBeDefined();
    expect(profile.experience.length).toBeGreaterThanOrEqual(2);
    expect(profile.certifications).toBeDefined();
    expect(profile.technologies.length).toBeGreaterThan(0);
    expect(profile.responsibilities.length).toBeGreaterThan(0);

    // The requirement list from the brief.
    for (const field of [
      'education', 'skills', 'experience', 'projects', 'certifications',
      'technologies', 'responsibilities',
    ] as const) {
      expect(profile).toHaveProperty(field);
    }
  });

  it('labels the candidate-level estimate as a hypothesis, with a basis, never a verdict', () => {
    const profile = intelligence.analyze(STRONG_RESUME);
    expect(profile.candidateLevelHypothesis.band).toBe('senior');
    expect(profile.candidateLevelHypothesis.status).toBe('hypothesis');
    expect(profile.candidateLevelHypothesis.evidenceOverride).toBe(false);
    expect(profile.candidateLevelHypothesis.basis).toMatch(/Hypothesis only/);
  });

  it('exposes interview topics with rationale, probes and sources', () => {
    const profile = intelligence.analyze(ML_RESUME);
    expect(profile.potentialInterviewTopics.length).toBeGreaterThan(0);
    for (const topic of profile.potentialInterviewTopics) {
      expect(topic.rationale.length).toBeGreaterThan(0);
      expect(topic.source.line).toBeGreaterThan(0);
      expect(topic.probes.length).toBeGreaterThan(0);
    }
  });

  it('audits clean — no warning phrases on real resumes', () => {
    for (const resume of [STRONG_RESUME, ML_RESUME, WEAK_RESUME]) {
      const { passes, findings } = intelligence.audit(intelligence.analyze(resume));
      const warnings = findings.filter((f) => f.severity === 'warning');
      expect(warnings, JSON.stringify(warnings)).toHaveLength(0);
      expect(passes).toBe(true);
    }
  });

  it('audit flags any topic that asserts candidate ability', () => {
    const assertingTopic: InterviewTopic = {
      topic: 'Architecture',
      rationale: 'Candidate understands distributed systems design.',
      source: { line: 12, excerpt: 'Built a distributed system', section: 'experience' },
      probes: ['Can the candidate design farms?'],
    };
    const finding = intelligence.auditTopic(assertingTopic);
    expect(finding.severity).toBe('warning');
  });

  it('extracts structured experience entries with source refs', () => {
    const profile = intelligence.analyze(STRONG_RESUME);
    const first = profile.experience[0];
    expect(first.role).toContain('Senior Backend Engineer');
    expect(first.company).toBe('Fintech Co');
    expect(first.period).toMatch(/2022/);
    expect(first.bullets.length).toBeGreaterThanOrEqual(3);
    expect(first.source.line).toBeGreaterThanOrEqual(1);
  });
});