import { describe, expect, it } from 'vitest';
import { RollingSkillState } from './SkillState.js';
import type { SkillObservation } from '../types.js';

const manager = new RollingSkillState();
const now = 1_000_000;

function obs(skillId: string, score: number, seq: number, weight = 0.9, evidenceQuality = 0.8): SkillObservation {
  return {
    skillId,
    questionId: `q-${seq}`,
    score,
    evidenceQuality,
    weight,
    difficulty: 3,
    timestamp: now + seq,
  };
}

describe('ASSESS — rolling skill state', () => {
  it('does not judge a skill from a single answer', () => {
    const s0 = manager.init('backend');
    expect(s0.estimate).toBe(5);
    expect(s0.confidence).toBe(0);

    const s1 = manager.update(s0, obs('backend', 9, 0));
    // one great answer moves the needle but stays conservative
    expect(s1.estimate).toBeGreaterThan(5);
    expect(s1.estimate).toBeLessThan(9);
    expect(s1.confidence).toBeLessThan(0.35);
    expect(s1.samples).toBe(1);
  });

  it('converges toward consistent strong evidence', () => {
    let state = manager.init('databases');
    for (let i = 0; i < 6; i++) state = manager.update(state, obs('databases', 8.5, i));
    expect(state.estimate).toBeGreaterThan(7);
    expect(state.confidence).toBeGreaterThan(0.6);
    expect(state.samples).toBe(6);
  });

  it('moves back down when strong evidence reverses', () => {
    let state = manager.init('cloud');
    for (let i = 0; i < 3; i++) state = manager.update(state, obs('cloud', 8, i));
    const high = state.estimate;
    for (let i = 3; i < 6; i++) state = manager.update(state, obs('cloud', 2, i));
    // the reversal shifts the estimate but not wildly — evidence-weighted
    expect(state.estimate).toBeLessThan(high);
    expect(state.estimate).toBeGreaterThan(2);
  });

  it('tracks timestamped history for the evidence log', () => {
    let state = manager.init('security');
    state = manager.update(state, obs('security', 6, 0));
    state = manager.update(state, obs('security', 7, 1));
    expect(state.history).toHaveLength(2);
    expect(state.lastAnsweredAt).toBe(now + 1);
  });

  it('proves one weak answer after several strong answers does not collapse the skill estimate (Section 10 / Appendix A4 Hard Rule)', () => {
    let state = manager.init('system_design');
    // 4 consecutive strong responses (9.0/10)
    for (let i = 0; i < 4; i++) {
      state = manager.update(state, obs('system_design', 9.0, i));
    }
    const establishedEstimate = state.estimate;
    expect(establishedEstimate).toBeGreaterThan(8.0);

    // 5th response is an anomalous weak answer (2.0/10)
    state = manager.update(state, obs('system_design', 2.0, 4));

    // The estimate must NOT collapse to junior/failing levels (< 5.0).
    // It remains in the proficient band (>= 7.0) because evidence is Bayesian-weighted across all samples.
    expect(state.estimate).toBeGreaterThanOrEqual(7.0);
    expect(establishedEstimate - state.estimate).toBeLessThan(1.5);
    expect(state.samples).toBe(5);
  });
});