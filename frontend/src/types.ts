export type QuestionType =

  | 'conceptual'

  | 'system_design'

  | 'behavioral'

  | 'situational'

  | 'code'

  | 'numerical'

  | 'mcq';



export type InterviewState =

  | 'CREATED'

  | 'READY'

  | 'IN_PROGRESS'

  | 'EVALUATING'

  | 'COMPLETED'

  | 'TERMINATED_FOR_INTEGRITY';



export type CandidateLevelBand = 'junior' | 'mid' | 'senior' | 'principal';



export interface CandidateAccount {

  id: string;

  name: string;

  email: string;

  createdAt: string;

}



export interface CandidateResumeSummary {

  resumeId: string;

  candidateName: string;

  skillIds: string[];

  updatedAt: string;

}



export interface CandidateProfileResponse {

  candidate: CandidateAccount | null;

  resumes: CandidateResumeSummary[];

}



export interface CandidateAuthResponse {

  candidate: CandidateAccount;

  resumes: CandidateResumeSummary[];

}



export interface PublicQuestion {

  id: string;

  prompt: string;

  type: QuestionType;

  skillId: string;

  difficulty: number;

  timeLimitSec: number;

}



export interface QuestionHistoryItem {

  questionId: string;

  skillId: string;

  questionType: QuestionType;

  score?: number;

  feedbackSummary?: string;

}



export interface SkillEstimate {

  skillId: string;

  estimate: number;

  confidence: number;

}



export interface PublicInterviewState {

  sessionId: string;

  state: InterviewState;

  currentRound: number;

  maxRounds: number;

  currentQuestion: PublicQuestion | null;

  currentDifficulty: number;

  currentTopic: string;

  timing: {

    sessionStartedAt: number | null;

    roundStartedAt: number | null;

    questionStartedAt: number | null;

    elapsedSec: number;

    timeLimitSec: number;

  };

  progress: {

    questionsAnsweredInRound: number;

    questionBudgetInRound: number;

    totalQuestionsAnswered: number;

  };

  questionHistory: QuestionHistoryItem[];

  skillEstimates: SkillEstimate[];

  integrity: {

    warningCount: number;

    maximumWarnings: number;

    terminatedAt: string | null;

    terminationReason: string | null;

  };

}



export interface IntegrityPolicy {

  maximumWarnings: number;

  monitoringGracePeriodMs: number;

  minimumTabHiddenDurationMs: number;
  minimumTabVisibleDurationMs: number;
  minimumReportedConfidence: number;

  duplicateSuppressionMs: number;

  fullscreenRequired: boolean;

  cameraRequired: boolean;

  monitoredSignals: string[];

}



export interface ResumeProfile {

  skills: Array<{ skillId: string; claim: string }>;

  experience: any[];

  education: any[];

  projects: string[];

  certifications: string[];

  candidate_level_hypothesis: {

    band: CandidateLevelBand;

    basis: string;

    status: 'hypothesis';

    evidenceOverride?: boolean;

  };

}



export interface ResumeUploadResponse {

  extractedText?: string;

  resumeId: string;

  candidateName: string;

  resumeText?: string;

  profile: ResumeProfile;

  audit: {

    passes: boolean;

    findings: Array<{

      severity: 'ok' | 'warning';

      scope: string;

      finding: string;

    }>;

  };

  careerPath?: {

    recommendedRoleId: 'backend' | 'frontend' | 'data' | 'fullstack';

    title: string;

    confidence: 'high' | 'medium' | 'low';

    rationale: string;

    evidence: string[];

    relatedRoles: Array<{ roleId: 'backend' | 'frontend' | 'data' | 'fullstack'; title: string }>;

    needsClarification: boolean;

    clarificationPrompt?: string;

  };

  insights?: {

    internships: Array<{ role: string; company: string; period: string; bullets: string[] }>;

    technologies: string[];

    domainKnowledge: string[];

    communicationEvidence: Array<{ text: string; source: { line: number; excerpt: string } }>;

    leadershipEvidence: Array<{ text: string; source: { line: number; excerpt: string } }>;

    validationAreas: Array<{ topic: string; rationale: string; source: { line: number; excerpt: string } }>;

  };

}



export interface InterviewCreateResponse {

  plan?: InterviewPlanSummary;

  providerName: string;

  sessionId: string;

  state: InterviewState;

  currentRound: number;

  maxRounds: number;

  publicState: PublicInterviewState;

  message: string;

  interviewPlan?: {

    roleTitle: string;

    rounds: Array<{

      roundNumber: number;

      roundType: string;

      focus: string;

      targetSkills: string[];

      questionBudget: number;

      difficultyRange: { min: number; max: number };

      questionTypes: string[];

    }>;

  };

  integrityToken: string;

  integrityPolicy: IntegrityPolicy;

}



