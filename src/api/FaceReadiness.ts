import { z } from 'zod';
import type { VisionObservationSchema } from './ProctoringWorker.js';

export const FaceReadinessSchema = z.object({
  state: z.enum(['NOT_CHECKED','FACE_PRESENT','FACE_NOT_DETECTED','TRACKING_LOST','MULTIPLE_FACES','QUALITY_LOW','UNAVAILABLE']),
  ready: z.boolean(), identityVerified: z.literal(false), identityVerification: z.literal('not_implemented'),
  checkedAt: z.string().datetime().nullable(), expiresAt: z.string().datetime().nullable(),
  goodSamples: z.number().int().min(0).max(2), message: z.string(),
});
type Snapshot = z.infer<typeof FaceReadinessSchema>;
type Entry = { snapshot: Snapshot; trackId: number | null; at: number };

/** Ephemeral readiness metadata only. No images, embeddings or identity assertions. */
export class FaceReadiness {
  private readonly entries = new Map<string, Entry>();
  get(id: string, now = Date.now(), maximumAgeMs = 30_000): Snapshot {
    for (const [key, entry] of this.entries) if (now - entry.at > 15 * 60_000) this.entries.delete(key);
    const entry = this.entries.get(id);
    if (!entry) return { state: 'NOT_CHECKED', ready: false, identityVerified: false, identityVerification: 'not_implemented', checkedAt: null, expiresAt: null, goodSamples: 0, message: 'Complete the face-readiness check. This does not verify identity.' };
    if (entry.snapshot.state === 'FACE_PRESENT' && now - entry.at > maximumAgeMs) return { ...entry.snapshot, ready: false, state: 'TRACKING_LOST', goodSamples: 0, message: 'The face-readiness check expired. Please check again.' };
    return entry.snapshot;
  }
  record(id: string, observation: z.infer<typeof VisionObservationSchema>, now = Date.now()): Snapshot {
    const previous = this.entries.get(id);
    const good = observation.faceState === 'FACE_PRESENT' && observation.faceTrackingReliable && !!observation.faceQuality && Object.values(observation.faceQuality.checks).every(Boolean);
    const trackId = observation.faceTracks[0]?.trackId ?? null;
    const samples = good && trackId !== null ? Math.min(2, previous && previous.trackId === trackId && now - previous.at < 6000 ? previous.snapshot.goodSamples + 1 : 1) : 0;
    const ready = samples === 2;
    const checks = observation.faceQuality?.checks;
    const hints = checks ? [!checks.largeEnough && 'Move closer so your face is large enough.', !checks.wellLit && 'Use even lighting on your face.', !checks.sharpEnough && 'Hold still and check that the lens is clear.', !checks.forwardFacing && 'Look toward the camera.'].filter(Boolean).join(' ') : 'Improve lighting and keep your face clearly visible.';
    const guidance = observation.faceCount === 0 ? 'No face is currently detected. Look toward the camera and check its position.' : observation.faceCount > 1 ? 'More than one face is visible. Please be the only person in the preview.' : hints;
    const snapshot: Snapshot = { state: observation.faceState, ready, identityVerified: false, identityVerification: 'not_implemented', checkedAt: new Date(now).toISOString(), expiresAt: ready ? new Date(now + 30_000).toISOString() : null, goodSamples: samples, message: ready ? 'Face readiness confirmed for this session. Identity has not been verified.' : good ? 'Face detected. Hold your position for the next sample.' : guidance };
    if (!this.entries.has(id) && this.entries.size >= 1000) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(id, { snapshot, trackId, at: now });
    return snapshot;
  }
  unavailable(id: string): void {
    if (!this.entries.has(id) && this.entries.size >= 1000) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(id, { at: Date.now(), trackId: null, snapshot: { ...this.get(id), state: 'UNAVAILABLE', ready: false, goodSamples: 0, expiresAt: null, message: 'Camera analysis is unavailable. Please retry; no warning was added.' } });
  }
  clear(id: string): void { this.entries.delete(id); }
}
