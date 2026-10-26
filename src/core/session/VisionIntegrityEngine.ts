import type { IntegrityEventInput, IntegrityEventType } from './IntegrityPolicy.js';

/**
 * Centralised camera integrity engine. It turns per-frame observations into incidents: a signal
 * must hold for its sustain time (temporal smoothing on top of the worker's own smoothing), short
 * gaps are bridged, and each incident yields at most two records — one when it qualifies and one
 * when it ends — never one per frame. A warning-tier incident first shows a recovery prompt and
 * qualifies only if it continues through the recovery window; the state machine then applies the
 * single three-warning policy (IntegrityPolicy). Review-tier records are context for a reviewer only.
 * Unusable frames (dark, covered, blank) are "can't tell", never evidence.
 */

/** Only the observation fields the engine reads (structurally compatible with the worker schema). */
export interface VisionSignalsInput {
  readonly faceCount: number;
  readonly headOrientation?: string; readonly gazeDirection?: string; readonly gazeReliable?: boolean; readonly positionShift?: number | null;
  readonly directionEstimate?: { readonly headReliable?: boolean; readonly gazeReliable?: boolean; readonly repeatedHeadTurns?: boolean; readonly recentHeadTurns?: number; readonly headTurnWindowSeconds?: number };
  readonly movementObservation?: {
    readonly body?: { readonly reliable?: boolean };
    readonly visiblePoseCount?: number; readonly handNearFaceMs?: number;
    readonly handPatterns?: { readonly windowSeconds: number; readonly handToFaceEpisodes: number; readonly sideReaches: number; readonly repeated: boolean; readonly patterns: readonly string[] };
  };
  readonly phoneObservation?: { readonly status: string; readonly score: number | null; readonly heldInHand: boolean };
  readonly frameQuality?: { readonly usable: boolean };
}

export interface VisionEngineConfig {
  readonly noticeMs: number;            // sustain for faces, gaze, head, position
  readonly handFaceMs: number;          // sustain for a hand held near the face
  readonly phoneMs: number;             // sustain for a confirmed phone
  readonly interruptionMs: number;      // unreadable samples bridged inside an incident
  readonly clearMs: number;             // confirmed-absent time that ends an incident
  readonly gapMs: number;               // sampling gap that ends every incident
  readonly recoveryMs: number;          // warning tier: prompt first, qualify only if it continues this long
  readonly directionReview: boolean;    // gaze / head signals enabled
  readonly positionThreshold: number;
}

export type VisionTier = 'warning' | 'review';
type Condition = boolean | null; // null: this sample cannot tell
interface Reading { readonly condition: Condition; readonly score?: number | null; readonly count?: number }
interface SustainedSignal { readonly type: IntegrityEventType; readonly tier: VisionTier; readonly prompt?: string; readonly sustainMs: (c: VisionEngineConfig) => number; readonly read: (o: VisionSignalsInput, c: VisionEngineConfig) => Reading; readonly explain: (i: Incident, phase: 'observed' | 'ended') => string }
interface CountSignal { readonly type: IntegrityEventType; readonly read: (o: VisionSignalsInput, c: VisionEngineConfig) => { active: boolean; count: number; windowMs: number; detail: string } }

interface Incident {
  readonly id: string; readonly startedAt: number; lastTrueAt: number; samples: number; positive: number;
  scoreSum: number; scored: number; peak: number; emitted: boolean;
}
export interface VisionEngineState { at: number; incidents: Record<string, Incident>; counted: Record<string, number>; sequence: number }
export interface VisionEngineOutput { readonly events: (IntegrityEventInput & VisionEventExtras)[]; readonly notices: string[]; readonly state: VisionEngineState }
export interface VisionEventExtras { readonly tier: VisionTier; readonly explanation: string; readonly occurrences: number; readonly incidentId: string; readonly samples?: { readonly positive: number; readonly total: number } }

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;
/** What each tier means, appended to every explanation the candidate or a reviewer sees. */
export const TIER_MEANING: Readonly<Record<VisionTier, string>> = {
  warning: 'Camera observations are approximate; this is not a determination of intent.',
  review: 'Recorded as a review note only; no warning is counted.',
};
const share = (i: Incident) => `${i.positive} of ${i.samples} samples`;
const lasted = (i: Incident) => i.lastTrueAt - i.startedAt;

