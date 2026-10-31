/**
 * Quality tiers (plan section 7). `still` never creates WebGL: Cycles stills carry the same story.
 *  - high:   desktop-class GPU and pointer; post-processing, DPR up to 1.75
 *  - medium: touch or small screens; no post-processing, DPR up to 1.25, fewer particles
 *  - still:  reduced motion, data saver, very low memory or cores, or no WebGL
 * PerformanceMonitor can still step high down to medium at runtime on sustained frame drops.
 */
export type Tier = 'high' | 'medium' | 'still';

function hasWebGL() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

export function detectTier(reducedMotion: boolean): Tier {
  const device = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (reducedMotion || device.connection?.saveData || (device.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency || 8) <= 2 || !hasWebGL()) return 'still';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  // Below the md breakpoint token (phones), the medium tier.
  const md = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--breakpoint-md'), 10) || 768;
  const narrow = window.matchMedia(`(max-width: ${md - 1}px)`).matches;
  return coarse || narrow ? 'medium' : 'high';
}

export const tierSettings = {
  high: { dpr: [1, 1.75] as [number, number], particles: 420, effects: true, antialias: false },
  medium: { dpr: [1, 1.25] as [number, number], particles: 160, effects: false, antialias: true },
} as const;
