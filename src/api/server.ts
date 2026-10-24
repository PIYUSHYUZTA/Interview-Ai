import { synthesizeInterviewSpeech, recognizeInterviewSpeech } from './InterviewSpeech.js';
import { VISION_TRANSITION_TYPES } from '../core/session/IntegrityPolicy.js';
import { eligibleVisionEvent, technicalVisionEvent } from './VisionEvent.js';
import { FaceReadiness } from './FaceReadiness.js';

import { EvaluationUnavailableError } from '../core/assessment/evaluators/NarrativeEvaluator.js';

import { serviceConfig, ServiceConfigSchema, type ServiceConfig } from './ServiceConfig.js';

import { SQLiteDocuments } from './SQLiteDocuments.js';

import { DatabaseSessionStore } from './DatabaseSessionStore.js';

import { existsSync } from 'node:fs';

import { loadEnvFile } from '../core/provider/providerFactory.js';

import { candidateProgress, practicePriorities } from './CandidateProgress.js';

import { roleReadiness, answerFeedback } from './assessmentPresentation.js';

import { ProctoringWorker, VisionError } from './ProctoringWorker.js';

import { buildDetailedReport, transcriptAnswer } from './DetailedReport.js';

import { InterviewReportStore } from './InterviewReportStore.js';

import { extractResumeFile, ResumeFileError } from './ResumeFileExtractor.js';

import { rolePresets, interviewTypes } from './interviewOptions.js';

import { ResumeFileRequestSchema, InterviewOptionsSchema, InterviewListSchema } from './schemas.js';

import type { Difficulty } from '../core/types.js';

import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';

import { CandidateIntelligenceModelBuilder } from '../core/intelligence/CandidateIntelligenceModel.js';

import { JobRequirementIntelligence } from '../core/jobs/JobRequirementIntelligence.js';

import { InterviewPlanner } from '../core/planner/InterviewPlanner.js';

import { CareerPathDetector } from '../core/understanding/CareerPathDetector.js';

import { extractResumeInsights } from '../core/understanding/ResumeInsights.js';

import * as http from 'node:http';

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import * as path from 'node:path';

import { TLSSocket } from 'node:tls';

import { z } from 'zod';

import {

  ResumeAnalyzer,

  ProfileBuilder,

  ScoringEngine,

  GapAnalyzer,

  RoadmapPlanner,

  resolveAIProvider,

  InterviewStateMachine,

  InterviewState,

  InvalidStateTransitionError,

  performanceBand,

  type InterviewSessionStore,

  InMemorySessionStore,

  FileSessionStore,

  type SessionConfig,

  type RoleRequirement,

  INTERVIEW_INTEGRITY_POLICY,

  validateIntegrityEvent,

} from '../index.js';

import { STRONG_RESUME } from '../testSupport/fixtures.js';

import {

  ResumeUploadRequestSchema,

  ResumeUploadResponseSchema,

  ResumeGetResponseSchema,

  InterviewCreateRequestSchema,

  InterviewCreateResponseSchema,

  InterviewStartResponseSchema,

  InterviewAnswerRequestSchema,

  InterviewAnswerResponseSchema,

  InterviewNextQuestionResponseSchema,

  InterviewCompleteResponseSchema,

  InterviewResultsResponseSchema,

  IntegrityEventRequestSchema,

  IntegrityEventResponseSchema,

  ErrorResponseSchema,

  InterviewDiagnosticsSchema,

} from './schemas.js';

import { CandidateAuthError, CandidateAuthStore, type CandidateAccount } from './CandidateAuthStore.js';

import {

  CandidateAuthResponseSchema,

  CandidateLoginRequestSchema,

  CandidateProfileResponseSchema,

  CandidateRegisterRequestSchema,

} from './schemas.js';



export interface ApiServerOptions {

  readonly config?: Partial<ServiceConfig>;

  readonly store?: InterviewSessionStore;

  readonly provider?: ReturnType<typeof resolveAIProvider>;

  readonly port?: number;

  readonly dataDirectory?: string;

  readonly authenticationRequired?: boolean;

}



interface StoredResume {

  resumeId: string;

  candidateName: string;

  resumeText: string;

  profile: any;

  audit: any;

  careerPath?: any;

  insights?: any;

  updatedAt: string;

}



interface CompletedInterviewResults {

  overallScore: number;

  performanceBand: string;

  componentScores: any;

  gaps: any[];

  roadmap: any[];

}



/**

 * Section 16 API Layer.

 *

 * Exposes backend-authoritative REST endpoints backed by the real engine services.

 * Every response is strictly validated against a Zod schema before transmission.

 */

export class ApiServer {

  private readonly store: InterviewSessionStore;

  private readonly provider: ReturnType<typeof resolveAIProvider>;

  private readonly authStore: CandidateAuthStore;

  private readonly authenticationRequired: boolean;

  private readonly resumes = new Map<string, StoredResume>();

  private readonly results = new Map<string, CompletedInterviewResults>();

  private readonly authAttempts = new Map<string, number[]>();

  private readonly integrityTokens = new Map<string, string>();

  private readonly integrityRequestTimes = new Map<string, number[]>();

  private readonly speechPending = new Set<string>();

  private readonly sessionLocks = new Map<string, Promise<void>>();

  private readonly vision: ProctoringWorker;

  private readonly config: ServiceConfig;

  private readonly database?: SQLiteDocuments;

  private readonly reports: InterviewReportStore;

  private readonly visionDiagnostics = new Map<string, { framesReceived: number; framesAnalyzed: number; failures: number; service: string; lastFrameAt: string | null; lastObservationAt: string | null; lastDecision: string }>();

  private readonly faceReadiness = new FaceReadiness();

  private readonly visionRevoked = new Set<string>();

  private readonly visionPending = new Set<string>();

  private readonly visionSamples = new Map<string, { at: number; absentSince: number | null; multipleSince: number | null; headSince: number | null; gazeSince: number | null; positionSince: number | null }>();

  private readonly server: http.Server;



  constructor(options: ApiServerOptions = {}) {

    loadEnvFile();

    this.config = ServiceConfigSchema.parse({ ...serviceConfig(), ...options.config, ...(options.port === undefined ? {} : { port: options.port }) });

    this.provider = options.provider ?? (this.config.providerMode === 'deterministic' ? new DeterministicProvider() : resolveAIProvider(this.config.providerMode === 'live'));

    this.vision = new ProctoringWorker(this.config.visionTimeoutMs);

    const dataDirectory = path.resolve(options.dataDirectory ?? this.config.dataDirectory);

    this.authenticationRequired = options.authenticationRequired ?? true;

    if (this.authenticationRequired && this.config.storage === 'sqlite') {

      this.database = new SQLiteDocuments(dataDirectory);

      if (existsSync(path.join(dataDirectory, 'candidates.json')) && !this.database.get('metadata', 'fileMigration')) {

        this.database.close();

        throw new Error('Existing file data detected. Stop the API and run npm run migrate:sqlite before selecting SQLite.');

      }

    }

    this.reports = new InterviewReportStore(this.authenticationRequired ? path.join(dataDirectory, 'reports') : undefined, this.database);

    this.authStore = new CandidateAuthStore(dataDirectory, this.database);

    this.store = options.store ?? (this.authenticationRequired

      ? this.database ? new DatabaseSessionStore(this.database, { provider: this.provider, seed: 42 }) : new FileSessionStore({ provider: this.provider, seed: 42 }, path.join(dataDirectory, 'interviews'))

      : new InMemorySessionStore({ provider: this.provider, seed: 42 }));

    this.server = http.createServer((req, res) => this.handleRequest(req, res));

    this.server.on('close', () => { this.vision.close(); this.database?.close(); });

    this.server.requestTimeout = 120000;

    this.server.headersTimeout = 15000;

  }



  get httpServer(): http.Server {

    return this.server;

  }



  async listen(port = this.config.port): Promise<{ port: number; close: () => Promise<void> }> {

    return new Promise((resolve, reject) => {

      this.server.once('error', reject);

      this.server.listen(port, this.config.host, () => {

        this.server.removeListener('error', reject);

        const addr = this.server.address();

        const actualPort = typeof addr === 'object' && addr ? addr.port : port;

        resolve({

          port: actualPort,

          close: () => new Promise((res) => this.server.close(() => res())),

        });

      });

    });

  }



