import { VisionEventSchema } from './VisionEvent.js';
import { MovementObservationSchema } from './MovementObservation.js';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import { existsSync } from 'node:fs';

import path from 'node:path';

import { fileURLToPath } from 'node:url';

import { createInterface } from 'node:readline';

import { z } from 'zod';

// src/api (or dist/api) -> project root. The API can be started from any working directory.
const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const VISION_WORKER = path.join(PROJECT_ROOT, 'proctoring', 'worker.py');

/** The vision interpreter: PROCTORING_PYTHON, else the project's .venv-proctoring (Windows or POSIX
 * layout), else the system `python` with a one-time warning (it usually lacks MediaPipe/OpenCV). */
export function visionPython(): { command: string; source: 'environment' | 'project-venv' | 'system-fallback' } {
  if (process.env.PROCTORING_PYTHON) return { command: process.env.PROCTORING_PYTHON, source: 'environment' };
  for (const candidate of [path.join(PROJECT_ROOT, '.venv-proctoring', 'Scripts', 'python.exe'), path.join(PROJECT_ROOT, '.venv-proctoring', 'bin', 'python')]) {
    if (existsSync(candidate)) return { command: candidate, source: 'project-venv' };
  }
  return { command: 'python', source: 'system-fallback' };
}

let warnedFallback = false;
/** Python's stderr is runtime diagnostics only (never frames or candidate data). Keep the tail so a
 * failed start is explained in the server log instead of being silently discarded. */
function lastMeaningfulLine(tail: string): string {
  const lines = tail.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !/^[WI]\d{4} |^WARNING: All log messages|inference_feedback_manager|landmark_projection_calculator/.test(line));
  return (lines.at(-1) ?? '').slice(0, 300);
}



export class VisionError extends Error {

  constructor(public readonly code: string) { super(code); }

}



