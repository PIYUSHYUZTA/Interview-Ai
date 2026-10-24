import type {
  CandidateAnswer,
  Question,
  QuestionEvaluation,
  QuestionType,
  RubricCriteria,
  SkillsTaxonomy,
} from '../../types.js';
import type { LLMProvider } from '../../provider/LLMProvider.js';
import type { AIProvider } from '../../provider/AIProvider.js';
import { defaultTaxonomy } from '../../taxonomy/skills.js';
import { norm, round } from '../../utils/norm.js';
import { finalGrade } from '../Rubric.js';
import { objectNode, numberNode, stringNode, arrayNode, type SchemaNode } from '../../ai/schema.js';
import { requestStructured, parseJsonData } from '../../ai/json.js';

/**
 * Service 3: Answer Evaluator Context Contract
 */
export interface AnswerEvaluatorContext {
  readonly target_skill?: string;
  readonly skillId?: string;
  readonly difficulty?: number; // 1-10
  readonly question_type?: string;
  readonly type?: string;
  readonly role?: string;
  readonly candidate_level?: string;
  readonly round?: number | string;
  readonly [key: string]: unknown;
}

/**
 * Service 3: Answer Evaluator Input Contract
 * Input: question + expected_answer_points + candidate's answer + context
 */
export interface AnswerEvaluatorInput {
  readonly question:
    | string
    | Question
    | {
        readonly prompt: string;
        readonly id?: string;
        readonly rubricHints?: readonly string[];
        readonly type?: string;
        readonly skillId?: string;
        readonly difficulty?: number;
        [key: string]: unknown;
      };
  readonly expected_answer_points: readonly string[];
  readonly candidate_answer?:
    | string
    | CandidateAnswer
    | { readonly text?: string; readonly code?: string; readonly selectedChoiceIndex?: number; [key: string]: unknown };
  readonly candidateAnswer?:
    | string
    | CandidateAnswer
    | { readonly text?: string; readonly code?: string; readonly selectedChoiceIndex?: number; [key: string]: unknown };
  readonly context?: AnswerEvaluatorContext;
}

/**
 * Service 3: Answer Evaluator Output Contract
 * Output: JSON — correctness, reasoning, technical_depth, communication, confidence, feedback, knowledge_gaps
 */
export interface AnswerEvaluatorOutput {
  readonly correctness: number; // 0..10
  readonly reasoning: number; // 0..10
  readonly technical_depth: number; // 0..10
  readonly communication: number; // 0..10
  readonly confidence: number; // 0..1
  readonly feedback: string;
  readonly knowledge_gaps: readonly string[];

  // CamelCase aliases for TypeScript ecosystem convenience
  readonly technicalDepth?: number;
  readonly knowledgeGaps?: readonly string[];
}

export interface AnswerEvaluatorAuditResult {
  readonly passes: boolean;
  readonly findings: readonly {
    readonly severity: 'ok' | 'violation' | 'warning';
    readonly scope: string;
    readonly message: string;
  }[];
}

export interface AnswerEvaluatorDeps {
  readonly provider?: AIProvider | LLMProvider;
  readonly taxonomy?: SkillsTaxonomy;
}

/**
 * Schema for LLM structured output validation.
 */
export const answerEvaluatorSchema: SchemaNode = objectNode({
  props: {
    correctness: numberNode({ min: 0, max: 10 }),
    reasoning: numberNode({ min: 0, max: 10 }),
    technical_depth: numberNode({ min: 0, max: 10 }),
    communication: numberNode({ min: 0, max: 10 }),
    confidence: numberNode({ min: 0, max: 1 }),
    feedback: stringNode({ minLen: 5 }),
    knowledge_gaps: arrayNode(stringNode()),
  },
  required: [
    'correctness',
    'reasoning',
    'technical_depth',
    'communication',
    'confidence',
    'feedback',
    'knowledge_gaps',
  ],
});

/**
 * Service 3: Answer Evaluator
 *
 * Mandate:
 * Input: question + expected_answer_points + candidate's answer + context
 * Output: JSON — correctness, reasoning, technical_depth, communication, confidence, feedback, knowledge_gaps
 * Rule: evaluate only evidence present in the answer; never assume unshown knowledge
 *
 * Decoupled Service Design:
 * - Anti-Halo / Anti-Assumption: Evaluates solely the direct evidence present in the candidate's answer.
 * - Point-by-point expected answer verification: Maps evidence against expected_answer_points; unevidenced points are flagged as knowledge_gaps.
 * - Buzzword Inflation Defense: Penalizes keyword dropping without mechanics or rationale.
 * - Fully local deterministic baseline with optional pluggable LLM provider.
 */
export class AnswerEvaluator {
  private readonly provider?: AIProvider | LLMProvider;
  private readonly taxonomy: SkillsTaxonomy;

