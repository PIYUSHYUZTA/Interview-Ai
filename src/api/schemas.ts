import { z } from 'zod';
import { DetailedReportSchema } from './DetailedReport.js';

/**
 * Zod schemas for all API endpoint requests and responses.
 * Enforces the rule: Every response is validated against a schema before leaving the API.
 */

// ---------------------------------------------------------------------------
// Shared Component Schemas
// ---------------------------------------------------------------------------

export const QuestionTypeEnum = z.enum([
  'conceptual',
  'system_design',
  'behavioral',
  'situational',
  'code',
  'numerical',
  'mcq',
]);

export const InterviewStateEnum = z.enum([
  'CREATED',
  'READY',
  'IN_PROGRESS',
  'EVALUATING',
  'COMPLETED',
  'TERMINATED_FOR_INTEGRITY',
]);

export const CandidateLevelBandEnum = z.enum([
  'junior',
  'mid',
  'senior',
  'principal',
]);

export const PublicQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  type: QuestionTypeEnum,
  skillId: z.string(),
  difficulty: z.number().min(1).max(10),
  timeLimitSec: z.number().positive(),
});

export const PublicInterviewStateSchema = z.object({
  sessionId: z.string(),
  state: InterviewStateEnum,
  currentRound: z.number().int().min(1).max(4),
  maxRounds: z.number().int().min(1).max(4),
  currentQuestion: PublicQuestionSchema.nullable(),
  currentDifficulty: z.number().min(1).max(10),
  currentTopic: z.string(),
  timing: z.object({
    sessionStartedAt: z.number().nullable(),
    roundStartedAt: z.number().nullable(),
    questionStartedAt: z.number().nullable(),
    elapsedSec: z.number().min(0),
    timeLimitSec: z.number().positive(),
  }),
  progress: z.object({
    questionsAnsweredInRound: z.number().int().min(0),
    questionBudgetInRound: z.number().int().min(1),
    totalQuestionsAnswered: z.number().int().min(0),
  }),
  questionHistory: z.array(
    z.object({
      questionId: z.string(),
      skillId: z.string(),
      questionType: QuestionTypeEnum,
      score: z.number().optional(),
      feedbackSummary: z.string().optional(),
    }),
  ),
  skillEstimates: z.array(
    z.object({
      skillId: z.string(),
      estimate: z.number(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  integrity: z.object({
    warningCount: z.number().int().min(0).max(3),
    visionWarningCount: z.number().int().nonnegative().optional(),
    maximumWarnings: z.number().int().min(1).max(3),
    terminationViolationCount: z.number().int().min(3).max(3).optional(),
    terminatedAt: z.string().datetime().nullable(),
    terminationReason: z.string().nullable(),
  }),
});

// ---------------------------------------------------------------------------
// 1. /resumes/upload & /resumes/:id
// ---------------------------------------------------------------------------

export const ResumeUploadRequestSchema = z
  .object({
    resumeText: z.string().optional(),
    fileBase64: z.string().optional(),
    fileName: z.string().optional(),
    candidateName: z.string().optional(),
  })
  .refine(
    (data) =>
      (typeof data.resumeText === 'string' && data.resumeText.trim().length >= 10) ||
      (typeof data.fileBase64 === 'string' && data.fileBase64.length > 0),
    {
      message: 'Resume text must be at least 10 characters long, or a valid PDF/DOCX file must be uploaded.',
    },
  );

export const ResumeUploadResponseSchema = z.object({
  extractedText: z.string().optional(),
  resumeId: z.string(),
  candidateName: z.string(),
  resumeText: z.string().optional(),
  profile: z.object({
    skills: z.array(
      z.object({
        skillId: z.string(),
        claim: z.string(),
      }),
    ),
    experience: z.array(z.any()),
    education: z.array(z.any()),
    projects: z.array(z.string()),
    certifications: z.array(z.string()),
    candidate_level_hypothesis: z.object({
      band: CandidateLevelBandEnum,
      basis: z.string(),
      status: z.literal('hypothesis'),
      evidenceOverride: z.boolean().optional(),
    }),
  }),
  audit: z.object({
    passes: z.boolean(),
    findings: z.array(
      z.object({
        severity: z.enum(['ok', 'warning']),
        scope: z.string(),
        finding: z.string(),
      }),
    ),
  }),
  careerPath: z.object({
    recommendedRoleId: z.enum(['backend', 'frontend', 'data', 'fullstack']),
    title: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    rationale: z.string(),
    evidence: z.array(z.string()),
    relatedRoles: z.array(z.object({ roleId: z.enum(['backend', 'frontend', 'data', 'fullstack']), title: z.string() })),
    needsClarification: z.boolean(),
    clarificationPrompt: z.string().optional(),
  }).optional(),
  insights: z.object({
    internships: z.array(z.any()),
    technologies: z.array(z.string()),
    domainKnowledge: z.array(z.string()),
    communicationEvidence: z.array(z.object({ text: z.string(), source: z.object({ line: z.number(), excerpt: z.string(), section: z.string().optional() }) })),
    leadershipEvidence: z.array(z.object({ text: z.string(), source: z.object({ line: z.number(), excerpt: z.string(), section: z.string().optional() }) })),
    validationAreas: z.array(z.object({ topic: z.string(), rationale: z.string(), source: z.object({ line: z.number(), excerpt: z.string(), section: z.string().optional() }) })),
  }).optional(),
});

export const ResumeGetResponseSchema = ResumeUploadResponseSchema;

// ---------------------------------------------------------------------------
// 2. /interviews
// ---------------------------------------------------------------------------

export const InterviewCreateRequestSchema = z.object({
  rolePreset: z.enum(['backend', 'frontend', 'data', 'fullstack']).optional(),
  experienceLevel: z.enum(['junior', 'mid', 'senior']).optional(),
  interviewType: z.enum(['full', 'technical', 'behavioral']).optional(),
  questionsPerRound: z.number().int().min(1).max(6).optional(),
  targetDifficulty: z.number().int().min(1).max(5).optional(),
  answerMode: z.literal('text').optional(),
  jobDescription: z.string().trim().min(1).optional(),
  resumeId: z.string().optional(),
  resumeText: z.string().optional(),
  role: z
    .object({
      title: z.string(),
      skills: z.array(
        z.object({
          skillId: z.string(),
          weight: z.number().optional(),
          requiredLevel: CandidateLevelBandEnum.optional(),
        }),
      ),
      stackNotes: z.string().optional(),
    })
    .optional(),
  numRounds: z.number().int().min(1).max(4).optional(),
});

export const InterviewPlanSummarySchema = z.object({
  roleTitle: z.string(), candidateName: z.string(), totalQuestionBudget: z.number(),
  rounds: z.array(z.object({ roundNumber: z.number(), name: z.string(), description: z.string(),
    targetSkills: z.array(z.string()), questionBudget: z.number(), difficultyRange: z.object({ min: z.number(), max: z.number() }) })),
});
export const InterviewCreateResponseSchema = z.object({
  plan: InterviewPlanSummarySchema.optional(),
  providerName: z.string(),
  sessionId: z.string(),
  state: InterviewStateEnum,
  currentRound: z.number().int().min(1).max(4),
  maxRounds: z.number().int().min(1).max(4),
  publicState: PublicInterviewStateSchema,
  message: z.string(),
  interviewPlan: z.any().optional(),
  integrityToken: z.string().min(32),
  integrityPolicy: z.object({
    maximumWarnings: z.number().int().min(1).max(3),
    monitoringGracePeriodMs: z.number().int().nonnegative(),
    minimumTabHiddenDurationMs: z.number().int().positive(),
    minimumTabVisibleDurationMs: z.number().int().positive(),
    minimumReportedConfidence: z.number().min(0).max(1),
    duplicateSuppressionMs: z.number().int().nonnegative(),
    fullscreenRequired: z.boolean(),
    cameraRequired: z.boolean(),
    monitoredSignals: z.array(z.string()),
  }),
});

export const IntegrityEventRequestSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(['tab_hidden', 'tab_visible', 'window_unfocused', 'fullscreen_exited', 'camera_interrupted', 'microphone_interrupted', 'connection_interrupted']),
  occurredAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().min(1).max(60 * 60 * 1_000),
});

export const IntegrityEventResponseSchema = z.object({
  warningCount: z.number().int().min(0).max(3),
  maximumWarnings: z.number().int().min(1).max(3),
  duplicate: z.boolean(),
  suppressed: z.boolean(),
  terminated: z.boolean(),
  message: z.string(),
  publicState: PublicInterviewStateSchema,
});

// ---------------------------------------------------------------------------
// 3. /interviews/:id/start
// ---------------------------------------------------------------------------

export const InterviewStartResponseSchema = z.object({
  sessionId: z.string(),
  state: InterviewStateEnum,
  currentQuestion: PublicQuestionSchema,
  publicState: PublicInterviewStateSchema,
});

// ---------------------------------------------------------------------------
// 4. /interviews/:id/answer
// ---------------------------------------------------------------------------

export const InterviewAnswerRequestSchema = z.object({
  questionId: z.string().optional(),
  text: z.string().optional(),
  code: z.string().optional(),
  selectedChoiceIndex: z.number().int().optional(),
  elapsedSec: z.number().optional(),
});

export const AnswerFeedbackSchema = z.object({
  criteria: z.array(z.object({ key: z.string(), label: z.string(), score: z.number().min(0).max(10) })),
  strengths: z.array(z.string()), improvements: z.array(z.string()),
});

export const InterviewAnswerResponseSchema = z.object({
  sessionId: z.string(),
  state: InterviewStateEnum,
  evaluation: z.object({
    grade: z.number().min(0).max(10),
    feedback: AnswerFeedbackSchema,
    rationale: z.string(),
    rubricCompliance: z.number().min(0).max(1),
  }),
  publicState: PublicInterviewStateSchema,
});

// ---------------------------------------------------------------------------
// 5. /interviews/:id/next-question
// ---------------------------------------------------------------------------

export const InterviewNextQuestionResponseSchema = z.object({
  sessionId: z.string(),
  state: InterviewStateEnum,
  currentQuestion: PublicQuestionSchema,
  publicState: PublicInterviewStateSchema,
});

// ---------------------------------------------------------------------------
// 6. /interviews/:id/complete
// ---------------------------------------------------------------------------

export const InterviewCompleteResponseSchema = z.object({
  sessionId: z.string(),
  state: z.literal('COMPLETED'),
  overallScore: z.number().min(0).max(100),
  performanceBand: z.string(),
  componentScores: z.object({
    technical: z.number().min(0).max(10),
    problemSolving: z.number().min(0).max(10),
    communication: z.number().min(0).max(10),
    logicalReasoning: z.number().min(0).max(10),
    adaptability: z.number().min(0).max(10),
    delivery: z.number().min(0).max(10),
  }),
  publicState: PublicInterviewStateSchema,
});

// ---------------------------------------------------------------------------
// 7. /interviews/:id/results
// ---------------------------------------------------------------------------

export const IntegrityReviewSchema = z.object({
  totalWarnings: z.number().int().nonnegative().optional(), tabWarnings: z.number().int().nonnegative(), cameraWarnings: z.number().int().nonnegative(),
  incidents: z.array(z.object({
    eventType: z.string(), tier: z.enum(['warning', 'review']), counted: z.boolean(), warningNumber: z.number().int().nonnegative().optional(), startedAtMs: z.number().nonnegative(), durationMs: z.number().nonnegative(),
    occurrences: z.number().int().nonnegative(), confidence: z.number().min(0).max(1).nullable(), ongoingAtEnd: z.boolean(), explanation: z.string(),
  })).max(200),
  note: z.string(),
});

export const InterviewResultsResponseSchema = z.object({
  details: DetailedReportSchema,
  integrityReview: IntegrityReviewSchema.optional(),
  providerName: z.string(),
  readiness: z.object({ score: z.number().min(0).max(100).nullable(), coverage: z.number().min(0).max(100), assessedSkills: z.number(), totalSkills: z.number(), methodology: z.string() }),
  comparisonKey: z.string(),
  evidence: z.array(z.object({ feedback: AnswerFeedbackSchema, questionId: z.string(), skillId: z.string(), question: z.string(), answer: z.string(), score: z.number(), rubricCompliance: z.number() })),
  sessionId: z.string(),
  state: InterviewStateEnum,
  candidateName: z.string(),
  roleTitle: z.string(),
  overallScore: z.number().min(0).max(100),
  performanceBand: z.string(),
  componentScores: z.object({
    technical: z.number(),
    problemSolving: z.number(),
    communication: z.number(),
    logicalReasoning: z.number(),
    adaptability: z.number(),
    delivery: z.number(),
  }),
  skillMap: z.record(
    z.string(),
    z.object({
      estimate: z.number(),
      confidence: z.number(),
      samples: z.number(),
      verdict: z.enum(['meets', 'partially_meets', 'gap', 'unverified']),
    }),
  ),
  gaps: z.array(
    z.object({
      skillId: z.string(),
      severity: z.number(),
      confidence: z.number(),
      reason: z.string(),
    }),
  ),
  roadmap: z.array(
    z.object({
      stepNumber: z.number(),
      skillId: z.string(),
      action: z.string(),
      priority: z.number(),
      effort: z.enum(['short', 'medium', 'long']),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Error Response Schema
// ---------------------------------------------------------------------------

export const ErrorResponseSchema = z.object({
  publicState: PublicInterviewStateSchema.optional(),
  error: z.string(),
  details: z.any().optional(),
  code: z.string().optional(),
  integrityReview: IntegrityReviewSchema.optional(),
});

export const ResumeFileRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentBase64: z.string().min(1).max(7_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Invalid file encoding'),
  candidateName: z.string().max(200).optional(),
});
export const InterviewOptionsSchema = z.object({
  providerName: z.string(), roles: z.array(z.object({ id: z.string(), title: z.string() })),
  interviewTypes: z.array(z.object({ id: z.string(), label: z.string(), rounds: z.number() })),
});
export const InterviewListSchema = z.object({
  storage: z.enum(['memory', 'file', 'sqlite']),
  interviews: z.array(z.object({ sessionId: z.string(), candidateName: z.string(), roleTitle: z.string(),
    state: InterviewStateEnum, answered: z.number(), totalQuestions: z.number(), overallScore: z.number().nullable() })),
});

export const CandidateAccountSchema = z.object({ id: z.string().uuid(), name: z.string(), email: z.email(), createdAt: z.string().datetime() });
export const CandidateResumeSummarySchema = z.object({ resumeId: z.string(), candidateName: z.string(), skillIds: z.array(z.string()), updatedAt: z.string().datetime() });
export const CandidateProfileResponseSchema = z.object({ candidate: CandidateAccountSchema.nullable(), resumes: z.array(CandidateResumeSummarySchema) });
export const CandidateAuthResponseSchema = z.object({ candidate: CandidateAccountSchema, resumes: z.array(CandidateResumeSummarySchema) });
export const CandidateRegisterRequestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(254),
  password: z.string().min(10).max(128),
});
export const CandidateLoginRequestSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(128) });

/** Authorized operational counters and policy decisions; contains no media or answer data. */
export const InterviewDiagnosticsSchema = z.object({
  python: z.object({
    framesReceived: z.number().int().nonnegative(), framesAnalyzed: z.number().int().nonnegative(), failures: z.number().int().nonnegative(),
    service: z.enum(['not_started', 'analyzing', 'connected', 'unavailable', 'stopped']),
    lastFrameAt: z.string().datetime().nullable(), lastObservationAt: z.string().datetime().nullable(), lastDecision: z.string(),
  }),
  events: z.array(z.object({ policyDecision:z.string().optional(), eventId:z.string().optional(), sessionId:z.string().optional(), confidence:z.number().min(0).max(1).nullable().optional(), severity:z.enum(['info','technical']).optional(), details:z.object({source:z.enum(['vision','browser','backend']),signal:z.string(),trackingState:z.string(),phase:z.enum(['observed','recovered','technical'])}).optional(), eventType: z.string(), occurredAt: z.number(), durationMs: z.number().nonnegative(), warningNumber: z.number().int().nullable(),
    tier: z.enum(['warning','review']).optional(), explanation: z.string().optional(), occurrences: z.number().int().nonnegative().optional(), incidentId: z.string().optional(), samples: z.object({ positive: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).optional(), visionWarningNumber: z.number().int().positive().optional() })).max(30),
  warningCount: z.number().int().nonnegative(), visionWarningCount: z.number().int().nonnegative().optional(), state: InterviewStateEnum,
  policy: z.object({ visualNoticeMs: z.number().positive(), hiddenTabMs: z.number().positive(), graceMs: z.number().nonnegative(), penaltySignals: z.array(z.string()), visionWarningSignals: z.array(z.string()).optional(), visionWarningCooldownMs: z.number().nonnegative().optional(), contextualSignals: z.array(z.string()) }),
});
