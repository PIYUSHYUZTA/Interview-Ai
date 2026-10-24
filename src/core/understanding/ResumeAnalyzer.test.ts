import { describe, expect, it } from 'vitest';
import { ResumeAnalyzer } from './ResumeAnalyzer.js';
import { STRONG_RESUME, WEAK_RESUME } from '../../testSupport/fixtures.js';

const RESUME_WITH_EDUCATION_AND_CERTS = `Jordan Lee
Cloud & Data Platform Architect

SUMMARY
Software engineer with 8 years of experience in distributed systems, cloud computing, and big data.

EXPERIENCE
Staff Engineer, CloudCorp — 2020 - present
- Architected Kubernetes clusters on AWS supporting 50M requests/day.
- Implemented PostgreSQL database sharding and replication.

Data Engineer, Analytics Inc — 2016 - 2020
- Built Kafka streaming pipelines processing 10TB/day.
- Deployed Terraform modules for automated infrastructure.

EDUCATION
BS in Computer Science at University of California, Berkeley
MS in Software Engineering at Stanford University

CERTIFICATIONS
AWS Certified Solutions Architect
Google Professional Cloud Architect

PROJECTS
- Multi-region failover automation using AWS Route 53 and Lambda.
- Real-time fraud detection engine using Kafka Streams.
`;

describe('Service 1: Resume Analyzer', () => {
  const analyzer = new ResumeAnalyzer();

  it('parses raw resume text and outputs JSON with the exact required keys', () => {
    const output = analyzer.analyze(RESUME_WITH_EDUCATION_AND_CERTS);

    // Verify all required top-level keys
    expect(output).toHaveProperty('education');
    expect(output).toHaveProperty('skills');
    expect(output).toHaveProperty('experience');
    expect(output).toHaveProperty('projects');
    expect(output).toHaveProperty('certifications');
    expect(output).toHaveProperty('candidate_level_hypothesis');

    // Serializes cleanly to JSON
    const jsonString = analyzer.toJSON(output);
    const parsedJson = JSON.parse(jsonString);

    expect(Array.isArray(parsedJson.education)).toBe(true);
    expect(Array.isArray(parsedJson.skills)).toBe(true);
    expect(Array.isArray(parsedJson.experience)).toBe(true);
    expect(Array.isArray(parsedJson.projects)).toBe(true);
    expect(Array.isArray(parsedJson.certifications)).toBe(true);
    expect(typeof parsedJson.candidate_level_hypothesis).toBe('object');
  });

  it('correctly extracts education, experience, projects, and certifications', () => {
    const output = analyzer.analyze(RESUME_WITH_EDUCATION_AND_CERTS);

    // Education
    expect(output.education.length).toBeGreaterThanOrEqual(1);
    const hasBS = output.education.some((e) => e.level.includes('bs') || e.level.includes('bachelor'));
    expect(hasBS).toBe(true);

    // Certifications
    expect(output.certifications.length).toBe(2);
    expect(output.certifications).toContain('AWS Certified Solutions Architect');
    expect(output.certifications).toContain('Google Professional Cloud Architect');

    // Experience
    expect(output.experience.length).toBe(2);
    expect(output.experience[0].company).toContain('CloudCorp');
    expect(output.experience[1].company).toContain('Analytics Inc');

    // Projects
    expect(output.projects.length).toBeGreaterThanOrEqual(2);
  });

  it('anti-hallucination: never invents information not in resume text', () => {
    const output = analyzer.analyze(WEAK_RESUME);

    // Weak resume has no certifications or advanced cloud claims
    expect(output.certifications).toEqual([]);

    // Skills must only be skills that literally appear
    const skillKeywords = output.skills.map((s) => s.claim.toLowerCase());
    for (const kw of skillKeywords) {
      expect(WEAK_RESUME.toLowerCase()).toContain(kw);
    }

    // Should not invent skills like kubernetes, aws, spark, kafka
    const skillIds = output.skills.map((s) => s.skillId);
    expect(skillIds).not.toContain('devops');
    expect(skillIds).not.toContain('data_engineering');

    // Audit passes with 0 warnings
    const audit = analyzer.audit(WEAK_RESUME, output);
    expect(audit.passes).toBe(true);
  });

  it('candidate_level_hypothesis is strictly an unvalidated hypothesis with factual basis', () => {
    const strongOutput = analyzer.analyze(STRONG_RESUME);
    expect(strongOutput.candidate_level_hypothesis.status).toBe('hypothesis');
    expect(strongOutput.candidate_level_hypothesis.band).toBe('senior');
    expect(strongOutput.candidate_level_hypothesis.basis).toContain('6 years');
    expect(strongOutput.candidate_level_hypothesis.evidenceOverride).toBe(false);

    const weakOutput = analyzer.analyze(WEAK_RESUME);
    expect(weakOutput.candidate_level_hypothesis.status).toBe('hypothesis');
    expect(weakOutput.candidate_level_hypothesis.band).toBe('junior');
    expect(weakOutput.candidate_level_hypothesis.basis).toContain('1 years');
    expect(weakOutput.candidate_level_hypothesis.evidenceOverride).toBe(false);
  });

  it('handles empty or blank resume gracefully without throwing or inventing facts', () => {
    const output = analyzer.analyze('');
    expect(output.education).toEqual([]);
    expect(output.skills).toEqual([]);
    expect(output.experience).toEqual([]);
    expect(output.projects).toEqual([]);
    expect(output.certifications).toEqual([]);
    expect(output.candidate_level_hypothesis.status).toBe('hypothesis');
    expect(output.candidate_level_hypothesis.band).toBe('junior');
  });
});