  constructor(deps: AnswerEvaluatorDeps = {}) {
    this.provider = deps.provider;
    this.taxonomy = deps.taxonomy ?? defaultTaxonomy;
  }

  get aiProvider(): AIProvider | LLMProvider | undefined {
    return this.provider;
  }

  /**
   * Evaluate a candidate answer synchronously using strict evidence heuristics.
   */
  evaluateSync(input: AnswerEvaluatorInput): AnswerEvaluatorOutput {
    return this.evaluateHeuristic(input);
  }

  /**
   * Evaluate a candidate answer asynchronously.
   * If a non-deterministic provider is injected, requests structured evaluation via LLM,
   * falling back safely to deterministic evidence heuristics if the provider fails.
   */
  async evaluate(input: AnswerEvaluatorInput): Promise<AnswerEvaluatorOutput> {
    if (this.provider && this.provider.name !== 'deterministic') {
      try {
        const prompt = this.buildEvaluationPrompt(input);
        let val: any = null;

        // If provider implements Section 20 AIProvider interface:
        if (typeof (this.provider as AIProvider).evaluate === 'function') {
          const raw = await (this.provider as AIProvider).evaluate(prompt, { json: true });
          val = parseJsonData(raw);
        } else if (typeof (this.provider as LLMProvider).completeStructured === 'function') {
          const result = await requestStructured<AnswerEvaluatorOutput>({
            provider: this.provider as LLMProvider,
            task: 'score_open_response',
            prompt,
            schema: answerEvaluatorSchema,
            options: { temperature: 0 },
          });
          if (result.ok && result.value) val = result.value;
        }

        if (val && typeof val === 'object' && ('correctness' in val || 'grade' in val || 'score' in val)) {
          const correctness = Number(val.correctness ?? val.score ?? val.grade) || 0;
          const reasoning = Number(val.reasoning ?? correctness * 0.9) || 0;
          const depth = Number(val.technical_depth ?? val.technicalDepth ?? correctness) || 0;
          const comm = Number(val.communication ?? 8.0) || 0;
          const conf = Number(val.confidence ?? 0.85) || 0.85;

          const output: AnswerEvaluatorOutput = {
            correctness: round(norm.clamp10(correctness), 1),
            reasoning: round(norm.clamp10(reasoning), 1),
            technical_depth: round(norm.clamp10(depth), 1),
            communication: round(norm.clamp10(comm), 1),
            confidence: round(norm.clamp01(conf), 2),
            feedback: typeof val.feedback === 'string' ? val.feedback : 'Evaluation completed.',
            knowledge_gaps: Array.isArray(val.knowledge_gaps) ? val.knowledge_gaps : Array.isArray(val.knowledgeGaps) ? val.knowledgeGaps : [],
            technicalDepth: round(norm.clamp10(depth), 1),
            knowledgeGaps: Array.isArray(val.knowledge_gaps) ? val.knowledge_gaps : Array.isArray(val.knowledgeGaps) ? val.knowledgeGaps : [],
          };
          return output;
        }
      } catch {
        // Fall back gracefully to deterministic evidence heuristics
      }
    }

    return this.evaluateHeuristic(input);
  }

  /**
   * Serialize output to clean JSON matching the exact required schema.
   */
  toJSON(output: AnswerEvaluatorOutput): string {
    const clean = {
      correctness: output.correctness,
      reasoning: output.reasoning,
      technical_depth: output.technical_depth,
      communication: output.communication,
      confidence: output.confidence,
      feedback: output.feedback,
      knowledge_gaps: output.knowledge_gaps,
    };
    return JSON.stringify(clean, null, 2);
  }

