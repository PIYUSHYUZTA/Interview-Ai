/**
 * AI Mock Interview Platform — intelligence core public API.
 *
 * Everything here is provider-independent. Inject any LLMProvider
 * (DeterministicProvider for offline dev/tests, OpenAI/Anthropic/Vertex for
 * production) and drive the loop through AssessmentOrchestrator.
 */

export * from './core/types.js';
export * from './core/utils/norm.js';

// Provider seam
export * from './core/provider/LLMProvider.js';
export * from './core/provider/AIProvider.js';
export { DeterministicProvider, ANSWER_MARKER, ANSWER_END_MARKER } from './core/provider/DeterministicProvider.js';
export { OpenAIProvider, type OpenAIConfig } from './core/provider/providers/OpenAIProvider.js';
export { AnthropicProvider, type AnthropicConfig } from './core/provider/providers/AnthropicProvider.js';
export { VertexProvider, type VertexConfig } from './core/provider/providers/VertexProvider.js';
export { OpenRouterProvider, type OpenRouterConfig } from './core/provider/providers/OpenRouterProvider.js';
export { createActiveAIProvider, resolveAIProvider, loadEnvFile } from './core/provider/providerFactory.js';

// Understanding
export { ResumeAnalyzer, type ResumeAnalyzerOutput, type ResumeAnalyzerAuditResult } from './core/understanding/ResumeAnalyzer.js';
export { ProfileBuilder, DefaultClaimExtractor } from './core/understanding/ProfileBuilder.js';
export { ResumeIntelligence, type AuditFinding } from './core/understanding/ResumeIntelligence.js';
export { CareerPathDetector, type CareerPathRecommendation, type CareerPathConfidence, type CareerRoleId } from './core/understanding/CareerPathDetector.js';
export { TopicInferenceEngine, brief } from './core/understanding/TopicInferenceEngine.js';
export { parseResume, isKnownSkillKeyword, lineForIndex } from './core/understanding/ResumeParser.js';
export { defaultTaxonomy, inferLevelBandFromYears } from './core/taxonomy/skills.js';
export { JobRequirementParser, defaultJobRequirementParser } from './core/jobs/JobRequirementParser.js';
export { JobRequirementIntelligence, type GapAnalysisOutput, type JobCompareInput } from './core/jobs/JobRequirementIntelligence.js';

// Assessment
export { RollingSkillState, defaultSkillStateManager } from './core/assessment/SkillState.js';
export { EvidenceTracer } from './core/assessment/EvidenceTracer.js';
export { finalGrade, weightedCriteriaScore, performanceBand } from './core/assessment/Rubric.js';
export { CompositeEvaluator } from './core/assessment/evaluators/CompositeEvaluator.js';
export {
  AnswerEvaluator,
  type AnswerEvaluatorInput,
  type AnswerEvaluatorOutput,
  type AnswerEvaluatorContext,
  type AnswerEvaluatorAuditResult,
  type AnswerEvaluatorDeps,
  answerEvaluatorSchema,
} from './core/assessment/evaluators/AnswerEvaluator.js';
export {
  ScoringEngine,
  type ComponentScores,
  type ScoringCategoryWeights,
  type ScoringEngineResult,
  type ScoringEngineAuditResult,
  type EvaluatorScoreInput,
  SCORING_WEIGHTS,
  computeOverallScoreFromCriteria,
} from './core/score/ScoringEngine.js';

// Adaptation & Planning
export {
  AdaptiveEngine,
  type AdaptiveDecisionInput,
  type AdaptiveDecisionOutput,
  type AdaptiveAction,
  type AdaptiveEngineAuditResult,
  type AdaptiveEngineDeps,
  extractScoreRatio,
} from './core/adaptation/AdaptiveEngine.js';
export {
  QuestionGenerator,
  type GenerateQuestionServiceInput,
  type GeneratedQuestionJSON,
} from './core/adaptation/QuestionGenerator.js';
export { InterviewPlanner, defaultPlanner, type PlannerInput } from './core/planner/InterviewPlanner.js';

// Improvement
export { GapAnalyzer, defaultGapAnalyzer } from './core/improve/GapAnalyzer.js';
export { RoadmapPlanner, defaultRoadmapPlanner } from './core/improve/RoadmapPlanner.js';

// Candidate Intelligence Model
export {
  CandidateIntelligenceModelBuilder,
  defaultCandidateIntelligenceBuilder,
} from './core/intelligence/CandidateIntelligenceModel.js';

// Session & orchestration
export { InterviewSession } from './core/session/InterviewSession.js';
export {
  InterviewStateMachine,
  InterviewState,
  InvalidStateTransitionError,
  type PublicInterviewState,
  type PublicQuestion,
  type QuestionHistoryEntry,
  type InterviewTiming,
  type StateMachineDeps,
  type SerializedStateMachine,
} from './core/session/InterviewStateMachine.js';
export { INTERVIEW_INTEGRITY_POLICY, validateIntegrityEvent, type IntegrityEventType, type IntegrityEventInput, type IntegrityEventRecord } from './core/session/IntegrityPolicy.js';
export {
  type InterviewSessionStore,
  InMemorySessionStore,
  FileSessionStore,
} from './core/session/InterviewSessionStore.js';
export { AssessmentOrchestrator } from './core/orchestrator/AssessmentOrchestrator.js';

// Offline simulation (dev/CI)
export { CandidateSimulator } from './simulation/CandidateSimulator.js';

// Section 16 API Layer
export { ApiServer, createApiServer, type ApiServerOptions } from './api/server.js';
export * from './api/schemas.js';
