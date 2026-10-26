// Facial layers on top of the timed visemes, plus idle life for the interviewer.
// Mouth layers are derived only from the current speech weights and the WAV's
// loudness; idle blinks, gaze and head motion are authored and never describe the candidate.

const openness: Record<string, number> = { viseme_aa: 1, viseme_O: .75, viseme_E: .55, viseme_I: .4, viseme_RR: .35, viseme_kk: .35, viseme_U: .3, viseme_CH: .3, viseme_DD: .3, viseme_nn: .25, viseme_TH: .25, viseme_SS: .15, viseme_FF: .1, viseme_PP: 0 };

export type Articulation = { jawOpen: number; mouthFunnel: number; mouthPucker: number; mouthStretch: number; mouthPress: number };

/** Jaw opening, lip rounding, stretching and pressing for the current viseme mix. */
export function articulation(visemes: Map<string, number>, loudness?: number): Articulation {
  const w = (name: string) => visemes.get(name) ?? 0;
  let open = 0;
  for (const [name, weight] of visemes) open = Math.max(open, weight * (openness[name] ?? .2));
  const energy = loudness === undefined ? .7 : .3 + .7 * Math.min(1, loudness / .6);
  return {
    jawOpen: open * energy * .42,
    mouthFunnel: Math.max(w('viseme_O') * .45, w('viseme_U') * .3, w('viseme_CH') * .2),
    mouthPucker: Math.max(w('viseme_U') * .5, w('viseme_O') * .2),
    mouthStretch: Math.max(w('viseme_E'), w('viseme_I')) * .3,
    mouthPress: w('viseme_PP') * .35,
  };
}

export type IdlePose = { blink: number; gazeYaw: number; gazePitch: number; headYaw: number; headPitch: number; headRoll: number };
export type IdleMode = 'idle' | 'speaking' | 'listening' | 'thinking';

/** Non-repeating idle behaviour: randomly spaced blinks (with occasional doubles),
 * eye saccades that settle back on the candidate, and layered head drift whose
 * incommensurate frequencies never form a visible loop. */
export function createIdleLife(random: () => number = Math.random) {
  const between = (low: number, high: number) => low + random() * (high - low);
  const phases = Array.from({ length: 6 }, () => random() * Math.PI * 2);
  let time = 0, nextBlink = between(1.2, 3.5), blinkStart = -1, doubleBlink = false;
  let nextSaccade = between(.8, 2.4), gazeYaw = 0, gazePitch = 0, targetYaw = 0, targetPitch = 0;
  const blinkShape = (age: number) => age < 0 ? 0 : age < .06 ? age / .06 : age < .16 ? 1 - (age - .06) / .1 : 0;
  return {
    update(delta: number, mode: IdleMode): IdlePose {
      time += delta;
      if (time >= nextBlink) {
        blinkStart = time; doubleBlink = random() < .15;
        nextBlink = time + (mode === 'speaking' ? between(1.8, 4.2) : between(2.4, 5.8));
      }
      let blink = blinkShape(time - blinkStart);
      if (doubleBlink) blink = Math.max(blink, blinkShape(time - blinkStart - .22));
      if (time >= nextSaccade) {
        // Mostly a return to the candidate; sometimes a short glance while thinking or speaking.
        const away = mode === 'listening' ? .25 : mode === 'thinking' ? .8 : .55;
        if (random() < away) { targetYaw = between(-.07, .07); targetPitch = between(-.03, mode === 'thinking' ? .05 : .025); }
        else { targetYaw = between(-.012, .012); targetPitch = between(-.008, .008); }
        if (Math.abs(targetYaw - gazeYaw) > .05 && random() < .3) { blinkStart = time; doubleBlink = false; }
        nextSaccade = time + (mode === 'listening' ? between(1.4, 3.6) : between(.7, 2.4));
      }
      const saccade = 1 - Math.exp(-delta * 28);
      gazeYaw += (targetYaw - gazeYaw) * saccade; gazePitch += (targetPitch - gazePitch) * saccade;
      const drift = (amplitude: number, a: number, b: number, c: number) => amplitude * (Math.sin(time * .13 + phases[a]) * .55 + Math.sin(time * .071 + phases[b]) * .3 + Math.sin(time * .31 + phases[c]) * .15);
      const engaged = mode === 'listening' ? .6 : 1;
      return {
        blink,
        gazeYaw, gazePitch,
        headYaw: drift(.03, 0, 1, 2) * engaged + gazeYaw * .18,
        headPitch: drift(.016, 3, 4, 5) * engaged + gazePitch * .15 + (mode === 'listening' ? .012 : 0),
        headRoll: drift(.01, 2, 5, 1) * engaged,
      };
    },
  };
}