export const VisionObservationSchema = z.object({
  moduleStatus: z.object({ face: z.literal('ready'), pose: z.enum(['ready','disabled','unavailable']), hands: z.enum(['ready','disabled','unavailable']), phone: z.enum(['ready','disabled','unavailable']).optional() }).optional(),
  runtime: z.object({
    acceleration: z.object({ requested: z.enum(['auto', 'gpu', 'cpu']), delegates: z.record(z.string(), z.enum(['gpu', 'cpu'])), active: z.enum(['gpu', 'cpu', 'mixed', 'none']), gpuUnavailableReason: z.string().nullable() }),
    modelLoadMs: z.number().nonnegative(),
  }).optional(),
  frame: z.object({ format: z.literal('jpeg'), width: z.number().int().positive().max(1280), height: z.number().int().positive().max(1280), bytes: z.number().int().positive().max(180_000), processingMs: z.number().nonnegative(), stagesMs: z.record(z.string(), z.number().nonnegative()).optional() }).optional(),
  frameQuality: z.object({ brightness: z.number().min(0).max(255), contrast: z.number().nonnegative(), usable: z.boolean() }).optional(),
  phoneObservation: z.object({
    status: z.enum(['not_scanned','not_seen','candidate','seen']), positiveScans: z.number().int().nonnegative(), recentScans: z.number().int().nonnegative(), requiredScans: z.number().int().positive(),
    score: z.number().min(0).max(1).nullable(), box: z.array(z.number().min(0).max(1)).length(4).nullable(), heldInHand: z.boolean(), seenForMs: z.number().nonnegative(),
    scoreThreshold: z.number().min(0).max(1), method: z.literal('efficientdet-lite0-coco-cell-phone'), calibrated: z.literal(false),
  }).optional(),
  events: z.array(VisionEventSchema).max(10).default([]),
  movementObservation: MovementObservationSchema.optional(),

  directionEstimate: z.object({

    headDirections: z.array(z.enum(['left','right','up','down','unavailable'])).max(2),

    gazeDirections: z.array(z.enum(['left','right','up','down','unavailable'])).max(2),

    headReliable: z.boolean(), gazeReliable: z.boolean(),

    framing: z.enum(['unavailable','too_far','outside_useful_area','useful_area']),

    smoothedPoseDegrees: z.object({yaw: z.number().finite(), pitch: z.number().finite(), roll: z.number().finite()}).nullable(),

    headChangeDegrees: z.number().nonnegative().nullable(), unreliableForMs: z.number().nonnegative(), validSamples: z.number().int().nonnegative(), gazeUnreliableForMs: z.number().nonnegative(), reliabilityReason: z.string(),

    eyesClosed: z.boolean().optional(), blinkHeld: z.boolean().optional(),

    /** Smoothed iris position minus the eye centre, in eye widths/heights (> 0: toward image right / down). */
    gazeOffset: z.object({ horizontal: z.number().finite(), vertical: z.number().finite() }).nullable().optional(),

    recentHeadTurns: z.number().int().nonnegative().optional(), headTurnWindowSeconds: z.number().int().positive().optional(), repeatedHeadTurns: z.boolean().optional(),

    method: z.literal('landmark-geometric-estimate'), coordinateSystem: z.literal('unmirrored-camera'), calibrated: z.literal(false),

  }).optional(),

  faceState: z.enum(['FACE_PRESENT','FACE_NOT_DETECTED','TRACKING_LOST','MULTIPLE_FACES','QUALITY_LOW']).default('FACE_NOT_DETECTED'),

  faceQuality: z.object({ checks: z.object({ singleFace: z.boolean(), largeEnough: z.boolean(), wellLit: z.boolean(), sharpEnough: z.boolean(), forwardFacing: z.boolean() }), score: z.number().min(0).max(1), method: z.literal('image-and-geometry-checks'), detectorConfidence: z.null(), lowLight: z.boolean().optional(), recovery: z.enum(['none', 'low-light', 'pose-guided', 'zoomed', 'person-scan']).optional() }).optional(),

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
  /** Interviews share one Python process: a frame waits briefly for the current one instead of failing. */
  private readonly waiting: (() => void)[] = [];
  static readonly maximumWaiting = 4;
  private activeSession: string | null = null;
  private readonly sessions = new Set<string>();

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private announced: ChildProcessWithoutNullStreams | null = null;



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

    if (this.busy) {
      if (this.waiting.length >= ProctoringWorker.maximumWaiting) throw new VisionError('WORKER_BUSY');
      await new Promise<void>((resolve) => this.waiting.push(resolve)); // ownership is handed over still busy
    }
    if (this.idleTimer) clearTimeout(this.idleTimer); this.idleTimer = null;
    this.busy = true; this.activeSession = sessionId; this.sessions.add(sessionId);

    try {

      if (!this.child) {

        const python = visionPython();
        if (python.source === 'system-fallback' && !warnedFallback) { warnedFallback = true; console.warn('[vision] .venv-proctoring not found; using system "python", which usually lacks MediaPipe/OpenCV. Run: npm run setup:vision'); }

        const child = spawn(python.command, ['-u', VISION_WORKER], { windowsHide: true, stdio: 'pipe', cwd: path.dirname(VISION_WORKER) });
        let stderrTail = '';

        this.child = child;

        child.stdin.on('error', () => { if (this.child === child) this.close(); });

        child.stderr.on('data', (chunk: Buffer) => { stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4000); });

        createInterface({ input: child.stdout }).on('line', (line) => {

          if (this.child !== child) return;

          const pending = this.pending; this.pending = null;

          try { pending?.resolve(JSON.parse(line)); } catch { pending?.reject(new VisionError('WORKER_PROTOCOL_ERROR')); this.close(); }

        });

        const failed = (reason: unknown, signal?: NodeJS.Signals | null) => {
          if (this.child !== child) return;
          const detail = reason instanceof Error ? reason.message : signal ? `terminated by ${signal}` : `exit code ${String(reason)}`;
          console.error(`[vision] Python worker stopped (${detail}; interpreter: ${python.source}). ${lastMeaningfulLine(stderrTail) || 'No error output.'}`);
          this.pending?.reject(new VisionError('WORKER_START_OR_EXIT_FAILED')); this.pending = null; this.close();
        };

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
      // Say once per Python process how it started: load time and which delegate the models use.
      if (response.observation?.runtime && this.announced !== this.child) {
        this.announced = this.child;
        const { acceleration, modelLoadMs } = response.observation.runtime;
        const delegates = Object.entries(acceleration.delegates).map(([model, delegate]) => `${model}=${delegate}`).join(', ');
        console.info(`[vision] Python worker ready: models loaded in ${modelLoadMs} ms; acceleration ${acceleration.active} (requested ${acceleration.requested}; ${delegates})${acceleration.gpuUnavailableReason && acceleration.requested !== 'cpu' ? `; GPU not used: ${acceleration.gpuUnavailableReason}` : ''}.`);
        if (acceleration.requested === 'gpu' && acceleration.active !== 'gpu') console.warn('[vision] PROCTORING_ACCELERATION=gpu was requested but the models run on CPU; analysis continues on CPU.');
      }

      if (!response.ok || !response.observation) {
        // Environment problems are operator errors: say so once per occurrence in the server log.
        if (response.code === 'DEPENDENCY_LOAD_FAILED' || response.code === 'MODEL_MISSING') console.error(`[vision] ${response.code}: the vision environment is incomplete. Run: npm run setup:vision`);
        throw new VisionError(response.code ?? 'MODEL_OR_ANALYSIS_FAILED');
      }

      return response.observation;

    } finally {

      this.activeSession = null;
      const next = this.waiting.shift();
      if (next) next();
      else {
        this.busy = false;
        if (this.child) { this.idleTimer = setTimeout(() => this.close(), 60_000); this.idleTimer.unref(); }
      }

    }

  }

}

