import { describe, expect, it } from 'vitest';
import { ProfileBuilder } from './ProfileBuilder.js';
import { parseResume } from './ResumeParser.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { STRONG_RESUME, WEAK_RESUME } from '../../testSupport/fixtures.js';

describe('UNDERSTAND — resume parsing', () => {
  it('extracts name, experience, skills and projects from a structured resume', () => {
    const parsed = parseResume(STRONG_RESUME, defaultTaxonomy);
    expect(parsed.candidateName).toBe('Alex Morgan');
    expect(parsed.experienceYears).toBe(6);
    expect(parsed.skillMentions.length).toBeGreaterThanOrEqual(6);
    const ids = parsed.skillMentions.map((m) => m.skillId);
    expect(ids).toContain('backend');
    expect(ids).toContain('databases');
    expect(ids).toContain('devops');
    expect(ids).toContain('testing');
    expect(parsed.projects.length).toBeGreaterThanOrEqual(2);
  });

  it('treats mentions as hypotheses — claims start unverified', () => {
    const profile = new ProfileBuilder().build({ resumeText: STRONG_RESUME });
    expect(profile.claims.length).toBeGreaterThan(0);
    expect(profile.claims.every((c) => c.verdict === 'unverified')).toBe(true);
    expect(profile.claims.some((c) => c.skillIds.includes('backend'))).toBe(true);
  });

  it('does not hallucinate skills absent from a weak resume', () => {
    const parsed = parseResume(WEAK_RESUME, defaultTaxonomy);
    const ids = parsed.skillMentions.map((m) => m.skillId);
    expect(ids).not.toContain('system_design');
    expect(ids).not.toContain('cloud');
  });

  it('infers a senior band from 6 years of experience', () => {
    const profile = new ProfileBuilder().build({ resumeText: STRONG_RESUME });
    expect(profile.levelBand).toBe('senior');
  });

  it('builds the enriched profile: experience, hypothesis, topics and source refs', () => {
    const profile = new ProfileBuilder().build({ resumeText: STRONG_RESUME });

    // Structured work history
    expect(profile.experience.length).toBeGreaterThanOrEqual(2);
    expect(profile.experience[0].bullets.length).toBeGreaterThan(0);
    expect(profile.experience[0].source.line).toBeGreaterThan(0);

    // Candidate-level hypothesis object (band + basis + status)
    expect(profile.candidateLevelHypothesis.band).toBe('senior');
    expect(profile.candidateLevelHypothesis.status).toBe('hypothesis');

    // Probe-based interview agenda, never assertions
    expect(profile.potentialInterviewTopics.length).toBeGreaterThan(0);
    for (const topic of profile.potentialInterviewTopics) {
      expect(topic.probes.length).toBeGreaterThan(0);
      expect(topic.source.line).toBeGreaterThan(0);
    }

    // Line-bound evidence/source references
    expect(profile.evidenceSourceReferences.length).toBeGreaterThan(0);
    expect(profile.evidenceSourceReferences[0].excerpt.length).toBeGreaterThan(0);
  });
});