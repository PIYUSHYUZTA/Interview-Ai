import type { SkillObservation, SkillState } from '../types.js';
import { norm, stdDev } from '../utils/norm.js';

export interface SkillStateManager {
  init(skillId: string): SkillState;
  update(state: SkillState, observation: SkillObservation): SkillState;
}

/**
 * Rolling proficiency estimate with deliberately conservative dynamics.
 *
 * Properties:
 *  - Weighted stream: the estimate is a recency-weighted average, so one
 *    anomalous grade never moves it far.
 *  - Confidence grows with sample count AND consistency. A single answer
 *    produces confidence ≈ 0.2 — the adaptive engine keeps probing.
 *  - The estimate is tempered toward the prior (assumed neutral) early on,
 *    so the system "doesn't judge from one answer".
 */
export class RollingSkillState implements SkillStateManager {
  private static readonly PRIOR_MEAN = 5;
  private static readonly PRIOR_MASS = 1.25; // strength of the neutral prior
  private static readonly CONSISTENCY_SCALE = 3.2;
  private static readonly EVIDENCE_HALF_LIFE = 4;

  init(skillId: string): SkillState {
    return {
      skillId,
      estimate: RollingSkillState.PRIOR_MEAN,
      confidence: 0,
      samples: 0,
      history: [],
      lastAnsweredAt: null,
    };
  }

  update(state: SkillState, observation: SkillObservation): SkillState {
    const samples = state.samples + 1;
    const recencyWeight = Math.pow(0.5, samples / RollingSkillState.EVIDENCE_HALF_LIFE);
    const observationWeight =
      norm.clamp01(observation.weight * (0.3 + 0.7 * observation.evidenceQuality)) +
      recencyWeight * 0.1; // keep the stream responsive but damped

    // Bayesian-flavoured recursive average with a neutral prior.
    const priorMass = RollingSkillState.PRIOR_MASS;
    const runningMass = norm.clamp10(state.samples + priorMass);
    const obsMass = observationWeight * priorMass;
    const estimate =
      norm.clamp10(
        (state.estimate * runningMass + observation.score * obsMass) / (runningMass + obsMass),
      );

    const history = [...state.history, observation];
    const std = stdDev(history.map((h) => h.score));
    const consistency = samples <= 1 ? 0.6 : 1 - Math.min(1, std / RollingSkillState.CONSISTENCY_SCALE);
    const massFactor = samples / (samples + 3);
    const confidence = norm.clamp01(massFactor * (0.5 + 0.5 * consistency));

    return {
      skillId: state.skillId,
      estimate,
      confidence,
      samples,
      history,
      lastAnsweredAt: observation.timestamp,
    };
  }
}

export const defaultSkillStateManager: SkillStateManager = new RollingSkillState();