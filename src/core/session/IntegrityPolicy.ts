/**
 * The single three-warning policy. Qualifying incidents — a sustained hidden tab, or a sustained,
 * validated camera incident of the warning tier (VisionIntegrityEngine) that continued after a
 * recovery prompt — share one backend counter: warning 1, warning 2 (final), and the third ends the
 * interview with a recorded reason. The frontend never counts; it shows the server's result.
 * Technical problems (camera/microphone/network loss, pipeline failures, unusable frames) never count.
 */
export const INTERVIEW_INTEGRITY_POLICY = Object.freeze({
  maximumWarnings: 2,
  terminationViolationCount: 3,
  monitoringGracePeriodMs: 30_000,
  minimumTabHiddenDurationMs: 5_000,
  minimumTabVisibleDurationMs: 2_000,
  minimumReportedConfidence: .7,
  duplicateSuppressionMs: 15_000,
  /** A camera incident qualifying within this time of the last counted warning (any source) is recorded, not
   * counted, so one real-world moment that trips several signals cannot produce several warnings. */
  visionWarningCooldownMs: 60_000,
  /** A sustained camera incident first shows a recovery prompt; it counts only if it continues this long. */
  cameraWarningRecoveryMs: 10_000,
  maximumEventAgeMs: 60_000,
  maximumReportedDurationMs: 60 * 60 * 1_000,
  fullscreenRequired: false,
  cameraRequired: false,
} as const);

export const VISION_TRANSITION_TYPES = ['face_detected','face_not_detected','tracking_lost','tracking_unreliable','multiple_faces_detected','head_orientation_changed','gaze_tracking_changed','hand_tracking_changed','candidate_out_of_frame','pose_tracking_unavailable','additional_person_detected','tracking_recovered','vision_pipeline_error','vision_pipeline_recovered','camera_recovered'] as const;
export interface ObservationMetadata {
  readonly sessionId?: string; readonly confidence?: number | null; readonly severity?: 'info' | 'technical';
  readonly details?: {readonly source: 'vision' | 'browser' | 'backend'; readonly signal: string; readonly trackingState: string; readonly phase: 'observed' | 'recovered' | 'technical'};
}
export type IntegrityEventType = typeof VISION_TRANSITION_TYPES[number] | 'tab_hidden' | 'tab_visible' | 'window_unfocused' | 'fullscreen_exited' | 'camera_interrupted' | 'microphone_interrupted' | 'connection_interrupted' | 'face_absent' | 'multiple_faces' | 'head_turned' | 'gaze_away' | 'position_changed' | 'repeated_head_turns' | 'hand_near_face' | 'repeated_hand_pattern' | 'phone_visible' | 'camera_obstructed';
export const OBSERVATION_EVENT_TYPES = ['tab_visible', 'window_unfocused', 'fullscreen_exited', 'camera_interrupted', 'microphone_interrupted', 'connection_interrupted', 'face_absent', 'multiple_faces', 'head_turned', 'gaze_away', 'position_changed', 'repeated_head_turns', 'hand_near_face', 'repeated_hand_pattern', 'phone_visible', 'camera_obstructed', ...VISION_TRANSITION_TYPES] as const;

/** Minimum event metadata retained for session audit; no media or biometric data. */
export interface IntegrityEventRecord extends ObservationMetadata, VisionEvidence {
  readonly policyDecision?: 'confirmed_violation' | 'same_incident' | 'cooldown' | 'recovery' | 'context_only' | 'vision_warning';
  /** Camera warnings only: their own sequence, independent of warningNumber (tab warnings). */
  readonly visionWarningNumber?: number;
  readonly eventId: string;
  readonly eventType: IntegrityEventType;
  readonly occurredAt: number;
  readonly durationMs: number;
  readonly warningNumber: number;
}

/** Camera-engine fields; absent on browser and transition events. */
export interface VisionEvidence {
  readonly tier?: 'warning' | 'review';
  readonly explanation?: string;
  readonly occurrences?: number;
  readonly incidentId?: string;
  readonly samples?: { readonly positive: number; readonly total: number };
}

export interface IntegrityEventInput extends ObservationMetadata, VisionEvidence {
  readonly eventId: string;
  readonly eventType: IntegrityEventType;
  readonly occurredAt: number;
  readonly durationMs: number;
}

/** Persisted independently of bounded event history, so refresh/log pruning cannot rearm an open incident. */
export interface TabIncident {
  readonly startedAt: number;
  readonly lastObservedAt: number;
  readonly recoveredAt: number | null;
}