export interface IntegrityEventResponse {

  warningCount: number;

  maximumWarnings: number;

  duplicate: boolean;

  suppressed: boolean;

  terminated: boolean;

  message: string;

  publicState: PublicInterviewState;

}



export interface MovementPattern {
  sustainedMovementMs: number; movementEpisodes: number; repeatedMovement: boolean; sustainedMovement: boolean;
}
export interface MovementObservation {
  handTracks: (MovementPattern & {trackId:number;handedness:'left'|'right'|'unknown';handednessScore:number|null;
    state:'visible'|'partial';transition:'entered'|'continued'|'recovered';reliable:boolean;landmarkConfidence:null;
    position:number[];landmarks:number[][];movement:number|null;relativeToFace:number[]|null;gesture:string})[];
  lostHands: {trackId:number;handedness:string;state:'tracking_lost'|'not_visible';missingForMs:number}[];
  rejectedHands:number;body: MovementPattern & {state:string;reliable:boolean;center:number[]|null;
    landmarks:{index:number;position:number[];visibility:number}[];movement:number|null;positionShift:number|null;
    shoulderTiltDegrees:number|null;outsideUsefulArea:boolean;visibility:number|null;unreliableForMs:number};
  visiblePoseCount:number;additionalPersonObserved:boolean;coordinateSystem:'unmirrored-camera';
  method:'sampled-landmark-movement';interpretation:'neutral-observation';
}
export interface VisionEvent {
  sessionId:string;eventId:string;eventType:string;occurredAt:number;durationMs:number;confidence:number|null;severity:'info'|'technical';
  details:{source:'vision';signal:string;trackingState:string;phase:'observed'|'recovered'|'technical'};
}
export interface VisionObservation {
  moduleStatus?: { face: 'ready'; pose: 'ready' | 'disabled' | 'unavailable'; hands: 'ready' | 'disabled' | 'unavailable' };
  events?: VisionEvent[];
  movementObservation?: MovementObservation;

  directionEstimate?: {

    headDirections: string[]; gazeDirections: string[]; headReliable: boolean; gazeReliable: boolean;

    framing: string; smoothedPoseDegrees: {yaw: number; pitch: number; roll: number} | null;

    headChangeDegrees: number | null; unreliableForMs: number; gazeUnreliableForMs: number; reliabilityReason: string; validSamples: number;

    method: 'landmark-geometric-estimate'; coordinateSystem: 'unmirrored-camera'; calibrated: false;

  };

  faceState?: 'FACE_PRESENT' | 'FACE_NOT_DETECTED' | 'TRACKING_LOST' | 'MULTIPLE_FACES' | 'QUALITY_LOW';

  faceQuality?: { checks: { singleFace: boolean; largeEnough: boolean; wellLit: boolean; sharpEnough: boolean; forwardFacing: boolean }; score: number; method: 'image-and-geometry-checks'; detectorConfidence: null };

  faceTracks?: { trackId: number; center: number[]; bounds: number[]; landmarks?: number[][] }[];

  headPoseDegrees?: { yaw: number; pitch: number; roll: number } | null;

  gazeReliable?: boolean;

  handObservations?: { position: number[]; gesture: string; movement: number | null }[];

  positionShift?: number | null; faceTrackingReliable?: boolean;

  faceCount: number; headOrientation: string; gazeDirection: string;

  upperBodyVisible: boolean; upperBodyMovement: number | null;

  handCount: number; handPositions: number[][]; handMovement: number | null;

}



export interface FaceReadinessStatus {

  state: 'NOT_CHECKED' | 'FACE_PRESENT' | 'FACE_NOT_DETECTED' | 'TRACKING_LOST' | 'MULTIPLE_FACES' | 'QUALITY_LOW' | 'UNAVAILABLE';

  ready: boolean; identityVerified: false; identityVerification: 'not_implemented';

  checkedAt: string | null; expiresAt: string | null; goodSamples: number; message: string;

}

export interface VisionFrameResponse { observedAt?:string; faceReadiness?: FaceReadinessStatus; observation: VisionObservation; notices: string[]; publicState: PublicInterviewState }



export interface InterviewHistorySummary {

  sessionId: string;

  date: string;

  candidateName: string;

  roleTitle: string;

  overallScore: number;

  performanceBand: string;

  componentScores: ComponentScores;

  gapsCount: number;

  roadmapCount: number;

}



export interface InterviewStartResponse {

  sessionId: string;

  state: InterviewState;

  currentQuestion: PublicQuestion;

  publicState: PublicInterviewState;

}



export interface AnswerFeedback {

  criteria: Array<{ key: string; label: string; score: number }>;

  strengths: string[]; improvements: string[];

}



export interface EvaluationDetail {

  feedback?: AnswerFeedback;

