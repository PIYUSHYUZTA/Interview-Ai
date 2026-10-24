import type { Norm } from '../types.js';

/** Deterministic numeric helpers shared across the intelligence layers. */
export const norm: Norm = {
  clamp01(value) {
    if (Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  },
  clamp10(value) {
    if (Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 10) return 10;
    return value;
  },
  to01(value) {
    return this.clamp01(value / 10);
  },
  to10(value) {
    return this.clamp10(value * 10);
  },
  lerp(a, b, t) {
    return a + (b - a) * t;
  },
};

/** Round to a fixed number of decimals, returning a plain number. */
export function round(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Mean of numbers; NaN-safe → 0 on empty. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

/** Weighted mean of (value, weight) pairs. */
export function weightedMean(pairs: readonly { value: number; weight: number }[]): number {
  const totalWeight = pairs.reduce((acc, p) => acc + p.weight, 0);
  if (totalWeight === 0) return 0;
  return pairs.reduce((acc, p) => acc + p.value * p.weight, 0) / totalWeight;
}

/** Population standard deviation of numbers; NaN-safe → 0 on <2 samples. */
export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}