export function transitionTabIncident(event: IntegrityEventInput, previous: TabIncident | null, lastWarningAt: number | null): {
  incident: TabIncident | null; decision: NonNullable<IntegrityEventRecord['policyDecision']>;
} {
  const start = event.occurredAt - event.durationMs;
  if (event.eventType === 'tab_visible') {
    if (!previous || previous.recoveredAt !== null) return {incident:previous,decision:'recovery'};
    if (start < previous.lastObservedAt) return {incident:previous,decision:'same_incident'};
    return {incident:{...previous,recoveredAt:event.occurredAt},decision:'recovery'};
  }
  if (previous && (previous.recoveredAt === null || start < previous.recoveredAt)) {
    return {incident:previous.recoveredAt === null ? {...previous,lastObservedAt:Math.max(previous.lastObservedAt,event.occurredAt)} : previous,decision:'same_incident'};
  }
  const incident={startedAt:start,lastObservedAt:event.occurredAt,recoveredAt:null};
  return {incident,decision:lastWarningAt !== null && start < lastWarningAt+INTERVIEW_INTEGRITY_POLICY.duplicateSuppressionMs ? 'cooldown' : 'confirmed_violation'};
}

export function validateIntegrityEvent(
  event: IntegrityEventInput,
  context: { sessionStartedAt: number | null; now: number },
): { eligible: true } | { eligible: false; reason: string } {
  const { sessionStartedAt, now } = context;
  if (event.eventType !== 'tab_hidden' && !OBSERVATION_EVENT_TYPES.includes(event.eventType as typeof OBSERVATION_EVENT_TYPES[number])) return { eligible: false, reason: 'Unsupported event type.' };
  if (sessionStartedAt === null) return { eligible: false, reason: 'The interview has not started.' };
  if (!Number.isFinite(event.occurredAt) || event.occurredAt > now + 5_000 || event.occurredAt < now - INTERVIEW_INTEGRITY_POLICY.maximumEventAgeMs) {
    return { eligible: false, reason: 'The event timestamp is outside the accepted window.' };
  }
  if (event.occurredAt < sessionStartedAt + INTERVIEW_INTEGRITY_POLICY.monitoringGracePeriodMs) {
    return { eligible: false, reason: 'The monitoring grace period has not elapsed.' };
  }
  if (!Number.isInteger(event.durationMs) || event.durationMs < (event.eventType === 'tab_visible' ? INTERVIEW_INTEGRITY_POLICY.minimumTabVisibleDurationMs : INTERVIEW_INTEGRITY_POLICY.minimumTabHiddenDurationMs) || event.durationMs > INTERVIEW_INTEGRITY_POLICY.maximumReportedDurationMs) {
    return { eligible: false, reason: 'The observed duration is outside the policy threshold.' };
  }
  if (event.durationMs > event.occurredAt - sessionStartedAt - INTERVIEW_INTEGRITY_POLICY.monitoringGracePeriodMs) {
    return { eligible: false, reason: 'The reported duration exceeds the active interview time.' };
  }
  return { eligible: true };
}

/** Short, candidate-facing name of what a counted warning was about. */
export function incidentSummary(record: Pick<IntegrityEventRecord, 'eventType' | 'durationMs'>): string {
  const seconds = Math.max(1, Math.round(record.durationMs / 1000));
  switch (record.eventType) {
    case 'tab_hidden': return `the interview tab was hidden for ${seconds} s`;
    case 'multiple_faces': return `more than one face was visible for ${seconds} s`;
    case 'face_absent': return `no face was visible for ${seconds} s while the camera image was usable`;
    case 'phone_visible': return `an object the detector classified as a phone was visible for ${seconds} s`;
    default: return `${record.eventType.replace(/_/g, ' ')} for ${seconds} s`;
  }
}

/** The one place that words warnings, so every endpoint and screen says the same thing. */
export function warningMessage(record: Pick<IntegrityEventRecord, 'eventType' | 'durationMs' | 'explanation'>, warningCount: number): string {
  const what = incidentSummary(record);
  // The full explanation stays in the notice and the report; the warning itself states what, the caveat and what next.
  const detail = record.explanation ? ' Camera observations are approximate; this is not a determination of intent.' : '';
  const max = INTERVIEW_INTEGRITY_POLICY.maximumWarnings;
  if (warningCount > max) return `Interview ended — third qualifying incident: ${what}. ${terminationNote}`;
  if (warningCount === max) return `Warning ${warningCount} of ${max} — final warning: ${what}.${detail} Another qualifying incident will end this interview.`;
  return `Warning ${warningCount} of ${max}: ${what}.${detail} Please correct this to continue; a further qualifying incident adds a second warning.`;
}

const terminationNote = 'Each incident was sustained and recorded separately; camera observations are approximate, and this is not a determination of intent.';

/** Recorded on the session when the third qualifying warning ends the interview. */
export function terminationReason(counted: readonly Pick<IntegrityEventRecord, 'eventType' | 'durationMs' | 'warningNumber'>[]): string {
  const list = [...counted].sort((a, b) => a.warningNumber - b.warningNumber).slice(-INTERVIEW_INTEGRITY_POLICY.terminationViolationCount)
    .map(record => `${record.warningNumber}) ${incidentSummary(record)}`).join('; ');
  return `The interview ended after three separate qualifying incidents: ${list}. ${terminationNote}`;
}