  /**

   * Central HTTP request dispatcher.

   */

  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {

    let url: URL;

    try { url = new URL(req.url ?? '/', 'http://localhost'); }

    catch { this.sendError(res, 400, 'Invalid request URL.'); return; }

    const method = (req.method ?? 'GET').toUpperCase();

    const pathname = url.pathname.replace(/\/+$/, '') || '/';



    res.setHeader('Cache-Control', 'no-store');

    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.setHeader('Referrer-Policy', 'no-referrer');

    const origin = req.headers.origin;

    // Vite proxy may rewrite Host; explicitly configured origins support that boundary.

    const sameOrigin = `${req.socket instanceof TLSSocket && req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;

    if (origin && origin !== sameOrigin && !this.config.allowedOrigins.includes(origin)) {

      this.sendError(res, 403, 'Request origin is not allowed.'); return;

    }

    if (origin) {

      res.setHeader('Access-Control-Allow-Origin', origin);

      res.setHeader('Access-Control-Allow-Credentials', 'true');

      res.setHeader('Vary', 'Origin');

    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.headers['sec-fetch-site'] === 'cross-site' && !origin) { this.sendError(res, 403, 'Cross-site requests require an allowed origin.'); return; }

    if (method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }



    try {

      if (method === 'GET' && pathname === '/health') {

        this.sendJson(res, 200, { status: 'ok', storage: this.store instanceof DatabaseSessionStore ? 'sqlite' : this.store instanceof FileSessionStore ? 'file' : 'memory', provider: this.provider.name, evaluationMode: this.provider.name === 'deterministic' ? 'heuristic-demo' : 'configured-not-health-tested', resumeAnalysis: 'local-structured-analysis', reportGeneration: 'application-owned', questionGeneration: 'application-adaptive-selector', speech: 'browser-capability-dependent', localSpeech: process.platform==='win32'&&process.env.INTERVIEW_SPEECH!=='browser'?'windows-sapi-unprobed':'unavailable', vision: 'local-python-on-demand' }); return;

      }

      if (method === 'POST' && ['/auth/login', '/auth/register'].includes(pathname)) {

        const now = Date.now();

        for (const [ip, attempts] of this.authAttempts) if (attempts.at(-1)! <= now - this.config.authWindowMs) this.authAttempts.delete(ip);

        const ip = req.socket.remoteAddress ?? 'unknown';

        const attempts = (this.authAttempts.get(ip) ?? []).filter((time) => time > now - this.config.authWindowMs);

        if (attempts.length >= this.config.authAttemptsPerWindow || (!this.authAttempts.has(ip) && this.authAttempts.size >= 5000)) {

          res.setHeader('Retry-After', String(Math.ceil(this.config.authWindowMs / 1000)));

          this.sendError(res, 429, 'Too many sign-in attempts. Please wait before trying again.'); return;

        }

        this.authAttempts.set(ip, [...attempts, now]);

      }

      const candidate = this.authenticateRequest(req);

      if (this.authenticationRequired && this.requiresCandidate(pathname) && !candidate) {

        this.sendError(res, 401, 'Sign in to access your candidate workspace.', { code: 'AUTHENTICATION_REQUIRED' });

        return;

      }

      const candidateId = candidate?.id ?? 'anonymous';



      if (method === 'GET' && pathname === '/auth/me') {

        this.sendValidated(res, 200, CandidateProfileResponseSchema, {

          candidate,

          resumes: candidate ? this.authStore.resumeSummaries(candidate.id) : [],

        }); return;

      }

      if (method === 'POST' && pathname === '/auth/register') {

        const input = CandidateRegisterRequestSchema.parse(await this.readJsonBody(req, 16 * 1024));

        const result = await this.authStore.register(input);

        this.setAuthCookie(req, res, result.token);

        this.sendValidated(res, 201, CandidateAuthResponseSchema, { candidate: result.candidate, resumes: [] }); return;

      }

      if (method === 'POST' && pathname === '/auth/login') {

        const input = CandidateLoginRequestSchema.parse(await this.readJsonBody(req, 16 * 1024));

        const result = await this.authStore.login(input);

        this.setAuthCookie(req, res, result.token);

        this.sendValidated(res, 200, CandidateAuthResponseSchema, { candidate: result.candidate, resumes: this.authStore.resumeSummaries(result.candidate.id) }); return;

      }

      if (method === 'POST' && pathname === '/auth/logout') {

        this.authStore.logout(this.sessionToken(req));

        this.clearAuthCookie(req, res);

        this.sendJson(res, 200, { ok: true }); return;

      }



      if (method === 'GET' && pathname === '/interviews/options') {

        this.sendValidated(res, 200, InterviewOptionsSchema, {

          providerName: this.provider.name,

          roles: Object.entries(rolePresets).map(([id, role]) => ({ id, title: role.title })),

          interviewTypes: Object.entries(interviewTypes).map(([id, rounds]) => ({ id, rounds: rounds.length, label: id === 'full' ? 'Complete interview' : id === 'technical' ? 'Technical deep dive' : 'Behavioral & communication' })),

        }); return;

      }

      if (method === 'GET' && pathname === '/interviews/progress') {

        const progress = candidateProgress(await this.candidateReports(candidateId));

        this.sendJson(res, 200, { ...progress, latestResumeId: this.authenticationRequired ? this.authStore.resumeSummaries(candidateId)[0]?.resumeId ?? null : null }); return;

      }

      if (method === 'GET' && pathname === '/interviews') {

        const sessions = await Promise.all((await this.store.list())

          .filter((id) => !this.authenticationRequired || this.authStore.ownsInterview(candidateId, id))

          .map((id) => this.store.load(id)));

        this.sendValidated(res, 200, InterviewListSchema, { storage: this.database ? 'sqlite' : this.store instanceof FileSessionStore ? 'file' : 'memory', interviews: sessions.filter((s) => s !== null).reverse().map((s) => ({

          sessionId: s.sessionId, candidateName: s.config.profile.candidateName, roleTitle: s.config.role.title,

          state: s.state, answered: s.questionHistory.length, totalQuestions: s.config.interviewPlan?.totalQuestionBudget ?? 0,

          overallScore: s.state === InterviewState.COMPLETED && s.hasCompletedPlan ? ScoringEngine.calculate(s.questionHistory.flatMap((h) => h.evaluation ? [h.evaluation] : [])).overallScore * 10 : null,

        })) }); return;

      }

      if (method === 'POST' && pathname === '/resumes/file') {

        const body = ResumeFileRequestSchema.parse(await this.readJsonBody(req, 8 * 1024 * 1024));

        const extractedText = await extractResumeFile(body.fileName, Buffer.from(body.contentBase64, 'base64'));

        await this.analyzeResume(extractedText, body.candidateName, res, candidateId); return;

      }

      // 1. POST /resumes/upload

      if (method === 'POST' && pathname === '/resumes/upload') {

        await this.handleResumeUpload(req, res, candidateId);

        return;

      }



      // 2. GET /resumes/:id

      const resumeMatch = pathname.match(/^\/resumes\/([a-zA-Z0-9_-]+)$/);

      if (method === 'GET' && resumeMatch) {

        await this.handleResumeGet(resumeMatch[1], res, candidateId);

        return;

      }



      // 3. POST /interviews

      if (method === 'POST' && pathname === '/interviews') {

        await this.handleInterviewCreate(req, res, candidateId);

        return;

      }



      // 4. POST /interviews/:id/start

      const startMatch = pathname.match(/^\/interviews\/([a-zA-Z0-9_-]+)\/start$/);

      if (method === 'POST' && startMatch) {

        if (this.rejectForeignInterview(candidateId, startMatch[1], res)) return;

        await this.withSessionLock(startMatch[1], () => this.handleInterviewStart(startMatch[1], req, res));

        return;

      }



      const transcriptionMatch = pathname.match(/^\/interviews\/([a-zA-Z0-9_-]+)\/transcribe$/);
      if(method === 'POST' && transcriptionMatch){
        const id=transcriptionMatch[1];if(this.rejectForeignInterview(candidateId,id,res))return;
        const input=z.object({questionId:z.string().min(1).max(200),audioBase64:z.string().min(60).max(5_200_000).regex(/^[A-Za-z0-9+/]*={0,2}$/)}).strict().parse(await this.readJsonBody(req,5_300_000));
        const session=await this.store.load(id);if(!session){this.sendError(res,404,'Interview not found.');return;}
        if(this.rejectTerminated(session,res))return;
        if(session.state!==InterviewState.IN_PROGRESS||session.currentQuestion?.id!==input.questionId){this.sendError(res,409,'Transcription requires the current active question.');return;}
        const wav=Buffer.from(input.audioBase64,'base64');
        if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE'||wav.length>3_840_044||wav.length<100){this.sendError(res,415,'A valid short PCM WAV recording is required.');return;}
        if(this.speechPending.has(id)||this.speechPending.size>=2){this.sendError(res,429,'Speech is busy. Retry shortly.');return;}
        this.speechPending.add(id);const abort=new AbortController();const disconnected=()=>{if(!res.writableEnded)abort.abort();};res.on('close',disconnected);
        try{
          const result=await recognizeInterviewSpeech(input.audioBase64,abort.signal);
          const current=await this.store.load(id);if(abort.signal.aborted)return;
          if(!current||current.state!==InterviewState.IN_PROGRESS||current.currentQuestion?.id!==input.questionId){this.sendError(res,409,'Interview changed during transcription.');return;}
          if(!result.text.trim()||result.confidence<.3){this.sendError(res,422,'No clear speech was recognized. Please retry your spoken answer.');return;}
          res.setHeader('Cache-Control','no-store');this.sendJson(res,200,{...result,source:'windows-sapi',questionId:input.questionId});
        }catch{if(!abort.signal.aborted)this.sendError(res,503,'Local transcription is unavailable. Check the installed English dictation engine and retry.');}
        finally{this.speechPending.delete(id);res.off('close',disconnected);}return;
      }

      // Speech comes only from the current owned question; it never advances state.
      const speechMatch = pathname.match(/^\/interviews\/([a-zA-Z0-9_-]+)\/speech$/);
      if (method === 'POST' && speechMatch) {
        const id = speechMatch[1]; if (this.rejectForeignInterview(candidateId, id, res)) return;
        const input = z.object({ questionId: z.string().min(1).max(200) }).strict().parse(await this.readJsonBody(req, 1024));
        const session = await this.store.load(id);
        if (!session) { this.sendError(res, 404, 'Interview not found.'); return; }
        if (this.rejectTerminated(session, res)) return;
        if (session.state !== InterviewState.IN_PROGRESS || session.currentQuestion?.id !== input.questionId) { this.sendError(res, 409, 'Speech is available only for the current active question.'); return; }
        if (this.speechPending.has(id) || this.speechPending.size >= 2) { this.sendError(res, 429, 'Speech is busy. Retry question playback shortly.'); return; }
        this.speechPending.add(id);
        const abort = new AbortController();
        const disconnected = () => { if (!res.writableEnded) abort.abort(); };
        res.on('close', disconnected);
        try {
          const greeting = session.toPublicState().progress.totalQuestionsAnswered === 0 ? 'Welcome to your interview. Take your time, and explain your thinking. ' : '';
          const speech = await synthesizeInterviewSpeech(greeting + session.currentQuestion.prompt, abort.signal);
          const current = await this.store.load(id);
          if (abort.signal.aborted) return;
          if (!current || current.state !== InterviewState.IN_PROGRESS || current.currentQuestion?.id !== input.questionId) { this.sendError(res, 409, 'The interview changed while speech was being prepared.'); return; }
          res.setHeader('Cache-Control','no-store');
          this.sendJson(res, 200, { ...speech, questionId: input.questionId, mimeType: 'audio/wav', source: 'windows-sapi' });
        } catch { if (!abort.signal.aborted) this.sendError(res, 503, 'Synchronized local speech is unavailable. Browser playback can be used without lip synchronization.', {code:'SPEECH_UNAVAILABLE'}); }
        finally { this.speechPending.delete(id); res.off('close', disconnected); }
        return;
      }

      // 5. POST /interviews/:id/answer

      const answerMatch = pathname.match(/^\/interviews\/([a-zA-Z0-9_-]+)\/answer$/);

      if (method === 'POST' && answerMatch) {

        if (this.rejectForeignInterview(candidateId, answerMatch[1], res)) return;

        await this.withSessionLock(answerMatch[1], () => this.handleInterviewAnswer(answerMatch[1], req, res));

        return;

      }



      const diagnosticsMatch = pathname.match(/^\/interviews\/([a-zA-Z0-9_-]+)\/diagnostics$/);

      if (method === 'GET' && diagnosticsMatch) {

        const id = diagnosticsMatch[1]; if (this.rejectForeignInterview(candidateId, id, res)) return;

        const session = await this.store.load(id); if (!session) { this.sendError(res, 404, 'Interview not found.'); return; }

        this.sendValidated(res, 200, InterviewDiagnosticsSchema, { python: this.visionDiagnostics.get(id) ?? { framesReceived: 0, framesAnalyzed: 0, failures: 0, service: 'not_started', lastFrameAt: null, lastObservationAt: null, lastDecision: 'Python starts on the first consented camera sample.' }, events: session.integrityEvents.slice(-30).map((event) => ({ eventType: event.eventType, occurredAt: event.occurredAt, durationMs: event.durationMs, warningNumber: event.warningNumber, policyDecision:event.policyDecision, eventId: event.eventId, sessionId: event.sessionId, confidence: event.confidence, severity: event.severity, details: event.details })), warningCount: session.toPublicState().integrity.warningCount, state: session.state, policy: { visualNoticeMs: this.config.visionNoticeMs, hiddenTabMs: INTERVIEW_INTEGRITY_POLICY.minimumTabHiddenDurationMs, graceMs: INTERVIEW_INTEGRITY_POLICY.monitoringGracePeriodMs, penaltySignals: ['tab_hidden'], contextualSignals: ['window_unfocused', 'fullscreen_exited', 'camera_interrupted', 'microphone_interrupted', 'connection_interrupted', 'face_absent', 'multiple_faces', 'head_turned', 'gaze_away', 'position_changed', 'tab_visible', ...VISION_TRANSITION_TYPES] } }); return;

      }

      const faceMatch = pathname.match(/^\/interviews\/([a-zA-Z0-9_-]+)\/face-check$/);

      if (faceMatch) {

        const id = faceMatch[1]; if (this.rejectForeignInterview(candidateId, id, res)) return;

        if (!this.validIntegrityToken(id, req)) { this.sendError(res, 401, 'Face-readiness access is not authorized.'); return; }

        const session = await this.store.load(id);

        if (!session) { this.sendError(res, 404, 'Interview not found.'); return; }

        if (this.rejectTerminated(session, res)) return;

        if (method === 'GET') { this.sendJson(res, 200, this.faceReadiness.get(id, Date.now(), session.state === InterviewState.READY ? 30_000 : 6000)); return; }

        if (method === 'DELETE') { this.releaseVision(id); this.sendJson(res, 200, this.faceReadiness.get(id)); return; }

        if (method === 'POST') { await this.handleVisionFrame(id, req, res, true); return; }

      }

      const frameMatch = pathname.match(/^\/interviews\/([a-zA-Z0-9_-]+)\/proctoring-frame$/);

      if (method === 'POST' && frameMatch) {

        if (this.rejectForeignInterview(candidateId, frameMatch[1], res)) return;

        await this.handleVisionFrame(frameMatch[1], req, res);

        return;

      }

      const integrityMatch = pathname.match(/^\/interviews\/([a-zA-Z0-9_-]+)\/integrity-events$/);

      if (method === 'POST' && integrityMatch) {

        if (this.rejectForeignInterview(candidateId, integrityMatch[1], res)) return;

        await this.withSessionLock(integrityMatch[1], () => this.handleIntegrityEvent(integrityMatch[1], req, res));

        return;

      }



      // 6. POST /interviews/:id/next-question

      const nextQMatch = pathname.match(/^\/interviews\/([a-zA-Z0-9_-]+)\/next-question$/);

      if (method === 'POST' && nextQMatch) {

        if (this.rejectForeignInterview(candidateId, nextQMatch[1], res)) return;

        await this.withSessionLock(nextQMatch[1], () => this.handleInterviewNextQuestion(nextQMatch[1], res));

        return;

      }



      // 7. POST /interviews/:id/complete

      const completeMatch = pathname.match(/^\/interviews\/([a-zA-Z0-9_-]+)\/complete$/);

      if (method === 'POST' && completeMatch) {

        if (this.rejectForeignInterview(candidateId, completeMatch[1], res)) return;

        await this.withSessionLock(completeMatch[1], () => this.handleInterviewComplete(completeMatch[1], res));

        return;

      }



      // 8. GET /interviews/:id/results

      const resultsMatch = pathname.match(/^\/interviews\/([a-zA-Z0-9_-]+)\/results$/);

      if (method === 'GET' && resultsMatch) {

        if (this.rejectForeignInterview(candidateId, resultsMatch[1], res)) return;

        await this.withSessionLock(resultsMatch[1], () => this.handleInterviewResults(resultsMatch[1], res));

        return;

      }



      // 9. GET /interviews or GET /interviews/recent

      if (method === 'GET' && (pathname === '/interviews' || pathname === '/interviews/recent')) {

        await this.handleInterviewsList(res, candidateId);

        return;

      }



      this.sendError(res, 404, `Endpoint not found: ${method} ${pathname}`);

    } catch (err: any) {

      if (err instanceof EvaluationUnavailableError) { this.sendError(res, 503, err.message, { code: 'EVALUATION_UNAVAILABLE' }); return; }

      if (err instanceof HttpInputError) { this.sendError(res, err.status, err.message); return; }

      if (err instanceof CandidateAuthError) { this.sendError(res, err.statusCode, err.message); return; }

      if (err instanceof ResumeFileError) { this.sendError(res, 422, err.message); return; }

      if (err instanceof InvalidStateTransitionError) {

        this.sendError(res, 409, err.message, { code: 'INVALID_STATE_TRANSITION' });

        return;

      }

      if (err instanceof z.ZodError) {

        this.sendError(res, 400, 'Payload validation error', { details: (err as any).issues ?? (err as any).errors });

        return;

      }

      console.error(`[api] ${method} ${pathname}: ${err?.name ?? 'Error'}`);

      this.sendError(res, 500, 'The request could not be completed. Please retry or contact the operator.');

    }

  }



  // ---------------------------------------------------------------------------

  // Route Handlers

  // ---------------------------------------------------------------------------



  private authenticateRequest(req: http.IncomingMessage): CandidateAccount | null {

    return this.authStore.candidateForToken(this.sessionToken(req));

  }



  private sessionToken(req: http.IncomingMessage): string | undefined {

    const cookieHeader = req.headers.cookie ?? '';

    const pair = cookieHeader.split(';').map((part) => part.trim()).find((part) => part.startsWith('interview_session='));

    return pair?.slice('interview_session='.length);

  }



  private requiresCandidate(pathname: string): boolean {

    if (pathname === '/interviews/options' || pathname.startsWith('/auth/')) return false;

    return pathname === '/interviews' || pathname.startsWith('/interviews/') || pathname === '/resumes' || pathname.startsWith('/resumes/');

  }



  private rejectForeignInterview(candidateId: string, interviewId: string, res: http.ServerResponse): boolean {

    if (!this.authenticationRequired || this.authStore.ownsInterview(candidateId, interviewId)) return false;

    this.sendError(res, 404, 'Interview session not found.');

    return true;

  }



  private setAuthCookie(req: http.IncomingMessage, res: http.ServerResponse, token: string): void {

    const secure = (req.socket instanceof TLSSocket && req.socket.encrypted) || (this.config.trustProxy && req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';

    res.setHeader('Set-Cookie', `interview_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${14 * 24 * 60 * 60}${secure}`);

    res.setHeader('Cache-Control', 'no-store');

  }



  private clearAuthCookie(req: http.IncomingMessage, res: http.ServerResponse): void {

    const secure = (req.socket instanceof TLSSocket && req.socket.encrypted) || (this.config.trustProxy && req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';

    res.setHeader('Set-Cookie', `interview_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);