  grade: number;

  rationale: string;

  rubricCompliance: number;

}



export interface InterviewAnswerResponse {

  sessionId: string;

  state: InterviewState;

  evaluation: EvaluationDetail;

  publicState: PublicInterviewState;

}



export interface InterviewNextQuestionResponse {

  sessionId: string;

  state: InterviewState;

  currentQuestion: PublicQuestion;

  publicState: PublicInterviewState;

}



export interface ComponentScores {

  technical: number;

  problemSolving: number;

  communication: number;

  logicalReasoning: number;

  adaptability: number;

  delivery: number;

}



export interface InterviewCompleteResponse {

  sessionId: string;

  state: 'COMPLETED';

  overallScore: number;

  performanceBand: string;

  componentScores: ComponentScores;

  publicState: PublicInterviewState;

}



export interface SkillMapEntry {

  verdict: 'meets' | 'partially_meets' | 'gap' | 'unverified';

  estimate: number;

  confidence: number;

  samples: number;

}



export interface SkillGap {

  skillId: string;

  severity: number;

  confidence: number;

  reason: string;

}



export interface RoadmapStep {

  stepNumber: number;

  skillId: string;

  action: string;

  priority: number;

  effort: 'short' | 'medium' | 'long';

}



export interface InterviewResultsResponse {

  details: DetailedInterviewReport;

  readiness?: { score: number | null; coverage: number; assessedSkills: number; totalSkills: number; methodology: string };

  comparisonKey?: string;

  providerName: string;

  evidence: Array<{ feedback?: AnswerFeedback; questionId: string; skillId: string; question: string; answer: string; score: number; rubricCompliance: number }>;

  sessionId: string;

  state: InterviewState;

  candidateName: string;

  roleTitle: string;

  overallScore: number;

  performanceBand: string;

  componentScores: ComponentScores;

  skillMap: Record<string, SkillMapEntry>;

  gaps: SkillGap[];

  roadmap: RoadmapStep[];

}



export interface AnswerCoaching {

  questionId: string;

  demonstrated: Array<{ concept: string; excerpt: string }>;

  missing: string[]; clarity: Array<{ issue: string; excerpt: string; suggestion: string }>;

  revisionConcepts: string[];

  example: { label: string; kind: 'reference' | 'scaffold'; wording: string };

  beforeAfter: { before: string; after: string; label: string };

}

export interface LearningPlan {

  skillId: string; priority: number; currentProficiency: number | null; targetOutcome: string; reason: string;

  sequence: string[]; exercises: string[]; projectTask: string; checkpoints: string[]; successCriteria: string[]; evidenceQuestionIds: string[];

}

export interface DetailedInterviewReport {

  version: number; generatedAt: string; completionStatus: 'COMPLETED'; startedAt: string | null; completedAt: string;

  durationSec: number | null; durationBasis: string; detectedRole: string; roleDetectionBasis: string; summary: string;

  strengths: Array<{ text: string; questionIds: string[] }>; weaknesses: Array<{ text: string; questionIds: string[] }>;

  nextSteps: string[]; difficultyProgression: Array<{ questionId: string; round: number; difficulty: number; skillId: string }>;

  scoringWeights: Record<string, number>; methodology: string; categoryEvidence: Record<string, string[]>;

  answerCoaching: AnswerCoaching[]; learningPlan: LearningPlan[];

}



export interface InterviewPlanSummary {

  roleTitle: string; candidateName: string; totalQuestionBudget: number;

  rounds: Array<{ roundNumber: number; name: string; description: string; targetSkills: string[]; questionBudget: number; difficultyRange: { min: number; max: number } }>;

}

export interface SetupOptions {

  providerName: string;

  roles: Array<{ id: string; title: string }>;

  interviewTypes: Array<{ id: string; label: string; rounds: number }>;

}

export interface InterviewPreferences {

  rolePreset?: 'backend' | 'frontend' | 'data' | 'fullstack';

  experienceLevel?: 'junior' | 'mid' | 'senior';

  interviewType?: 'full' | 'technical' | 'behavioral';

  targetDifficulty?: number;

  questionsPerRound?: number;

}

export interface SessionSummary {

  sessionId: string; candidateName: string; roleTitle: string; state: InterviewState;

  answered: number; totalQuestions: number; overallScore: number | null;

}

export interface CandidateProgress {

  reports: InterviewResultsResponse[];

  latestResumeId: string | null;

  currentSkills: Array<{ skillId: string; estimate: number; confidence: number; verdict: string; sessionId: string; date: string; roleTitle: string; providerName: string }>;

  repeatedWeaknesses: Array<{ skillId: string; count: number; sessionIds: string[]; stillCurrent: boolean }>;

  recommendations: InterviewResultsResponse['details']['learningPlan'];

  methodology: string;

}

