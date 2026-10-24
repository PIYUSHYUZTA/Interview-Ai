import { describe, expect, it } from 'vitest';
import { INTERVIEW_INTEGRITY_POLICY, validateIntegrityEvent } from './IntegrityPolicy.js';

describe('conservative interview integrity policy', () => {
  it('permits exactly two warnings before terminating on a third violation', () => {
    expect(INTERVIEW_INTEGRITY_POLICY.maximumWarnings).toBe(2);
    expect(INTERVIEW_INTEGRITY_POLICY.terminationViolationCount).toBe(3);
  });
  const startedAt = 1_000_000;
  const base = { eventId: 'incident-1', eventType: 'tab_hidden' as const, durationMs: INTERVIEW_INTEGRITY_POLICY.minimumTabHiddenDurationMs };

  it('starts with zero warnings and allows time to settle before monitoring', () => {
    expect(INTERVIEW_INTEGRITY_POLICY.maximumWarnings).toBe(2);
    expect(validateIntegrityEvent({ ...base, occurredAt: startedAt + INTERVIEW_INTEGRITY_POLICY.monitoringGracePeriodMs - 1 }, { sessionStartedAt: startedAt, now: startedAt + 40_000 })).toMatchObject({ eligible: false });
  });

  it('requires a sustained hidden tab; short focus changes and brief tab switches are not eligible', () => {
    expect(validateIntegrityEvent({ ...base, durationMs: INTERVIEW_INTEGRITY_POLICY.minimumTabHiddenDurationMs - 1, occurredAt: startedAt + 40_000 }, { sessionStartedAt: startedAt, now: startedAt + 40_000 })).toMatchObject({ eligible: false });
  });

  it('accepts only a sustained, recent tab-hidden event after the grace period', () => {
    expect(validateIntegrityEvent({ ...base, occurredAt: startedAt + 40_000 }, { sessionStartedAt: startedAt, now: startedAt + 40_000 })).toEqual({ eligible: true });
    expect(validateIntegrityEvent({ ...base, occurredAt: startedAt + 1_000 }, { sessionStartedAt: startedAt, now: startedAt + 40_000 })).toMatchObject({ eligible: false });
  });
});