export const SUSTAINED_SIGNALS: readonly SustainedSignal[] = [
  { type: 'multiple_faces', tier: 'warning', sustainMs: c => c.noticeMs, prompt: 'More than one face is in view. Please make sure you are alone for the interview.',
    read: o => ({ condition: o.faceCount > 1, count: o.faceCount }),
    explain: (i, p) => `Up to ${i.peak} faces were visible ${p === 'ended' ? 'for' : 'for at least'} ${seconds(lasted(i))} (${share(i)}). Another person in view can be innocent, such as someone passing behind you; it is recorded for review.` },
  { type: 'face_absent', tier: 'warning', sustainMs: c => c.noticeMs, prompt: 'We cannot see your face. Please return to the camera view and check your lighting.',
    // A dark, covered or blank frame cannot show a face: that is a camera problem, not absence.
    read: o => ({ condition: o.faceCount !== 0 ? false : o.frameQuality?.usable === false ? null : true }),
    explain: (i, p) => `No face was detected ${p === 'ended' ? 'for' : 'for at least'} ${seconds(lasted(i))} (${share(i)}) while the camera image was usable. Stepping away or framing can cause this.` },
  { type: 'phone_visible', tier: 'warning', sustainMs: c => c.phoneMs, prompt: 'A phone appears to be in view. Please put it away.',
    // Not scanned / detector unavailable is unknown, not "no phone".
    read: o => o.phoneObservation ? { condition: o.phoneObservation.status === 'seen', score: o.phoneObservation.score } : { condition: null },
    explain: (i, p) => `An object the detector (EfficientDet-Lite0, COCO "cell phone") classified as a phone was visible ${p === 'ended' ? 'for' : 'for at least'} ${seconds(lasted(i))} (${share(i)}, mean score ${i.scored ? (i.scoreSum / i.scored).toFixed(2) : 'n/a'}). This is an approximate detection of a visible object, not proof that it was used.` },
  { type: 'gaze_away', tier: 'review', sustainMs: c => c.noticeMs,
    read: (o, c) => ({ condition: !c.directionReview ? false : o.directionEstimate?.gazeReliable === true && o.gazeReliable ? o.gazeDirection === 'possibly_sideways' : null }),
    explain: i => `The approximate, uncalibrated eye direction stayed off-centre for ${seconds(lasted(i))} (${share(i)}). Webcam gaze cannot tell what you were looking at.` },
  { type: 'head_turned', tier: 'review', sustainMs: c => c.noticeMs,
    read: (o, c) => ({ condition: !c.directionReview ? false : o.directionEstimate?.headReliable === true ? o.headOrientation === 'turned' : null }),
    explain: i => `The head stayed turned away from the camera for ${seconds(lasted(i))} (${share(i)}). Not proof of outside assistance.` },
  { type: 'hand_near_face', tier: 'review', sustainMs: c => c.handFaceMs,
    read: o => ({ condition: (o.movementObservation?.handNearFaceMs ?? 0) > 0 }),
    explain: i => `A hand was held near the face for ${seconds(lasted(i))} (${share(i)}). Resting a chin on a hand or touching the face is normal.` },
  { type: 'position_changed', tier: 'review', sustainMs: c => c.noticeMs,
    read: (o, c) => ({ condition: o.movementObservation?.body?.reliable !== false && o.positionShift != null && o.positionShift >= c.positionThreshold }),
    explain: i => `The upper body stayed away from its starting position for ${seconds(lasted(i))} (${share(i)}).` },
  // Technical, never a warning: the camera image itself is unusable (covered lens, darkness, camera fault).
  { type: 'camera_obstructed', tier: 'review', sustainMs: c => c.noticeMs,
    read: o => ({ condition: o.frameQuality ? !o.frameQuality.usable : null }),
    explain: i => `The camera image was too dark or uniform to analyse for ${seconds(lasted(i))} (${share(i)}), for example a covered lens, darkness or a camera fault. Treated as a technical problem.` },
];

export const COUNT_SIGNALS: readonly CountSignal[] = [
  { type: 'repeated_head_turns', read: (o, c) => {
    const d = o.directionEstimate; const windowMs = (d?.headTurnWindowSeconds ?? 60) * 1000;
    return { active: c.directionReview && d?.repeatedHeadTurns === true, count: d?.recentHeadTurns ?? 0, windowMs,
      detail: `${d?.recentHeadTurns ?? 0} held head turns (each over a second) in about ${seconds(windowMs)}. Natural movement is expected; not proof of outside assistance.` };
  } },
  { type: 'repeated_hand_pattern', read: o => {
    const h = o.movementObservation?.handPatterns; const windowMs = (h?.windowSeconds ?? 120) * 1000;
    const parts = (h?.patterns ?? []).map(p => p === 'hand_to_face' ? `${h!.handToFaceEpisodes} hand-to-face movements` : `${h!.sideReaches} reaches out of view at the side`);
    return { active: h?.repeated === true, count: (h?.patterns ?? []).reduce((n, p) => n + (p === 'hand_to_face' ? h!.handToFaceEpisodes : h!.sideReaches), 0), windowMs,
      detail: `${parts.join(' and ')} in about ${seconds(windowMs)}. Ordinary gesturing is not counted; this is not a cheating finding.` };
  } },
];