  /**
   * Audit an evaluation against the strict rule:
   * "evaluate only evidence present in the answer; never assume unshown knowledge"
   */
  audit(
    rawAnswer: string,
    output: AnswerEvaluatorOutput,
    expectedPoints: readonly string[],
  ): AnswerEvaluatorAuditResult {
    const findings: { severity: 'ok' | 'violation' | 'warning'; scope: string; message: string }[] = [];
    const normText = normalize(rawAnswer);
    const words = splitWords(rawAnswer);

    // Rule check 1: Empty or minimal answer must not receive unearned high scores
    if (words.length < 5) {
      if (output.technical_depth > 2.0) {
        findings.push({
          severity: 'violation',
          scope: 'unshown_knowledge',
          message: `Candidate provided only ${words.length} words, but received technical_depth ${output.technical_depth}. Unshown knowledge was assumed.`,
        });
      }
      if (output.reasoning > 2.0) {
        findings.push({
          severity: 'violation',
          scope: 'unshown_knowledge',
          message: `Candidate provided only ${words.length} words, but received reasoning score ${output.reasoning}. Unshown reasoning was assumed.`,
        });
      }
    }

    // Rule check 2: Every missing expected point must be present in knowledge_gaps
    for (const point of expectedPoints) {
      const isEvidenced = testPointEvidence(point, normText);
      const isReportedInGaps = output.knowledge_gaps.some(
        (gap) => gap.toLowerCase().includes(point.toLowerCase().slice(0, 30)) || point.toLowerCase().includes(gap.toLowerCase().slice(0, 30)),
      );

      if (!isEvidenced && !isReportedInGaps && expectedPoints.length > 0) {
        findings.push({
          severity: 'violation',
          scope: 'knowledge_gaps',
          message: `Expected point "${point}" has no evidence in answer, but was omitted from knowledge_gaps.`,
        });
      }
    }

    // Rule check 3: Buzzwords without mechanics must not inflate technical depth
    const buzzwordsPresent = BUZZWORDS.filter((re) => re.test(normText));
    const mechanicsPresent = TECHNICAL_MECHANICS.filter((re) => re.test(normText));
    if (buzzwordsPresent.length >= 3 && mechanicsPresent.length === 0 && output.technical_depth > 4.0) {
      findings.push({
        severity: 'violation',
        scope: 'buzzword_inflation',
        message: `Candidate named buzzwords (${buzzwordsPresent.length}) without explaining underlying mechanics, yet technical_depth is ${output.technical_depth}.`,
      });
    }

    if (findings.length === 0) {
      findings.push({
        severity: 'ok',
        scope: 'anti_hallucination',
        message: 'Strict evidence evaluation verified: zero unshown knowledge assumed.',
      });
    }

    return {
      passes: !findings.some((f) => f.severity === 'violation'),
      findings,
    };
  }

  /**
   * Bridge to QuestionEvaluation for seamless integration with
   * ScoringEngine, EvidenceTracer, and AssessmentOrchestrator.
   */
  toQuestionEvaluation(
    output: AnswerEvaluatorOutput,
    questionId: string,
    skillId: string,
    questionType: QuestionType = 'conceptual',
  ): QuestionEvaluation {
    const compliance = output.knowledge_gaps.length === 0 ? 1.0 : norm.clamp01(output.correctness / 10);
    const criteria: RubricCriteria = {
      knowledgeDepth: output.technical_depth,
      recallPrecision: output.correctness,
      reasoning: output.reasoning,
      appliedEvidence: round(norm.clamp10(output.technical_depth * 0.7 + output.reasoning * 0.3), 1),
      communication: output.communication,
    };

    const grade = finalGrade(criteria, questionType, compliance);

    return {
      questionId,
      skillId,
      grade: round(grade, 1),
      criteria,
      rationale: output.feedback,
      rubricCompliance: round(compliance, 2),
    };
  }

  // ---------------------------------------------------------------------------
  // Core Deterministic Evidence Heuristics
  // ---------------------------------------------------------------------------

