import { VisionEventSchema } from './VisionEvent.js';
import { MovementObservationSchema } from './MovementObservation.js';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import { existsSync } from 'node:fs';

import path from 'node:path';

import { createInterface } from 'node:readline';

import { z } from 'zod';



export class VisionError extends Error {

  constructor(public readonly code: string) { super(code); }

}



export const VisionObservationSchema = z.object({
  moduleStatus: z.object({ face: z.literal('ready'), pose: z.enum(['ready','disabled','unavailable']), hands: z.enum(['ready','disabled','unavailable']) }).optional(),
  events: z.array(VisionEventSchema).max(10).default([]),
  movementObservation: MovementObservationSchema.optional(),

  directionEstimate: z.object({

    headDirections: z.array(z.enum(['left','right','up','down','unavailable'])).max(2),

    gazeDirections: z.array(z.enum(['left','right','up','down','unavailable'])).max(2),

    headReliable: z.boolean(), gazeReliable: z.boolean(),

    framing: z.enum(['unavailable','too_far','outside_useful_area','useful_area']),

    smoothedPoseDegrees: z.object({yaw: z.number().finite(), pitch: z.number().finite(), roll: z.number().finite()}).nullable(),

    headChangeDegrees: z.number().nonnegative().nullable(), unreliableForMs: z.number().nonnegative(), validSamples: z.number().int().nonnegative(), gazeUnreliableForMs: z.number().nonnegative(), reliabilityReason: z.string(),

    method: z.literal('landmark-geometric-estimate'), coordinateSystem: z.literal('unmirrored-camera'), calibrated: z.literal(false),

  }).optional(),

  faceState: z.enum(['FACE_PRESENT','FACE_NOT_DETECTED','TRACKING_LOST','MULTIPLE_FACES','QUALITY_LOW']).default('FACE_NOT_DETECTED'),

  faceQuality: z.object({ checks: z.object({ singleFace: z.boolean(), largeEnough: z.boolean(), wellLit: z.boolean(), sharpEnough: z.boolean(), forwardFacing: z.boolean() }), score: z.number().min(0).max(1), method: z.literal('image-and-geometry-checks'), detectorConfidence: z.null() }).optional(),

  faceTracks: z.array(z.object({ trackId: z.number().int().positive(), center: z.array(z.number().min(0).max(1)).length(2), bounds: z.array(z.number().min(0).max(1)).length(4), landmarks: z.array(z.array(z.number().min(0).max(1)).length(2)).max(14).default([]) })).max(3).default([]),

  headPoseDegrees: z.object({ yaw: z.number().min(-180).max(180), pitch: z.number().min(-90).max(90), roll: z.number().min(-180).max(180) }).nullable().default(null),

  gazeReliable: z.boolean().default(false),

  handObservations: z.array(z.object({ position: z.array(z.number()).length(2), gesture: z.enum(['open_fingers','curled_fingers','mixed_fingers','unavailable']), movement: z.number().nonnegative().nullable() })).max(2).default([]),

  positionShift: z.number().nonnegative().nullable().default(null),

  faceTrackingReliable: z.boolean().default(false),

  faceCount: z.number().int().min(0).max(3),

  headOrientation: z.enum(['unavailable', 'turned', 'roughly_forward']),

  gazeDirection: z.enum(['unavailable', 'possibly_sideways', 'roughly_centered']),

  upperBodyVisible: z.boolean(), upperBodyMovement: z.number().nonnegative().nullable(),

  handCount: z.number().int().min(0).max(2), handPositions: z.array(z.array(z.number()).length(2)).max(2),

  handMovement: z.number().nonnegative().nullable(),

});



/** One bounded local worker; never writes frames, landmarks or stdout to disk. */

export class ProctoringWorker {

  private child: ChildProcessWithoutNullStreams | null = null;

  private pending: { resolve: (value: unknown) => void; reject: (error: Error) => void } | null = null;

  private busy = false;
  private activeSession: string | null = null;
  private readonly sessions = new Set<string>();

  private idleTimer: ReturnType<typeof setTimeout> | null = null;



  constructor(private readonly timeoutMs = 20000) {}



  close(): void { if (this.idleTimer) clearTimeout(this.idleTimer); this.idleTimer = null; this.child?.kill(); this.child = null; this.pending?.reject(new VisionError('WORKER_STOPPED')); this.pending = null; this.sessions.clear(); }



  /** Release only the requested session; never interrupt another session's inference. */
  releaseSession(sessionId: string): void {
    if (this.activeSession === sessionId) { this.close(); return; }
    if (!this.sessions.delete(sessionId)) return;
    if (this.child) {
      this.child.stdin.write(JSON.stringify({command:'release',sessionId})+'\n');
      if (this.sessions.size === 0 && !this.busy) this.close();
    }
  }

  async analyze(sessionId: string, image: string): Promise<z.infer<typeof VisionObservationSchema>> {

    if (this.busy) throw new VisionError('WORKER_BUSY');

    if (this.idleTimer) clearTimeout(this.idleTimer); this.idleTimer = null;

    this.busy = true; this.activeSession = sessionId; this.sessions.add(sessionId);

    try {

      if (!this.child) {

        const localPython = path.resolve('.venv-proctoring', 'Scripts', 'python.exe');

        const python = process.env.PROCTORING_PYTHON ?? (existsSync(localPython) ? localPython : 'python');

        const child = spawn(python, ['-u', path.resolve('proctoring/worker.py')], { windowsHide: true, stdio: 'pipe' });

        this.child = child;

        child.stdin.on('error', () => { if (this.child === child) this.close(); });

        child.stderr.on('data', () => { /* Model runtime diagnostics are not candidate events. */ });

        createInterface({ input: child.stdout }).on('line', (line) => {

          if (this.child !== child) return;

          const pending = this.pending; this.pending = null;

          try { pending?.resolve(JSON.parse(line)); } catch { pending?.reject(new VisionError('WORKER_PROTOCOL_ERROR')); this.close(); }

        });

        const failed = () => { if (this.child === child) { this.pending?.reject(new VisionError('WORKER_START_OR_EXIT_FAILED')); this.pending = null; this.close(); } };

        child.on('error', failed); child.on('exit', failed);

      }

      const result = await new Promise<unknown>((resolve, reject) => {

        const timeout = setTimeout(() => { const pending = this.pending; this.pending = null; pending?.reject(new VisionError('ANALYSIS_TIMEOUT')); this.close(); }, this.timeoutMs);

        this.pending = { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } };

        this.child!.stdin.write(JSON.stringify({ sessionId, image, observedAt: Date.now() }) + '\n');

      });

      const parsedResponse = z.object({ ok: z.boolean(), observation: VisionObservationSchema.optional(), code: z.enum(['MODEL_MISSING','INVALID_FRAME','MODEL_OR_ANALYSIS_FAILED','DEPENDENCY_LOAD_FAILED']).optional(), error: z.string().optional() }).safeParse(result);
      if (!parsedResponse.success) { this.close(); throw new VisionError('WORKER_PROTOCOL_ERROR'); }
      const response=parsedResponse.data;

      if (!response.ok || !response.observation) throw new VisionError(response.code ?? 'MODEL_OR_ANALYSIS_FAILED');

      return response.observation;

    } finally {

      this.busy = false; this.activeSession = null;

      if (this.child) { this.idleTimer = setTimeout(() => this.close(), 60_000); this.idleTimer.unref(); }

    }

  }

}