export const VISION_WARNING_TYPES = SUSTAINED_SIGNALS.filter(s => s.tier === 'warning').map(s => s.type);
export const VISION_REVIEW_TYPES = [...SUSTAINED_SIGNALS.filter(s => s.tier === 'review').map(s => s.type), ...COUNT_SIGNALS.map(s => s.type)];

export interface IntegrityReviewItem {
  readonly eventType: string; readonly tier: VisionTier; readonly counted: boolean; readonly warningNumber: number;
  readonly startedAtMs: number; readonly durationMs: number; readonly occurrences: number;
  readonly confidence: number | null; readonly ongoingAtEnd: boolean; readonly explanation: string;
}

type ReviewSource = { eventType: string; occurredAt: number; durationMs: number; warningNumber: number; confidence?: number | null; tier?: VisionTier; incidentId?: string; explanation?: string; occurrences?: number; policyDecision?: string; details?: { source: string; phase: string } };

/** One line per incident for the report: counted tab warnings and every camera incident (its qualifying record,
 * updated by its closing record), with offsets from the interview start. */
export function summarizeIntegrityIncidents(events: readonly ReviewSource[], sessionStartedAt: number): IntegrityReviewItem[] {
  const counts = new Set<string>(COUNT_SIGNALS.map(signal => signal.type));
  const items = new Map<string, IntegrityReviewItem>();
  for (const event of events) { // records are stored in order: an incident's qualifying record precedes its closing one
    const start = Math.max(0, event.occurredAt - event.durationMs - sessionStartedAt);
    if (event.eventType === 'tab_hidden' && event.warningNumber > 0) {
      items.set(`tab:${event.occurredAt}`, { eventType: event.eventType, tier: 'warning', counted: true, warningNumber: event.warningNumber, startedAtMs: start, durationMs: event.durationMs,
        occurrences: 1, confidence: null, ongoingAtEnd: false, explanation: `The interview tab was hidden for ${Math.round(event.durationMs / 1000)} s.` });
      continue;
    }
    if (event.details?.source !== 'vision' || !event.tier || !event.incidentId || !event.explanation) continue;
    const key = `${event.eventType}:${event.incidentId}`, open = items.get(key);
    if (event.details.phase === 'observed') items.set(key, { eventType: event.eventType, tier: event.tier, counted: event.warningNumber > 0 || event.policyDecision === 'vision_warning',
      warningNumber: event.warningNumber, startedAtMs: start, durationMs: event.durationMs, occurrences: event.occurrences ?? 1,
      confidence: event.confidence ?? null, ongoingAtEnd: !counts.has(event.eventType), explanation: event.explanation });
    else if (open && event.details.phase === 'recovered') items.set(key, { ...open, durationMs: event.durationMs, confidence: event.confidence ?? open.confidence, ongoingAtEnd: false, explanation: event.explanation });
  }
  return [...items.values()].sort((a, b) => a.startedAtMs - b.startedAtMs);
}

export function emptyVisionState(): VisionEngineState { return { at: 0, incidents: {}, counted: {}, sequence: 0 }; }

/**
 * One analysed sample in, at most one record per incident transition out.
 * eligibleAt: monitoring grace end; lastRecordedAt: persisted fallback for count-signal windows.
 */