  private evaluateHeuristic(input: AnswerEvaluatorInput): AnswerEvaluatorOutput {
    const questionPrompt = extractQuestionPrompt(input.question);
    const expectedPoints = Array.isArray(input.expected_answer_points)
      ? input.expected_answer_points.filter((p) => typeof p === 'string' && p.trim().length > 0)
      : [];
    const answerText = extractAnswerText(input.candidate_answer ?? input.candidateAnswer);
    const context = input.context ?? {};

    // Base: Empty or blank answer check
    if (!answerText || answerText.trim().length === 0) {
      return {
        correctness: 0,
        reasoning: 0,
        technical_depth: 0,
        communication: 0,
        confidence: 0.95, // Highly confident that no answer was given
        feedback:
          'No answer provided. Under strict evaluation rules, no candidate knowledge can be assumed without direct evidence.',
        knowledge_gaps: [...expectedPoints],
        technicalDepth: 0,
        knowledgeGaps: [...expectedPoints],
      };
    }

    const normAnswer = normalize(answerText);
    const words = splitWords(answerText);
    const wordCount = words.length;

    // Check for explicit refusal or "I don't know"
    if (isRefusal(normAnswer)) {
      return {
        correctness: 0,
        reasoning: 0,
        technical_depth: 0,
        communication: 3.0, // Clear admission of limitation
        confidence: 0.95,
        feedback:
          'Candidate explicitly stated they do not know the answer. Pursuant to strict evaluation rules, no unshown knowledge is assumed.',
        knowledge_gaps: [...expectedPoints],
        technicalDepth: 0,
        knowledgeGaps: [...expectedPoints],
      };
    }

    // 1. Expected Answer Points Evidence Verification
    const pointAnalysis = analyzeExpectedPoints(expectedPoints, normAnswer, words);
    const demonstratedCount = pointAnalysis.demonstrated.length;
    const partialCount = pointAnalysis.partial.length;
    const totalExpected = expectedPoints.length;

    // 2. Lexical & Structural Metrics
    const reasoningMarkersFound = REASONING_MARKERS.filter((re) => re.test(normAnswer));
    const tradeOffMarkersFound = TRADEOFF_MARKERS.filter((re) => re.test(normAnswer));
    const mechanicsFound = TECHNICAL_MECHANICS.filter((re) => re.test(normAnswer));
    const buzzwordsFound = BUZZWORDS.filter((re) => re.test(normAnswer));
    const vagueTermsFound = VAGUE_TERMS.filter((re) => re.test(normAnswer));
    const structureMarkersFound = STRUCTURE_MARKERS.filter((re) => re.test(normAnswer));

    // Anti-buzzword inflation: If buzzwords are present without accompanying mechanics, penalize depth
    const unsubstantiatedBuzzwords = buzzwordsFound.filter(
      (bw) => !mechanicsFound.some((m) => m.source === bw.source),
    );

    // 3. Compute Correctness (0..10)
    // Based on evidenced expected points coverage and factual grounding
    let correctnessRaw = 0;
    if (totalExpected > 0) {
      const coverageRatio = (demonstratedCount * 1.0 + partialCount * 0.45) / totalExpected;
      correctnessRaw = coverageRatio * 10;
    } else {
      // Fallback if no expected points specified: rate by question topicality and depth
      const questionTokens = extractMeaningfulTokens(questionPrompt);
      const matchedTokens = questionTokens.filter((t) => normAnswer.includes(t));
      const ratio = questionTokens.length > 0 ? matchedTokens.length / questionTokens.length : 0.5;
      correctnessRaw = Math.min(8.0, 2.0 + ratio * 6.0);
    }

    // Inaccuracy / off-topic penalty if candidate is writing pure filler
    if (wordCount > 10 && demonstratedCount === 0 && partialCount === 0 && mechanicsFound.length === 0) {
      correctnessRaw = Math.min(1.5, correctnessRaw * 0.2);
    }
    const correctness = round(norm.clamp10(correctnessRaw), 1);

    // 4. Compute Reasoning (0..10)
    // Evaluates cause-and-effect ("because", "therefore"), trade-offs ("vs", "overhead"),
    // architectural choices, and algorithmic justification
    let reasoningRaw = 1.0;

    // Causal connectives
    if (reasoningMarkersFound.length > 0) {
      reasoningRaw += Math.min(4.0, reasoningMarkersFound.length * 1.0);
    }
    // Trade-offs & comparative analysis
    if (tradeOffMarkersFound.length > 0) {
      reasoningRaw += Math.min(3.5, tradeOffMarkersFound.length * 1.2);
    }
    // Structural logic (step-by-step or sectioned progression)
    if (hasStructuralSections(answerText) || structureMarkersFound.length > 0) {
      reasoningRaw += 1.0;
    }
    // Demonstrated expected points carry inherent reasoning content
    if (demonstratedCount > 0) {
      reasoningRaw += Math.min(3.0, demonstratedCount * 0.8);
    }
    // Code algorithmic justification (invariants, complexities, guard clauses)
    if (hasCodeEvidence(answerText)) {
      const codeReasoningFound = CODE_REASONING_MARKERS.filter((re) => re.test(normAnswer));
      if (codeReasoningFound.length > 0) {
        reasoningRaw += Math.min(3.5, codeReasoningFound.length * 1.2);
      }
    }

    // Penalize assertion without rationale (empty reasoning)
    if (reasoningMarkersFound.length === 0 && tradeOffMarkersFound.length === 0 && demonstratedCount === 0) {
      reasoningRaw = Math.min(2.5, 0.8 + Math.min(1.5, wordCount / 50));
    }
    const reasoning = round(norm.clamp10(reasoningRaw), 1);

    // 5. Compute Technical Depth (0..10)
    // Concrete mechanics, algorithms, invariants, data structures, protocols vs superficial names
    let technicalDepthRaw = 1.0;
    const mechanicsScore = Math.min(6.0, mechanicsFound.length * 1.3);
    const demonstratedBonus = Math.min(3.0, demonstratedCount * 1.0);
    technicalDepthRaw += mechanicsScore + demonstratedBonus;

    // Code presence gives concrete technical evidence
    if (hasCodeEvidence(answerText)) {
      technicalDepthRaw += 1.8;
    }

    // Quantitative metrics in answer (e.g. O(n), 10ms, 99.9%, 1000 QPS)
    if (/\b(?:o\([n1klog\s\^]+\)|[0-9]+(?:\.[0-9]+)?\s*(?:ms|s|sec|qps|rps|%|kb|mb|gb))\b/i.test(normAnswer)) {
      technicalDepthRaw += 1.0;
    }

    // Strict Rule: Unsubstantiated buzzword penalty
    if (unsubstantiatedBuzzwords.length > 0 && mechanicsFound.length < unsubstantiatedBuzzwords.length) {
      const penalty = Math.min(2.5, unsubstantiatedBuzzwords.length * 0.8);
      technicalDepthRaw = Math.max(1.0, technicalDepthRaw - penalty);
    }

    // Zero-mechanics cap: If no technical mechanics are present, depth cannot exceed 3.0
    if (mechanicsFound.length === 0 && !hasCodeEvidence(answerText)) {
      technicalDepthRaw = Math.min(3.0, technicalDepthRaw);
    }
    const technical_depth = round(norm.clamp10(technicalDepthRaw), 1);

    // 6. Compute Communication (0..10)
    // Structure, clarity, precision of technical vocabulary, absence of vague filler
    let commRaw = 2.0;
    commRaw += Math.min(3.5, wordCount / 25);
    if (structureMarkersFound.length > 0 || hasStructuralSections(answerText)) {
      commRaw += 2.0;
    }
    if (vagueTermsFound.length > 0) {
      commRaw -= Math.min(3.0, vagueTermsFound.length * 0.9);
    }
    // Reward structured concise expression
    if (wordCount >= 20 && vagueTermsFound.length === 0) {
      commRaw += 1.5;
    }
    const communication = round(norm.clamp10(commRaw), 1);

    // 7. Compute Confidence (0..1)
    // Measures evaluator epistemic confidence based on evidence sufficiency.
    // Extremely brief answers have low observation area; rich detailed answers have high confidence.
    let conf = 0.35;
    if (wordCount < 15) {
      conf = 0.25;
    } else if (wordCount < 40) {
      conf = 0.50;
    } else if (wordCount < 90) {
      conf = 0.75;
    } else {
      conf = 0.90;
    }

    // Penalize confidence if vague filler dominates (ambiguous answer)
    if (vagueTermsFound.length >= 2) {
      conf = Math.max(0.2, conf - 0.15);
    }
    // Increase confidence if demonstrated points are definitive
    if (demonstratedCount === totalExpected && totalExpected > 0) {
      conf = Math.min(0.98, conf + 0.1);
    }
    const confidence = round(norm.clamp01(conf), 2);

    // 8. Construct Knowledge Gaps & Feedback
    const knowledge_gaps = pointAnalysis.gaps;
    const feedback = buildFeedback({
      questionPrompt,
      demonstratedPoints: pointAnalysis.demonstrated,
      partialPoints: pointAnalysis.partial,
      gaps: pointAnalysis.gaps,
      unsubstantiatedBuzzwords,
      correctness,
      reasoning,
      technical_depth,
      communication,
      expectedPointsCount: totalExpected,
      context,
    });

    return {
      correctness,
      reasoning,
      technical_depth,
      communication,
      confidence,
      feedback,
      knowledge_gaps,
      technicalDepth: technical_depth,
      knowledgeGaps: knowledge_gaps,
    };
  }

