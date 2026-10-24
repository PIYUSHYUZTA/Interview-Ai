import { describe, expect, it } from 'vitest';
import { TopicInferenceEngine } from './TopicInferenceEngine.js';
import { parseResume } from './ResumeParser.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { ML_RESUME, STRONG_RESUME, WEAK_RESUME } from '../../testSupport/fixtures.js';

/** Any phrasing that would turn an open probe into an assertion of ability. */
const ASSERTION_PHRASES = [
  /understands/i,
  /is proficient/i,
  /knows/i,
  /has mastered/i,
  /expert at/i,
  /can (build|design|explain|implement)/i,
];

function infer(resume: string) {
  const parsed = parseResume(resume, defaultTaxonomy);
  return new TopicInferenceEngine().infer({
    lines: resume.replace(/\r\n/g, '\n').split('\n'),
    mentions: parsed.skillMentions,
    projects: parsed.projects,
    experience: parsed.experience,
  });
}

describe('UNDERSTAND — topic inference engine', () => {
  it('emits the canonical ML probe agenda for a recommendation-system claim', () => {
    const topics = infer(ML_RESUME);
    const names = topics.map((t) => t.topic);

    // The ML example demands these interrogation dimensions — as PROBES.
    expect(names).toContain('System architecture');
    expect(names).toContain('Algorithms & techniques');
    expect(names).toContain('Data & features');
    expect(names).toContain('Model selection');
    expect(names).toContain('Evaluation & metrics');
    expect(names).toContain('Deployment & operations');
    expect(names).toContain("Candidate's actual contribution");
  });

  it('never asserts that the candidate understands a topic', () => {
    for (const resume of [ML_RESUME, STRONG_RESUME, WEAK_RESUME]) {
      const topics = infer(resume);
      expect(topics.length).toBeGreaterThan(0);
      for (const topic of topics) {
        const blob = `${topic.topic} ${topic.rationale} ${topic.probes.join(' ')}`;
        for (const phrase of ASSERTION_PHRASES) {
          expect(phrase.test(blob), `${resume.slice(0, 12)} topic "${topic.topic}" asserted: ${phrase}`).toBe(false);
        }
      }
    }
  });

  it('keeps every topic bound to a line-numbered source reference', () => {
    const topics = infer(STRONG_RESUME);
    expect(topics.length).toBeGreaterThan(0);
    for (const topic of topics) {
      expect(topic.source.line).toBeGreaterThan(0);
      expect(topic.source.excerpt.length).toBeGreaterThan(0);
      expect(topic.source.section).toBeTruthy();
      expect(topic.probes.length).toBeGreaterThan(0);
    }
  });

  it('separates contribution from technical probing on every topic', () => {
    const topics = infer(ML_RESUME);
    const contribution = topics.find((t) => t.topic === "Candidate's actual contribution");
    expect(contribution).toBeDefined();
    expect(contribution.probes.some((p) => /personally|team|candidate/i.test(p))).toBe(true);
  });

  it('is deterministic — identical input yields identical topics', () => {
    const a = infer(STRONG_RESUME).map((t) => `${t.topic}|${t.source.line}`);
    const b = infer(STRONG_RESUME).map((t) => `${t.topic}|${t.source.line}`);
    expect(a).toEqual(b);
  });
});