export function updateVisionIntegrity(input: {
  sessionId: string; now: number; eligibleAt: number; observation: VisionSignalsInput; config: VisionEngineConfig;
  state?: VisionEngineState; lastRecordedAt?: (type: IntegrityEventType) => number | null;
}): VisionEngineOutput {
  const { sessionId, now, eligibleAt, observation, config } = input;
  const state: VisionEngineState = structuredClone(input.state ?? emptyVisionState());
  const events: (IntegrityEventInput & VisionEventExtras)[] = [];
  const notices: string[] = [];
  const record = (signal: SustainedSignal, incident: Incident, phase: 'observed' | 'ended', at: number) => {
    const scored = incident.scored ? incident.scoreSum / incident.scored : null;
    events.push({
      sessionId, eventId: `vision-${signal.type}-${incident.id}${phase === 'ended' ? '-ended' : ''}`, eventType: signal.type,
      occurredAt: at, durationMs: Math.max(0, Math.round(lasted(incident))), confidence: scored === null ? null : Math.round(scored * 100) / 100, severity: 'info',
      details: { source: 'vision', signal: signal.type, trackingState: phase === 'ended' ? 'ended' : 'sustained', phase: phase === 'ended' ? 'recovered' : 'observed' },
      tier: signal.tier, explanation: `${signal.explain(incident, phase)} ${TIER_MEANING[signal.tier]}`, occurrences: 1, incidentId: incident.id, samples: { positive: incident.positive, total: incident.samples },
    });
  };
  const close = (signal: SustainedSignal, at: number) => {
    const incident = state.incidents[signal.type];
    if (incident?.emitted) record(signal, incident, 'ended', at);
    delete state.incidents[signal.type];
  };
  // A sampling interruption (camera off, network) is not evidence either way: end every incident.
  if (state.at && now - state.at > config.gapMs) for (const signal of SUSTAINED_SIGNALS) close(signal, state.at);
  state.at = now;

  for (const signal of SUSTAINED_SIGNALS) {
    const reading = signal.read(observation, config);
    let incident = state.incidents[signal.type];
    if (reading.condition === true && now >= eligibleAt) {
      if (!incident) incident = state.incidents[signal.type] = { id: `${now.toString(36)}-${(state.sequence++).toString(36)}`, startedAt: now, lastTrueAt: now, samples: 0, positive: 0, scoreSum: 0, scored: 0, peak: 0, emitted: false };
      incident.lastTrueAt = now; incident.samples += 1; incident.positive += 1;
      if (typeof reading.score === 'number') { incident.scoreSum += reading.score; incident.scored += 1; }
      incident.peak = Math.max(incident.peak, reading.count ?? 0);
      const recovery = signal.tier === 'warning' ? config.recoveryMs : 0;
      if (!incident.emitted && lasted(incident) >= signal.sustainMs(config) + recovery) { incident.emitted = true; record(signal, incident, 'observed', now); }
      if (incident.emitted) notices.push(`${signal.explain(incident, 'observed')} ${TIER_MEANING[signal.tier]}`);
      else if (signal.prompt && lasted(incident) >= signal.sustainMs(config)) {
        const left = Math.max(1, Math.ceil((signal.sustainMs(config) + recovery - lasted(incident)) / 1000));
        notices.push(`${signal.prompt} If this continues for about ${left} more seconds it will count as an integrity warning.`);
      }
    } else if (incident) {
      // Temporal smoothing: a confirmed-absent sample ends the incident only after clearMs; an
      // unreadable one after interruptionMs. Short dropouts and single-frame misses are bridged.
      incident.samples += 1;
      if (now - incident.lastTrueAt > (reading.condition === false ? config.clearMs : config.interruptionMs)) close(signal, now);
      else if (incident.emitted) notices.push(`${signal.explain(incident, 'observed')} ${TIER_MEANING[signal.tier]}`);
      else if (signal.prompt && lasted(incident) >= signal.sustainMs(config)) notices.push(`${signal.prompt} If this continues it will count as an integrity warning.`);
    }
  }

  for (const signal of COUNT_SIGNALS) {
    const reading = signal.read(observation, config);
    if (!reading.active || now < eligibleAt) continue;
    const last = Math.max(state.counted[signal.type] ?? -Infinity, input.lastRecordedAt?.(signal.type) ?? -Infinity);
    if (now - last < reading.windowMs) continue; // one record per counting window
    state.counted[signal.type] = now;
    const id = `${now.toString(36)}-${(state.sequence++).toString(36)}`;
    const explanation = `${reading.detail.charAt(0).toUpperCase()}${reading.detail.slice(1)} ${TIER_MEANING.review}`;
    events.push({ sessionId, eventId: `vision-${signal.type}-${id}`, eventType: signal.type, occurredAt: now, durationMs: reading.windowMs, confidence: null, severity: 'info',
      details: { source: 'vision', signal: signal.type, trackingState: `${reading.count} occurrences`, phase: 'observed' },
      tier: 'review', explanation, occurrences: reading.count, incidentId: id });
    notices.push(explanation);
  }
  return { events, notices, state };
}
