/** Conservative browser-integrity policy. Webcam vision is deliberately not a penalty signal. */
export const INTERVIEW_INTEGRITY_POLICY = Object.freeze({
  maximumWarnings: 2,
  terminationViolationCount: 3,
  monitoringGracePeriodMs: 30_000,
  minimumTabHiddenDurationMs: 5_000,
  minimumTabVisibleDurationMs: 2_000,
  minimumReportedConfidence: .7,
  duplicateSuppressionMs: 15_000,
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
export type IntegrityEventType = typeof VISION_TRANSITION_TYPES[number] | 'tab_hidden' | 'tab_visible' | 'window_unfocused' | 'fullscreen_exited' | 'camera_interrupted' | 'microphone_interrupted' | 'connection_interrupted' | 'face_absent' | 'multiple_faces' | 'head_turned' | 'gaze_away' | 'position_changed';
export const OBSERVATION_EVENT_TYPES = ['tab_visible', 'window_unfocused', 'fullscreen_exited', 'camera_interrupted', 'microphone_interrupted', 'connection_interrupted', 'face_absent', 'multiple_faces', 'head_turned', 'gaze_away', 'position_changed', ...VISION_TRANSITION_TYPES] as const;

/** Minimum event metadata retained for session audit; no media or biometric data. */
export interface IntegrityEventRecord extends ObservationMetadata {
  readonly policyDecision?: 'confirmed_violation' | 'same_incident' | 'cooldown' | 'recovery' | 'context_only';
  readonly eventId: string;
  readonly eventType: IntegrityEventType;
  readonly occurredAt: number;
  readonly durationMs: number;
  readonly warningNumber: number;
}

export interface IntegrityEventInput extends ObservationMetadata {
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