  private buildEvaluationPrompt(input: AnswerEvaluatorInput): string {
    const prompt = extractQuestionPrompt(input.question);
    const expectedPoints = Array.isArray(input.expected_answer_points)
      ? input.expected_answer_points.join('\n- ')
      : '(none provided)';
    const answer = extractAnswerText(input.candidate_answer ?? input.candidateAnswer);
    const targetSkill = input.context?.target_skill ?? input.context?.skillId ?? 'general';
    const skillLabel = this.taxonomy.get(targetSkill)?.label ?? targetSkill;
    const difficulty = input.context?.difficulty ?? 5;

    return [
      'You are an expert technical interviewer evaluating an interview answer against strict evidence-bound standards.',
      '',
      `QUESTION:`,
      prompt,
      '',
      `TARGET SKILL: ${skillLabel} (${targetSkill})`,
      `DIFFICULTY (1-10): ${difficulty}`,
      '',
      `EXPECTED ANSWER POINTS:`,
      `- ${expectedPoints}`,
      '',
      `CANDIDATE ANSWER:`,
      '<<<ANSWER>>>',
      answer,
      '<<<END_ANSWER>>>',
      '',
      'EVALUATION RULES:',
      '1. Evaluate ONLY evidence present in the candidate answer.',
      '2. NEVER assume unshown knowledge. If a candidate drops a technology name (e.g. Redis, Kafka) without explaining its mechanics, trade-offs, or failure modes, do NOT credit internal knowledge.',
      '3. Any expected answer point that was not demonstrated with direct evidence MUST be listed in knowledge_gaps.',
      '4. Scores: correctness (0..10), reasoning (0..10), technical_depth (0..10), communication (0..10), confidence (0..1).',
      '5. Provide constructive, evidence-based feedback explaining what was shown and what was missing.',
      '',
      'Respond with a single valid JSON object of exactly this schema:',
      '{"correctness":0,"reasoning":0,"technical_depth":0,"communication":0,"confidence":0,"feedback":"","knowledge_gaps":[]}',
    ].join('\n');
  }
}