    res.setHeader('Cache-Control', 'no-store');

  }



  private sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {

    res.statusCode = statusCode;

    res.setHeader('Content-Type', 'application/json');

    res.end(JSON.stringify(payload));

  }



  /**

   * POST /resumes/upload

   * Runs ResumeAnalyzer on raw text or extracted file data (PDF, DOCX, TXT), generates structured profile, enforces anti-hallucination audit.

   */

  private async handleResumeUpload(req: http.IncomingMessage, res: http.ServerResponse, candidateId: string): Promise<void> {

    const rawBody = await this.readJsonBody(req, 8 * 1024 * 1024);

    const parsedBody = ResumeUploadRequestSchema.parse(rawBody);



    let resumeText = (parsedBody.resumeText ?? '').trim();

    if (!resumeText && parsedBody.fileBase64) {

      resumeText = await this.extractTextFromFile(parsedBody.fileBase64, parsedBody.fileName);

    }



    if (resumeText.length < 10 || resumeText.length > 100_000) {

      this.sendError(res, 400, 'Could not extract sufficient text from the document. Please check the file or paste the text directly.');

      return;

    }



    await this.analyzeResume(resumeText, parsedBody.candidateName, res, candidateId);

  }



  private async analyzeResume(resumeText: string, name: string | undefined, res: http.ServerResponse, candidateId: string): Promise<void> {

    const analyzer = new ResumeAnalyzer({ provider: this.provider });

    const profileOutput = await analyzer.analyzeAsync(resumeText);

    const audit = analyzer.audit(resumeText, profileOutput);



    const resumeId = `resume_${randomUUID()}`;

    let candidateName = name?.trim();

    if (!candidateName) {

      const firstLine = resumeText.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';

      if (firstLine.length > 2 && firstLine.length < 50 && !firstLine.includes(':') && !firstLine.includes('{')) {

        candidateName = firstLine;

      } else {

        candidateName = 'Candidate';

      }

    }



    const candidateProfile = new ProfileBuilder().build({ resumeText, candidateNameOverride: candidateName });

    const careerPath = new CareerPathDetector().detect(candidateProfile, resumeText);

    const insights = extractResumeInsights(candidateProfile, resumeText);



    const stored: StoredResume = {

      resumeId,

      candidateName,

      resumeText,

      profile: profileOutput,

      audit,

      careerPath,

      insights,

      updatedAt: new Date().toISOString(),

    };

    this.resumes.set(resumeId, stored);

    if (this.authenticationRequired) this.authStore.saveResume(candidateId, stored);



    const responsePayload = {

      resumeId,

      candidateName,

      resumeText,

      extractedText: resumeText,

      profile: profileOutput,

      audit,

      careerPath,

      insights,

    };



    // Schema validation before output leaves API

    this.sendValidated(res, 201, ResumeUploadResponseSchema, responsePayload);

  }



  /**

   * GET /resumes/:id

   */

  private async handleResumeGet(resumeId: string, res: http.ServerResponse, candidateId: string): Promise<void> {

    const stored = this.authenticationRequired ? this.authStore.getResume(candidateId, resumeId) : this.resumes.get(resumeId) ?? null;

    if (!stored) {

      this.sendError(res, 404, `Resume with id "${resumeId}" not found.`);

      return;

    }



    const responsePayload = {

      extractedText: stored.resumeText,

      resumeId: stored.resumeId,

      candidateName: stored.candidateName,

      profile: stored.profile,

      audit: stored.audit,

      careerPath: stored.careerPath,

      insights: stored.insights,

    };



    this.sendValidated(res, 200, ResumeGetResponseSchema, responsePayload);

  }



  /**

   * POST /interviews

   * Initializes InterviewStateMachine in state CREATED, calls prepare() to transition to READY.

   */

  private async handleInterviewCreate(req: http.IncomingMessage, res: http.ServerResponse, candidateId: string): Promise<void> {

    const rawBody = await this.readJsonBody(req);

    const parsedBody = InterviewCreateRequestSchema.parse(rawBody);



    let resumeText = parsedBody.resumeText;

    let candidateName = 'Candidate';



    if (parsedBody.resumeId) {

      const stored = this.authenticationRequired ? this.authStore.getResume(candidateId, parsedBody.resumeId) : this.resumes.get(parsedBody.resumeId) ?? null;

      if (!stored) {

        this.sendError(res, 404, `Referenced resumeId "${parsedBody.resumeId}" not found.`);

        return;

      }

      resumeText = stored.resumeText;

      candidateName = stored.candidateName;

    }



    if (!resumeText) {

      resumeText = STRONG_RESUME;

      candidateName = 'Alex Morgan';

    }



    const profile = new ProfileBuilder().build({ resumeText, candidateNameOverride: candidateName, levelBandOverride: parsedBody.experienceLevel });

    const intelligence = new JobRequirementIntelligence();

    const targetRole: RoleRequirement = parsedBody.jobDescription

      ? intelligence.analyze({ jobDescription: parsedBody.jobDescription }).roleRequirement

      : parsedBody.role

      ? ({ softRequirements: [], ...parsedBody.role } as RoleRequirement)

      : rolePresets[parsedBody.rolePreset ?? 'backend'];



    if (parsedBody.jobDescription && targetRole.skills.length === 0) {

      this.sendError(res, 422, 'No recognized role skills found in job description. Include Required or Preferred skill sections.');

      return;

    }

    const comparison = intelligence.compare({ profile, role: targetRole });

    const roundTypes = [...interviewTypes[parsedBody.interviewType ?? 'full']].slice(0, parsedBody.numRounds ?? (parsedBody.interviewType ? interviewTypes[parsedBody.interviewType].length : 2));

    const planned = new InterviewPlanner().plan({ profile, role: targetRole, comparison }, {

      requiredRounds: roundTypes,

      questionsPerRound: parsedBody.questionsPerRound ?? 3,

      targetDifficulty: parsedBody.targetDifficulty as Difficulty | undefined,

    });

    // The existing browser journey accepts written narrative answers only.

    const interviewPlan = parsedBody.answerMode === 'text' ? {

      ...planned,

      rounds: planned.rounds.map((round) => ({ ...round,

        questionTypes: round.questionTypes.filter((type) => ['conceptual', 'behavioral', 'situational', 'system_design'].includes(type)),

      })),

    } : planned;

    const config: SessionConfig = {

      practicePriorities: practicePriorities(await this.candidateReports(candidateId), targetRole.title, this.provider.name),

      evaluationProviderName: this.provider.name,

      detectedRole: new CareerPathDetector().detect(profile, resumeText),

      interviewPlan,

      profile,

      role: targetRole,

      numRounds: interviewPlan.rounds.length,

      roundConfig: { questionBudget: parsedBody.questionsPerRound ?? 3, maxSameSkillInRow: 2 },

    };



    const sm = new InterviewStateMachine(config, { provider: this.provider, seed: 42 });

    sm.prepare(); // CREATED â†’ READY

    const integrityToken = randomBytes(32).toString('base64url');

    this.integrityTokens.set(sm.sessionId, integrityToken);

    await this.store.save(sm);

    if (this.authenticationRequired) this.authStore.linkInterview(candidateId, sm.sessionId);



    const responsePayload = {

      sessionId: sm.sessionId,

      state: sm.state,

      currentRound: sm.currentRound,

      maxRounds: sm.maxRounds,

      publicState: sm.toPublicState(),

      providerName: this.provider.name,

      interviewPlan: planned,

      plan: interviewPlan,

      integrityToken,

      integrityPolicy: {

        ...INTERVIEW_INTEGRITY_POLICY,

        monitoredSignals: ['Interview tab hidden for the configured sustained duration', 'Window focus and fullscreen changes (context only)', 'Device and connection interruptions (technical only)', 'Consented sampled face, pose and hand observations (not automatic warnings)'],

      },

      message: 'Interview session created and primed. Call /start to begin Round 1.',

    };



    this.sendValidated(res, 201, InterviewCreateResponseSchema, responsePayload);

  }



  /**

   * POST /interviews/:id/start

   * READY â†’ IN_PROGRESS (emits first question)

   */

  private async handleInterviewStart(sessionId: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {

    const sm = await this.store.load(sessionId);

    if (!sm) {

      this.sendError(res, 404, `Interview session "${sessionId}" not found.`);

      return;

    }

    if (this.rejectTerminated(sm, res)) return;



    const options = z.object({ proctored: z.boolean().optional() }).parse(await this.readJsonBody(req, 1024));

    if ((options.proctored || this.config.faceReadinessRequired) && !this.faceReadiness.get(sessionId).ready) {

      this.sendError(res, 409, 'Complete a fresh face-readiness check before starting this proctored interview. Identity verification is not implemented.', { code: 'FACE_READINESS_REQUIRED' }); return;

    }

    if (sm.state === InterviewState.CREATED) {

      sm.prepare();

    }



    // Retry after a lost response returns the existing question without advancing.

    if (sm.state !== InterviewState.IN_PROGRESS || !sm.currentQuestion) {

      sm.start();

      sm.nextQuestion();

      this.visionSamples.delete(sessionId);

    }

    await this.store.save(sm);



    const publicState = sm.toPublicState();

    if (!publicState.currentQuestion) {

      throw new Error('Failed to generate initial question.');

    }



    const responsePayload = {

      sessionId: sm.sessionId,

      state: sm.state,

      currentQuestion: publicState.currentQuestion,

      publicState,

    };



    this.sendValidated(res, 200, InterviewStartResponseSchema, responsePayload);

  }



  /**

   * POST /interviews/:id/answer

   * IN_PROGRESS â†’ EVALUATING (runs AnswerEvaluator + AdaptiveEngine)

   */

  private async handleInterviewAnswer(

    sessionId: string,

    req: http.IncomingMessage,

    res: http.ServerResponse,

  ): Promise<void> {

    const sm = await this.store.load(sessionId);

    if (!sm) {

      this.sendError(res, 404, `Interview session "${sessionId}" not found.`);

      return;

    }

    if (this.rejectTerminated(sm, res)) return;



    const rawBody = await this.readJsonBody(req);

    const parsedBody = InterviewAnswerRequestSchema.parse(rawBody);



    const previous = parsedBody.questionId ? sm.questionHistory.find((h) => h.question.id === parsedBody.questionId) : undefined;

    if (!previous && parsedBody.questionId && sm.currentQuestion?.id !== parsedBody.questionId) {

      this.sendError(res, 409, 'This answer does not match the current question.');

      return;

    }

    if (!previous && !parsedBody.text?.trim() && !parsedBody.code?.trim() && parsedBody.selectedChoiceIndex === undefined) {

      this.sendError(res, 400, 'Enter an answer before submitting.');

      return;

    }

    const evaluation = previous?.evaluation ?? await sm.submitAnswer(parsedBody);

    await this.store.save(sm);

    if (sm.state === InterviewState.COMPLETED) this.releaseVision(sessionId);
    if (sm.state === InterviewState.COMPLETED && sm.hasCompletedPlan) await this.getOrCreateReport(sm);



    const publicState = sm.toPublicState();



    const responsePayload = {

      sessionId: sm.sessionId,

      state: sm.state,

      evaluation: {

        grade: evaluation.grade,

        feedback: answerFeedback(evaluation),

        rationale: evaluation.rationale,

        rubricCompliance: evaluation.rubricCompliance,

      },

      publicState,

    };



    this.sendValidated(res, 200, InterviewAnswerResponseSchema, responsePayload);

  }



  /**

   * POST /interviews/:id/next-question

   * Emits next question adaptively.

   */

  private async handleInterviewNextQuestion(sessionId: string, res: http.ServerResponse): Promise<void> {

    const sm = await this.store.load(sessionId);

    if (!sm) {

      this.sendError(res, 404, `Interview session "${sessionId}" not found.`);

      return;

    }

    if (this.rejectTerminated(sm, res)) return;



    if (sm.state === InterviewState.COMPLETED) {

      this.sendError(res, 409, 'Interview is already completed. Request results at /results.', {

        code: 'INTERVIEW_COMPLETED',

      });

      return;

    }



    // If previous answer finished round budget, advance round

    const budget = sm.toPublicState().progress.questionBudgetInRound;

    const answeredInRound = sm.questionHistory.filter((q) => q.round === sm.currentRound).length;



    if (answeredInRound >= budget && sm.currentRound < sm.maxRounds) {

      sm.advanceRound();

    }



    if (sm.state !== InterviewState.IN_PROGRESS || !sm.currentQuestion) sm.nextQuestion();

    await this.store.save(sm);



    const publicState = sm.toPublicState();

    if (!publicState.currentQuestion) {

      throw new Error('Failed to generate next question.');

    }



    const responsePayload = {

      sessionId: sm.sessionId,

      state: sm.state,

      currentQuestion: publicState.currentQuestion,

      publicState,

    };



    this.sendValidated(res, 200, InterviewNextQuestionResponseSchema, responsePayload);

  }



  /**

   * POST /interviews/:id/complete

   * Runs ScoringEngine, finalizes assessment report, transitions to COMPLETED.

   */

  private async handleInterviewComplete(sessionId: string, res: http.ServerResponse): Promise<void> {

    const sm = await this.store.load(sessionId);

    if (!sm) { this.sendError(res, 404, 'Interview not found.'); return; }

    if (this.rejectTerminated(sm, res)) return;

    if (sm.state !== InterviewState.COMPLETED || !sm.hasCompletedPlan) {

      this.sendError(res, 409, 'Complete all planned questions before finalizing the interview.'); return;

    }

    this.releaseVision(sessionId);

    const report = await this.getOrCreateReport(sm);

    this.sendValidated(res, 200, InterviewCompleteResponseSchema, {

      sessionId, state: sm.state, overallScore: report.overallScore,

      performanceBand: report.performanceBand, componentScores: report.componentScores, publicState: sm.toPublicState(),

    });

  }



  /**

   * GET /interviews/:id/results

   * Returns score + skill map + roadmap.

   */

  private assessmentEvidence(sm: InterviewStateMachine): Record<string, unknown>[] {

    return sm.questionHistory.flatMap((h) => h.evaluation ? [{ id: h.question.id, skillId: h.question.skillId, supportStrength: h.evaluation.grade / 10 }] : []);

  }



  private async handleInterviewResults(sessionId: string, res: http.ServerResponse): Promise<void> {

    const sm = await this.store.load(sessionId);

    if (!sm) {

      this.sendError(res, 404, `Interview session "${sessionId}" not found.`);

      return;

    }



    if (this.rejectTerminated(sm, res)) return;



    if (sm.state !== InterviewState.COMPLETED) {

      this.sendError(res, 409, 'Complete the interview before requesting the final assessment.');

      return;

    }

    if (!sm.hasCompletedPlan) {

      this.sendError(res, 409, 'This legacy session did not finish all planned questions; no final report is available.'); return;

    }

    this.sendValidated(res, 200, InterviewResultsResponseSchema, await this.getOrCreateReport(sm));

  }



  private async getOrCreateReport(sm: InterviewStateMachine) {

    const sessionId = sm.sessionId;

    const saved = this.reports.get(sessionId);

    if (saved) return saved;

    let result = this.results.get(sessionId);

    if (!result) {

      // Calculate on the fly if complete was not called yet

      const evaluations = sm.questionHistory.map((h) => h.evaluation).filter(Boolean);

      const scoreResult = ScoringEngine.calculate(evaluations as any);

      const gapAnalyzer = new GapAnalyzer();

      const roadmapPlanner = new RoadmapPlanner();

      const gaps = gapAnalyzer.analyze(sm.config.role, sm.skillStates, { records: this.assessmentEvidence(sm) });

      const roadmap = roadmapPlanner.plan(gaps, sm.config.role);

      const band = performanceBand(scoreResult.overallScore);



      result = {

        overallScore: scoreResult.overallScore * 10,

        performanceBand: band,

        componentScores: scoreResult.componentScores,

        gaps,

        roadmap,

      };

      this.results.set(sessionId, result);

    }



    const intelligence = new CandidateIntelligenceModelBuilder().build({

      profile: sm.config.profile, role: sm.config.role, states: sm.skillStates,

      evidence: sm.evidenceTracker.resolve(), gaps: result.gaps,

    });

    const skillMap: Record<string, { estimate: number; confidence: number; samples: number; verdict: string }> = {};

    for (const state of sm.skillStates) {

      skillMap[state.skillId] = {

        estimate: state.estimate,

        confidence: state.confidence,

        samples: state.samples,

        verdict: intelligence.skills[state.skillId].verdict,

      };

    }



    const responsePayload = {

      sessionId: sm.sessionId,

      state: sm.state,

      providerName: sm.config.evaluationProviderName ?? 'unknown (legacy session)',

      evidence: sm.questionHistory.flatMap((h) => h.evaluation ? [{

        questionId: h.question.id, skillId: h.question.skillId, question: h.question.prompt,

        feedback: answerFeedback(h.evaluation),

        answer: transcriptAnswer(h), score: h.evaluation.grade, rubricCompliance: h.evaluation.rubricCompliance,

      }] : []),

      candidateName: sm.config.profile.candidateName,

      roleTitle: sm.config.role.title,

      overallScore: result.overallScore,

      performanceBand: result.performanceBand,

      componentScores: {

        technical: result.componentScores.technical,

        problemSolving: result.componentScores.problemSolving,

        communication: result.componentScores.communication,

        logicalReasoning: result.componentScores.logicalReasoning,

        adaptability: result.componentScores.adaptability,

        delivery: result.componentScores.delivery,

      },

      skillMap,

      readiness: roleReadiness(sm.config.role, skillMap),

      comparisonKey: JSON.stringify({ provider: sm.config.evaluationProviderName ?? 'unknown (legacy session)', role: sm.config.role, rounds: sm.config.interviewPlan?.rounds.map((r) => ({ type: r.type, skills: r.targetSkills, difficulty: r.difficultyRange, budget: r.questionBudget })) }),

      gaps: result.gaps.map((g) => ({

        skillId: g.skillId,

        severity: g.severity,

        confidence: g.confidence,

        reason: g.reason ?? 'Knowledge gap identified against target role requirement.',

      })),

      roadmap: result.roadmap.map((r, i) => ({

        stepNumber: i + 1,

        skillId: r.skillId,

        action: r.action,

        priority: r.priority,

        effort: r.effort,

      })),

    };



    const report = InterviewResultsResponseSchema.parse({ ...responsePayload, details: buildDetailedReport(sm, result.gaps, result.roadmap, result.overallScore) });

    this.reports.save(report);

    return report;

  }



  private releaseVision(sessionId: string): void {
    if (this.visionPending.has(sessionId)) this.visionRevoked.add(sessionId);
    this.faceReadiness.clear(sessionId); this.visionSamples.delete(sessionId);
    this.vision.releaseSession(sessionId);
    const diagnostic=this.visionDiagnostics.get(sessionId);
    if (diagnostic) {diagnostic.service='stopped';diagnostic.lastDecision='Monitoring stopped for this session; Python state released.';}
  }

  private validIntegrityToken(sessionId: string, req: http.IncomingMessage): boolean {

    const expected = Buffer.from(this.integrityTokens.get(sessionId) ?? '');

    const supplied = Buffer.from(req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '');

    return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);

  }



  /** Sampled, consented frames go to the local Python process and are discarded. */

  private async handleVisionFrame(sessionId: string, req: http.IncomingMessage, res: http.ServerResponse, preflight = false): Promise<void> {

    let sm = await this.store.load(sessionId);

    if (!sm) { this.sendError(res, 404, 'Interview not found.'); return; }

    if (this.rejectTerminated(sm, res)) return;
    if (sm.state === InterviewState.COMPLETED) { this.releaseVision(sessionId); this.sendError(res,409,'Interview completed. Visual monitoring has stopped.',{code:'INTERVIEW_COMPLETED',publicState:sm.toPublicState()}); return; }
    if (!this.validIntegrityToken(sessionId, req)) { this.sendError(res, 401, 'Vision monitoring is not authorized for this session.'); return; }



    if (![InterviewState.IN_PROGRESS, InterviewState.EVALUATING, ...(preflight ? [InterviewState.READY] : [])].includes(sm.state)) { this.sendError(res, 409, 'Face analysis requires a ready or active interview.'); return; }

    const input = z.object({ consent: z.literal(true), image: z.string().min(10).max(240_000).regex(/^[A-Za-z0-9+/]+=*$/), capturedAt: z.string().datetime() }).parse(await this.readJsonBody(req, 250_000));

    const now = Date.now();

    if (Math.abs(now - Date.parse(input.capturedAt)) > 10_000) { this.sendError(res, 422, 'Stale camera sample.'); return; }

    const diagnostic = this.visionDiagnostics.get(sessionId) ?? { framesReceived: 0, framesAnalyzed: 0, failures: 0, service: 'not_started', lastFrameAt: null, lastObservationAt: null, lastDecision: '' };

    diagnostic.framesReceived++; diagnostic.lastFrameAt = new Date(now).toISOString();

    if (this.visionDiagnostics.size > 1000) this.visionDiagnostics.delete(this.visionDiagnostics.keys().next().value!);

    this.visionDiagnostics.set(sessionId, diagnostic);

    if (this.visionPending.has(sessionId)) { this.sendError(res, 429, 'A camera sample is already being analyzed. Retry the next sample.'); return; }

    const previous = this.visionSamples.get(sessionId);

    if (previous && now - previous.at < 1_500) { this.sendError(res, 429, 'Camera samples are limited to one every two seconds.'); return; }

    const sample = previous && now - previous.at < 6_000 ? previous : { at: 0, absentSince: null, multipleSince: null, headSince: null, gazeSince: null, positionSince: null };

    sample.at = now;

    if (this.visionSamples.size > 1000) this.visionSamples.delete(this.visionSamples.keys().next().value!);

    this.visionSamples.set(sessionId, sample);

    this.visionPending.add(sessionId);
    let disconnected = false;
    const connectionClosed = () => { if (!res.writableEnded) { disconnected = true; this.visionRevoked.add(sessionId); this.vision.releaseSession(sessionId); } };
    res.once('close',connectionClosed);

    try {

      sm = await this.store.load(sessionId);
      if (!sm || disconnected) return;
      if (this.rejectTerminated(sm,res)) return;
      if (![InterviewState.IN_PROGRESS, InterviewState.EVALUATING, ...(preflight ? [InterviewState.READY] : [])].includes(sm.state)) {
        this.releaseVision(sessionId); this.sendError(res,409,'Interview is no longer active.',{code:'INTERVIEW_NOT_ACTIVE',publicState:sm.toPublicState()}); return;
      }
      diagnostic.service = 'analyzing';

      const observation = await this.vision.analyze(sessionId, input.image);

      diagnostic.framesAnalyzed++; diagnostic.lastObservationAt = new Date().toISOString(); diagnostic.service = 'connected';

      diagnostic.lastDecision = `Frame analyzed: ${observation.faceCount} face(s), ${observation.handCount} hand(s). Visual observations are contextual and do not add automatic warnings.`;

      // Inference runs outside the session lock, so urgent warnings/answers are not blocked.

      // Commit only against fresh application state after inference finishes.

      await this.withSessionLock(sessionId, async () => {

        sm = await this.store.load(sessionId);

        if (!sm) { this.sendError(res, 404, 'Interview not found.'); return; }

        if (this.rejectTerminated(sm, res)) return;

        if (![InterviewState.IN_PROGRESS, InterviewState.EVALUATING, ...(preflight ? [InterviewState.READY] : [])].includes(sm.state)) { this.releaseVision(sessionId); this.sendError(res, 409, 'Interview is no longer active. Camera observation discarded.',{code:'INTERVIEW_NOT_ACTIVE',publicState:sm.toPublicState()}); return; }

        if (this.visionRevoked.has(sessionId)) { this.sendError(res, 409, 'Face check was cancelled. The late observation was discarded.'); return; }

        const faceReadiness = this.faceReadiness.record(sessionId, observation);

        if (preflight) { this.sendJson(res, 200, { observedAt:new Date(Math.min(Date.parse(input.capturedAt),now)).toISOString(), observation, notices: [], publicState: sm.toPublicState(), faceReadiness }); return; }

        const notices: string[] = [];
        const failure = [...sm.integrityEvents].reverse().find(event => ['vision_pipeline_error','vision_pipeline_recovered'].includes(event.eventType));
        if (failure?.eventType === 'vision_pipeline_error') {
          sm.recordIntegrityWarning(technicalVisionEvent(sessionId, randomUUID(), now, true, Math.max(0, now-failure.occurredAt)));
        }
        const lastCameraEvent = [...sm.integrityEvents].reverse().find(event => ['camera_interrupted','camera_recovered'].includes(event.eventType));
        if (lastCameraEvent?.eventType === 'camera_interrupted') {
          sm.recordIntegrityWarning({sessionId,eventId:randomUUID(),eventType:'camera_recovered',occurredAt:Date.now(),durationMs:Math.max(0,Date.now()-lastCameraEvent.occurredAt),confidence:null,severity:'technical',details:{source:'backend',signal:'camera',trackingState:'frames_resumed',phase:'recovered'}});
        }
        for (const event of observation.events ?? []) {
          if (!eligibleVisionEvent(event, sessionId, Date.now())) continue;
          if (!this.config.visualDirectionReviewEnabled && ['head_orientation_changed','gaze_tracking_changed'].includes(event.eventType)) continue;
          const last = [...sm.integrityEvents].reverse().find(previous => previous.eventType === event.eventType && previous.details?.signal === event.details.signal);
          if (last && last.details?.trackingState === event.details.trackingState && last.details?.phase === event.details.phase && event.occurredAt-last.occurredAt < INTERVIEW_INTEGRITY_POLICY.duplicateSuppressionMs) continue;
          sm.recordIntegrityWarning(event);
        }

        const eligibleAt = (sm.timing.sessionStartedAt ?? now) + INTERVIEW_INTEGRITY_POLICY.monitoringGracePeriodMs;

        for (const [condition, key, eventType, notice] of [

          [observation.faceCount === 0, 'absentSince', 'face_absent', 'A face has not been visible for a sustained period. Check lighting and camera framing. This is a notice, not a cheating finding.'],

          [observation.faceCount > 1, 'multipleSince', 'multiple_faces', 'More than one face has been visible for a sustained period. Please check your surroundings. This observation adds no automatic warning.'],

          [this.config.visualDirectionReviewEnabled && observation.directionEstimate?.headReliable === true && observation.headOrientation === 'turned', 'headSince', 'head_turned', 'Sustained head turn observed. This is not proof of outside assistance and adds no automatic warning.'],

          [this.config.visualDirectionReviewEnabled && observation.directionEstimate?.gazeReliable === true && observation.gazeReliable && observation.gazeDirection === 'possibly_sideways', 'gazeSince', 'gaze_away', 'Sustained approximate eye-direction change observed. This is not calibrated gaze tracking and adds no automatic warning.'],

          [observation.movementObservation?.body.reliable !== false && observation.positionShift !== null && observation.positionShift >= this.config.visionPositionThreshold, 'positionSince', 'position_changed', 'A sustained change from the initial upper-body position was observed. This adds no automatic warning.'],

        ] as const) {

          sample[key] = condition ? Math.max(sample[key] ?? now, eligibleAt) : null;

          if (sample[key] !== null && now - sample[key]! >= this.config.visionNoticeMs) {

            notices.push(notice);

            sm.recordIntegrityWarning({ sessionId, eventId: `vision-${eventType}-${sample[key]}`, eventType, occurredAt: now, durationMs: now - sample[key]!, confidence: null, severity: 'info', details: {source:'vision',signal:eventType,trackingState:'sustained',phase:'observed'} });

          }

        }

        await this.store.save(sm);

        this.sendJson(res, 200, { observedAt:new Date(Math.min(Date.parse(input.capturedAt),now)).toISOString(), observation, notices, publicState: sm.toPublicState(), faceReadiness });

      });

    } catch (error) {
      if (disconnected) { this.visionSamples.delete(sessionId);diagnostic.service='unavailable';diagnostic.lastDecision='Camera request disconnected; pending processing cancelled without a warning.'; return; }
      const latest = await this.store.load(sessionId);
      if (latest && this.rejectTerminated(latest,res)) return;
      if (latest?.state === InterviewState.COMPLETED) { this.releaseVision(sessionId); this.sendError(res,409,'Interview completed.',{code:'INTERVIEW_COMPLETED',publicState:latest.toPublicState()}); return; }

      // A failed sample resets continuity; model/device failures never create warnings.

      this.visionSamples.delete(sessionId); this.faceReadiness.unavailable(sessionId);

      diagnostic.failures++; diagnostic.service = 'unavailable'; diagnostic.lastDecision = `${error instanceof VisionError ? error.code : 'VISION_PROCESSING_FAILED'}: continuity reset; no warning added.`;

      await this.withSessionLock(sessionId, async () => {
        const current = await this.store.load(sessionId);
        if (!current || ![InterviewState.IN_PROGRESS, InterviewState.EVALUATING].includes(current.state) || this.visionRevoked.has(sessionId)) return;
        const lastFailure = [...current.integrityEvents].reverse().find(event => ['vision_pipeline_error','vision_pipeline_recovered'].includes(event.eventType));
        if (lastFailure?.eventType !== 'vision_pipeline_error') {
          const at = Date.now(), eventId = randomUUID();
          current.recordIntegrityWarning(technicalVisionEvent(sessionId,eventId,at,false));
          await this.store.save(current);
        }
      });
      this.sendError(res, 503, `Visual analysis unavailable (${error instanceof VisionError ? error.code : 'VISION_PROCESSING_FAILED'}). No warning was added.`, { code: error instanceof VisionError ? error.code : 'VISION_PROCESSING_FAILED' });

    } finally { res.off('close',connectionClosed); this.visionPending.delete(sessionId); this.visionRevoked.delete(sessionId); }

  }



  /** Validates one sustained browser incident and applies policy atomically. */

  private async handleIntegrityEvent(sessionId: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {

    const expectedToken = this.integrityTokens.get(sessionId);

    const suppliedToken = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? '';

    const expectedBytes = Buffer.from(expectedToken ?? '');

    const suppliedBytes = Buffer.from(suppliedToken);

    if (!expectedToken || expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {

      this.sendError(res, 401, 'This integrity event is not authorized for the interview session.', { code: 'INTEGRITY_UNAUTHORIZED' });

      return;

    }



    const sm = await this.store.load(sessionId);

    if (!sm) {

      this.sendError(res, 404, `Interview session "${sessionId}" not found.`);

      return;

    }

    if (this.rejectTerminated(sm, res)) return;

    if (![InterviewState.IN_PROGRESS, InterviewState.EVALUATING].includes(sm.state)) {

      this.sendError(res, 409, 'Integrity monitoring is active only during an interview.', { code: 'INTEGRITY_SESSION_NOT_ACTIVE' });

      return;

    }



    const now = Date.now();

    const recentRequests = (this.integrityRequestTimes.get(sessionId) ?? []).filter((at) => now - at < 60_000);

    if (recentRequests.length >= 20) {

      this.integrityRequestTimes.set(sessionId, recentRequests);

      this.sendError(res, 429, 'Too many integrity events were received. Please continue the interview; no warning was added.', { code: 'INTEGRITY_RATE_LIMIT' });

      return;

    }

    recentRequests.push(now);

    this.integrityRequestTimes.set(sessionId, recentRequests);



    const parsed = IntegrityEventRequestSchema.parse(await this.readJsonBody(req, 16_384));

    const event = {

      ...parsed,

      occurredAt: Date.parse(parsed.occurredAt),

    };

    const eligibility = validateIntegrityEvent(event, { sessionStartedAt: sm.timing.sessionStartedAt, now });

    if (!eligibility.eligible) {

      this.sendError(res, 422, eligibility.reason, { code: 'INTEGRITY_EVENT_NOT_ELIGIBLE' });

      return;

    }



    const outcome = sm.recordIntegrityWarning({ ...event, sessionId, confidence: null, severity: event.eventType === 'camera_interrupted' || event.eventType === 'microphone_interrupted' || event.eventType === 'connection_interrupted' ? 'technical' : 'info', details: {source:'browser',signal:event.eventType,trackingState:event.eventType==='tab_visible'?'visible':event.eventType==='tab_hidden'?'hidden':'interrupted',phase:event.eventType==='tab_visible'?'recovered':'observed'} });

    await this.store.save(sm);

    if (outcome.terminated) { this.integrityTokens.delete(sessionId); this.releaseVision(sessionId); }

    const message = event.eventType !== 'tab_hidden'

      ? 'Technical or contextual observation recorded. No integrity warning was added.'

      : outcome.duplicate

      ? `This event was already recorded. Warning count remains ${outcome.warningCount} of ${INTERVIEW_INTEGRITY_POLICY.maximumWarnings}.`

      : outcome.suppressed

        ? `This event was part of the same recent incident. Warning count remains ${outcome.warningCount} of ${INTERVIEW_INTEGRITY_POLICY.maximumWarnings}.`

      : outcome.terminated

          ? 'Third confirmed incident â€” interview terminated after two warnings. This records repeated sustained periods with the interview tab hidden; it is not a determination of intent.'

          : outcome.warningCount === 2

            ? 'Warning 2 of 2 â€” Final warning. Another confirmed sustained period with the interview tab hidden will end this interview.'

            : `Warning 1 of ${INTERVIEW_INTEGRITY_POLICY.maximumWarnings} â€” Interview integrity notice. The interview tab was hidden for a sustained period. Return to the interview tab to continue.`;



    this.sendValidated(res, 200, IntegrityEventResponseSchema, {

      warningCount: outcome.warningCount,

      maximumWarnings: INTERVIEW_INTEGRITY_POLICY.maximumWarnings,

      duplicate: outcome.duplicate,

      suppressed: outcome.suppressed,

      terminated: outcome.terminated,

      message,

      publicState: sm.toPublicState(),

    });

  }



  // ---------------------------------------------------------------------------

  // Helpers

  // ---------------------------------------------------------------------------



  private rejectTerminated(sm: InterviewStateMachine, res: http.ServerResponse): boolean {

    if (sm.state !== InterviewState.TERMINATED_FOR_INTEGRITY) return false;
    this.releaseVision(sm.sessionId);

    this.sendError(res, 410, 'This interview was terminated after reaching the configured integrity-warning limit.', {

      code: 'INTERVIEW_TERMINATED_FOR_INTEGRITY',
      publicState: sm.toPublicState(),

      details: sm.toPublicState().integrity,

    });

    return true;

  }



  /** Serializes all mutations for one session, including concurrent warning submissions. */

  private async withSessionLock<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {

    const previous = this.sessionLocks.get(sessionId) ?? Promise.resolve();

    let release!: () => void;

    const gate = new Promise<void>((resolve) => { release = resolve; });

    const tail = previous.then(() => gate);

    this.sessionLocks.set(sessionId, tail);

    await previous;

    try {

      return await operation();

    } finally {

      release();

      if (this.sessionLocks.get(sessionId) === tail) this.sessionLocks.delete(sessionId);

    }

  }



  private sendValidated<T>(

    res: http.ServerResponse,

    statusCode: number,

    schema: z.ZodType<T>,

    data: unknown,

  ): void {

    // Mandate: Every response is validated against schema before it leaves API

    const validated = schema.parse(data);

    res.statusCode = statusCode;

    res.setHeader('Content-Type', 'application/json');

    res.end(JSON.stringify(validated));

  }



  private sendError(

    res: http.ServerResponse,

    statusCode: number,

    message: string,

    extra?: Record<string, any>,

  ): void {

    const errorPayload = {

      error: message,

      ...extra,

    };

    const validated = ErrorResponseSchema.parse(errorPayload);

    res.statusCode = statusCode;

    res.setHeader('Content-Type', 'application/json');

    res.end(JSON.stringify(validated));

  }



  private async candidateReports(candidateId: string) {

    const reports = [];

    for (const id of await this.store.list()) {

      if (this.authenticationRequired && !this.authStore.ownsInterview(candidateId, id)) continue;

      const sm = await this.store.load(id);

      if (sm?.state === InterviewState.COMPLETED && sm.hasCompletedPlan) reports.push(await this.getOrCreateReport(sm));

    }

    return reports;

  }



  private async handleInterviewsList(res: http.ServerResponse, candidateId: string): Promise<void> {

    const list = [];

    for (const id of await this.store.list()) {

      if (this.authenticationRequired && !this.authStore.ownsInterview(candidateId, id)) continue;

      const sm = await this.store.load(id);

      if (!sm || sm.state !== InterviewState.COMPLETED || !sm.hasCompletedPlan) continue;

      const report = await this.getOrCreateReport(sm);

      list.push({ sessionId: id, candidateName: report.candidateName, roleTitle: report.roleTitle,

        date: report.details.completedAt, overallScore: report.overallScore, performanceBand: report.performanceBand,

        componentScores: report.componentScores, gapsCount: report.gaps.length, roadmapCount: report.roadmap.length });

    }

    this.sendJson(res, 200, { interviews: list });

  }



  private async extractTextFromFile(fileBase64: string, fileName?: string): Promise<string> {

    const buffer = Buffer.from(fileBase64, 'base64');

    if (/\.(txt|md)$/i.test(fileName ?? '')) {

      if (buffer.length > 5 * 1024 * 1024) throw new ResumeFileError('Resume files must be smaller than 5 MB.');

      return buffer.toString('utf-8').trim();

    }

    return extractResumeFile(fileName ?? '', buffer);

  }



  private readJsonBody(req: http.IncomingMessage, limit = 2 * 1024 * 1024): Promise<unknown> {

    return new Promise((resolve, reject) => {

      const contentType = req.headers['content-type'];

      if (contentType && contentType.split(';')[0].trim().toLowerCase() !== 'application/json') {

        req.resume(); reject(new HttpInputError(415, 'Use application/json for request bodies.')); return;

      }

      const chunks: Buffer[] = []; let size = 0; let failed = false;

      req.on('data', (chunk: Buffer) => {

        size += chunk.length;

        if (size > limit) { if (!failed) reject(new HttpInputError(413, 'Request body exceeds the allowed size.')); failed = true; chunks.length = 0; return; }

        if (!failed) chunks.push(chunk);

      });

      req.on('end', () => {

        if (failed) return;

        const body = Buffer.concat(chunks).toString('utf8');

        if (!body.trim()) { resolve({}); return; }

        try { resolve(JSON.parse(body)); } catch { reject(new HttpInputError(400, 'Invalid JSON payload.')); }

      });

      req.on('aborted', () => reject(new HttpInputError(400, 'Request was interrupted.')));

      req.on('error', reject);

    });

  }



}



/**

 * Factory to create an ApiServer instance.

 */

class HttpInputError extends Error { constructor(readonly status: number, message: string) { super(message); } }



export function createApiServer(options?: ApiServerOptions): ApiServer {

  return new ApiServer(options);

}



// Auto-start if executed directly via tsx/node

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/api/server.ts')) {

  const server = createApiServer();

  server.listen().then(({ port: boundPort }) => {

    console.log(`\n========================================================`);

    console.log(`  AI Mock Interview API Server running on port ${boundPort}`);

    console.log(`  Ready for requests at http://localhost:${boundPort}`);

    console.log(`========================================================\n`);

    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { server.httpServer.close(() => process.exit(0)); });

  }).catch((error: Error) => { console.error(`API startup failed: ${error.message}`); process.exitCode = 1; });

}