// ---------------------------------------------------------------------------
// Lexical and Semantic Analysis Helpers
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function splitWords(s: string): string[] {
  return normalize(s)
    .split(/\s+/)
    .filter(Boolean);
}

function extractQuestionPrompt(q: unknown): string {
  if (typeof q === 'string') return q;
  if (q && typeof q === 'object' && 'prompt' in q && typeof q.prompt === 'string') {
    return q.prompt;
  }
  return '';
}

function extractAnswerText(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a && typeof a === 'object') {
    const obj = a as Record<string, unknown>;
    const textPart = typeof obj.text === 'string' ? obj.text : '';
    const codePart = typeof obj.code === 'string' ? obj.code : '';
    const combined = [textPart, codePart].filter(Boolean).join('\n\n');
    if (combined) return combined;
    if (typeof obj.answer === 'string') return obj.answer;
    if (typeof obj.selectedChoiceIndex === 'number') {
      return `Selected choice: Option ${obj.selectedChoiceIndex}`;
    }
  }
  return '';
}

function isRefusal(normText: string): boolean {
  const refusalPatterns = [
    /^(?:i don'?t know|no idea|idk|not sure|skip|pass|no answer|no clue|can'?t answer)\b/i,
    /^i have no (?:idea|experience|clue|knowledge)\b/i,
    /^(?:dunno|n\/a|none)\.?$/i,
    /\b(?:i do not know|i don't know)\b/i,
  ];
  const words = splitWords(normText);
  if (words.length <= 16 && /\b(?:i don'?t know|i do not know|no idea|no clue|can'?t answer)\b/i.test(normText)) {
    return true;
  }
  return refusalPatterns.some((re) => re.test(normText));
}

function hasCodeEvidence(text: string): boolean {
  return (
    /```[\s\S]*?```/.test(text) ||
    /function\s+\w+\s*\(/.test(text) ||
    /const\s+\w+\s*=\s*(?:\([^)]*\)|function|\w+)\s*=>/.test(text) ||
    /class\s+\w+\s*\{/.test(text) ||
    /def\s+\w+\s*\(/.test(text) ||
    /for\s*\(let\s+\w+|while\s*\(|if\s*\(/.test(text)
  );
}

function hasStructuralSections(text: string): boolean {
  return (
    /(?:\n\s*[-*•]\s+|\n\s*[0-9]+\.\s+|\n#{1,4}\s+)/.test(text) ||
    text.split(/\n\s*\n/).filter(Boolean).length >= 2
  );
}

const STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'could', 'did',
  'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have',
  'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into',
  'is', 'it', 'its', 'itself', 'just', 'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of',
  'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you',
  'your', 'yours', 'yourself', 'yourselves',
]);

function extractMeaningfulTokens(text: string): string[] {
  return normalize(text)
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

interface PointAnalysisResult {
  readonly demonstrated: readonly string[];
  readonly partial: readonly string[];
  readonly gaps: readonly string[];
}

const TECHNICAL_SYNONYMS: Record<string, readonly string[]> = {
  eviction: ['evict', 'evicting', 'remove', 'removing', 'removal', 'discard', 'drop', 'shift', 'pop'],
  evict: ['eviction', 'remove', 'removing', 'discard', 'drop', 'shift', 'pop'],
  front: ['head', 'start', 'first', 'shift', 'deque[0]', 'beginning'],
  rear: ['tail', 'end', 'last', 'back', 'pop'],
  decreasing: ['descending', 'decreasing', 'monotonic'],
  increasing: ['ascending', 'increasing', 'monotonic'],
  amortized: ['amortize', 'amortized', 'average'],
  batching: ['batch', 'batched', 'accumulate', 'accumulating', 'group'],
  reconciliation: ['reconcile', 'reconciling', 'diff', 'diffing'],
  diffing: ['diff', 'diffs', 'reconcile', 'reconciliation', 'compare', 'comparing'],
  overhead: ['cost', 'memory overhead', 'trade-off', 'penalty', 'heap'],
  invalidation: ['invalidate', 'invalidating', 'bust', 'purge', 'expire', 'expiration', 'ttl'],
  idempotent: ['idempotency', 'deduplicate', 'dedup', 'once'],
  partition: ['partitioning', 'shard', 'sharding', 'split'],
  concurrency: ['concurrent', 'threads', 'parallel', 'mutex', 'lock'],
  latency: ['delay', 'lag', 'response time', 'roundtrip'],
  throughput: ['qps', 'rps', 'bandwidth', 'load'],
};

function tokenMatchesAnswer(token: string, normAnswer: string): boolean {
  if (normAnswer.includes(token)) return true;
  const synonyms = TECHNICAL_SYNONYMS[token];
  if (synonyms) {
    return synonyms.some((syn) => normAnswer.includes(syn));
  }
  return false;
}

/**
 * Tests whether an individual expected answer point is substantiated by evidence in the answer.
 */
function testPointEvidence(point: string, normAnswer: string): boolean {
  const tokens = extractMeaningfulTokens(point);
  if (tokens.length === 0) return false;

  // Exact substring check
  if (normAnswer.includes(normalize(point))) return true;

  // Token coverage with technical synonym mapping
  const matchedTokens = tokens.filter((t) => tokenMatchesAnswer(t, normAnswer));
  const matchRatio = matchedTokens.length / tokens.length;

  // If >= 50% of significant concepts in this point are present in the text, test for explanation
  if (matchRatio >= 0.5) {
    return true;
  }

  // Check key concept pairs / bigrams
  for (let i = 0; i < tokens.length - 1; i++) {
    const pair = `${tokens[i]} ${tokens[i + 1]}`;
    if (normAnswer.includes(pair) && matchRatio >= 0.35) {
      return true;
    }
  }

  return false;
}

function analyzeExpectedPoints(
  expectedPoints: readonly string[],
  normAnswer: string,
  words: string[],
): PointAnalysisResult {
  const demonstrated: string[] = [];
  const partial: string[] = [];
  const gaps: string[] = [];

  for (const point of expectedPoints) {
    const tokens = extractMeaningfulTokens(point);
    if (tokens.length === 0) continue;

    const matchedTokens = tokens.filter((t) => tokenMatchesAnswer(t, normAnswer));
    const ratio = matchedTokens.length / tokens.length;

    if (testPointEvidence(point, normAnswer) && words.length >= 10) {
      demonstrated.push(point);
    } else if (ratio >= 0.35 || matchedTokens.length >= 2) {
      partial.push(point);
      // Under strict rule, partial evidence without full demonstration remains a gap
      gaps.push(point);
    } else {
      gaps.push(point);
    }
  }

  return { demonstrated, partial, gaps };
}

// ---------------------------------------------------------------------------
// Lexical Markers
// ---------------------------------------------------------------------------

const REASONING_MARKERS = [
  /\bbecause\b/i,
  /\btherefore\b/i,
  /\bhence\b/i,
  /\bso that\b/i,
  /\bin order to\b/i,
  /\bas a result\b/i,
  /\bleads to\b/i,
  /\bprevent(?:s|ing|ed)?\b/i,
  /\bavoid(?:s|ing|ed)?\b/i,
  /\bensur(?:es|ing|ed)?\b/i,
  /\ballow(?:s|ing|ed)?\b/i,
  /\benabl(?:es|ing|ed)?\b/i,
  /\bconsequently\b/i,
  /\bthe reason is\b/i,
  /\bsince\b/i,
  /\bwhich (?:means|causes|leads|results|allows|ensures|prevents)\b/i,
  /\bthereby\b/i,
  /\bthus\b/i,
  /\bdue to\b/i,
  /\bby (?:accumulating|comparing|batching|caching|indexing|partitioning|filtering|maintaining|checking|using)\b/i,
];

const TRADEOFF_MARKERS = [
  /\btrade-?offs?\b/i,
  /\bon the other hand\b/i,
  /\bwhereas\b/i,
  /\bversus\b/i,
  /\bvs\.?\b/i,
  /\bat the (?:cost|expense) of\b/i,
  /\bpros and cons\b/i,
  /\bcompromise\b/i,
  /\bbalancing\b/i,
  /\boverhead\b/i,
  /\blatency vs\b/i,
  /\bconsistency vs\b/i,
  /\brather than\b/i,
  /\binstead of\b/i,
  /\b(?:faster|slower|cheaper|more expensive|more efficient) than\b/i,
  /\bcompar(?:e|ed|ing|ison)\b/i,
];

const CODE_REASONING_MARKERS = [
  /\b(?:time|space)\s+complexity\b/i,
  /\bamortized\b/i,
  /\bmaintains?\b/i,
  /\b(?:at most once|bounded by|invariant|base case|guard clause)\b/i,
  /\bwhile\s*\([^)]+\)/i,
  /\bif\s*\([^)]+\)\s*(?:return|continue|break|throw)/i,
];

const TECHNICAL_MECHANICS = [
  /\bindex\b/i,
  /\bpartition\b/i,
  /\bshard(?:ing)?\b/i,
  /\bidempoten(?:t|cy)\b/i,
  /\bacid\b/i,
  /\btransaction\b/i,
  /\bconcurren(?:t|cy)\b/i,
  /\bdeadlock\b/i,
  /\brace condition\b/i,
  /\bmutex\b/i,
  /\bsemaphore\b/i,
  /\bcache invalidat\w*\b/i,
  /\bttl\b/i,
  /\blru\b/i,
  /\bwrite-through\b/i,
  /\bwrite-back\b/i,
  /\bbloom filter\b/i,
  /\bb-?tree\b/i,
  /\blsm-?tree\b/i,
  /\bwal\b/i,
  /\bwrite-ahead log\b/i,
  /\btwo-phase commit\b/i,
  /\braft\b/i,
  /\bpaxos\b/i,
  /\bconsensus\b/i,
  /\breconciliation\b/i,
  /\bdiffing\b/i,
  /\bvirtual dom\b/i,
  /\bdebounce\b/i,
  /\bthrottle\b/i,
  /\bcomplexity\b/i,
  /\bbig-?o\b/i,
  /\bo\([n1klog\s\^]+\)/i,
  /\bsliding window\b/i,
  /\btwo pointers\b/i,
  /\bhash map\b/i,
  /\bbackpressure\b/i,
  /\bcircuit breaker\b/i,
  /\bconnection pool\b/i,
];

const BUZZWORDS = [
  /\bkafka\b/i,
  /\bkubernetes\b/i,
  /\bk8s\b/i,
  /\bmicroservices\b/i,
  /\bredis\b/i,
  /\belasticsearch\b/i,
  /\bgraphql\b/i,
  /\bdocker\b/i,
  /\bgrpc\b/i,
  /\bevent-?driven\b/i,
  /\bcqrs\b/i,
  /\bserverless\b/i,
];

const VAGUE_TERMS = [
  /\bstuff\b/i,
  /\bthings\b/i,
  /\bkinda\b/i,
  /\bsort of\b/i,
  /\bwhatever\b/i,
  /\betc\b/i,
  /\band so on\b/i,
  /\bmaybe\b/i,
  /\bsomehow\b/i,
];

const STRUCTURE_MARKERS = [
  /\bfirstly|first of all|secondly|thirdly\b/i,
  /\bstep [0-9]+\b/i,
  /\bon one hand\b/i,
  /\bin summary|to summarize|overall\b/i,
];

// ---------------------------------------------------------------------------
// Feedback Generator
// ---------------------------------------------------------------------------

interface FeedbackContext {
  questionPrompt: string;
  demonstratedPoints: readonly string[];
  partialPoints: readonly string[];
  gaps: readonly string[];
  unsubstantiatedBuzzwords: readonly RegExp[];
  correctness: number;
  reasoning: number;
  technical_depth: number;
  communication: number;
  expectedPointsCount: number;
  context: AnswerEvaluatorContext;
}

function buildFeedback(ctx: FeedbackContext): string {
  const sections: string[] = [];

  // Demonstrated Evidence
  if (ctx.demonstratedPoints.length > 0) {
    sections.push(
      `### Demonstrated Evidence\n` +
        ctx.demonstratedPoints.map((p) => `- Evidenced: ${p}`).join('\n'),
    );
  } else {
    sections.push(
      `### Demonstrated Evidence\n- No expected technical points were conclusively substantiated by the answer.`,
    );
  }

  // Omissions and Unshown Knowledge
  if (ctx.gaps.length > 0) {
    const gapList = ctx.gaps.map((g) => `- Missing/Unproven: ${g}`).join('\n');
    sections.push(
      `### Identified Knowledge Gaps (Strict Evaluation)\n${gapList}\n\n` +
        `*Rule Note: Pursuant to platform assessment standards, knowledge of unevidenced concepts cannot be assumed.*`,
    );
  }

  // Buzzword without mechanics note
  if (ctx.unsubstantiatedBuzzwords.length > 0) {
    const names = ctx.unsubstantiatedBuzzwords
      .map((re) => re.source.replace(/\\b/g, ''))
      .join(', ');
    sections.push(
      `### Buzzword Inflation Notice\n- Named technologies (${names}) without detailing concrete operational mechanics, trade-offs, or failure handling. Knowledge of internal implementation is not assumed without direct evidence.`,
    );
  }

  // Actionable Recommendation
  const recommendations: string[] = [];
  if (ctx.reasoning < 6.0) {
    recommendations.push(
      'Deepen reasoning by explicitly discussing trade-offs (e.g. latency vs consistency, memory overhead) and cause-and-effect ("because", "in order to").',
    );
  }
  if (ctx.technical_depth < 6.0) {
    recommendations.push(
      'Provide specific architectural mechanics (e.g. data structures, concurrency primitives, exact Big-O complexities) rather than high-level statements.',
    );
  }
  if (ctx.communication < 6.0) {
    recommendations.push(
      'Structure the answer with clear sections and avoid vague filler terminology ("stuff", "things", "etc.").',
    );
  }
  if (recommendations.length > 0) {
    sections.push(`### Actionable Guidance\n` + recommendations.map((r) => `- ${r}`).join('\n'));
  }

  return sections.join('\n\n');
}
