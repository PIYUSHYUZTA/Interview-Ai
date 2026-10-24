import type { RubricCriteria } from '../types.js';
import type { LLMProvider, ProviderOptions, ScoredResponse, StructuredTask } from './LLMProvider.js';
import type { AIProvider, AIProviderOptions } from './AIProvider.js';

/**
 * Delimiters shared between the narrative evaluator (prompt builder) and this
 * deterministic provider so both agree on how the answer is carried.
 */
export const ANSWER_MARKER = '<<<ANSWER>>>';
export const ANSWER_END_MARKER = '<<<END_ANSWER>>>';

/**
 * A fully local, injected "LLM" for development and deterministic testing.
 * Implements both the Section 20 unified AIProvider interface and LLMProvider.
 *
 * It evaluates narrative answers with transparent, linguistic heuristics:
 *  - rubricCompliance: whether scoring cues (rubric hints) were actually covered.
 *  - knowledgeDepth: coverage + length of elaborated, topical language.
 *  - recallPrecision: ratio of specific/technical to vague filler words.
 *  - reasoning: presence of connective argument structure / trade-offs.
 *  - appliedEvidence: evidence of hands-on practice (verbs, numbers, tools).
 *  - communication: structure markers (sections, examples, signposting).
 *
 * Use it to run the full intelligence loop offline, or swap in a real provider.
 */
export class DeterministicProvider implements LLMProvider, AIProvider {
  readonly name = 'deterministic';

  async complete(prompt: string, _options?: ProviderOptions): Promise<string> {
    return prompt;
  }

  async completeStructured<T>(
    task: StructuredTask,
    prompt: string,
    _options?: ProviderOptions,
  ): Promise<T | null> {
    switch (task) {
      case 'score_open_response':
      case 'evaluate_narrative':
        return this.scoreOpenResponse(prompt) as unknown as T;
      case 'extract_resume_claims':
        return null; // extraction is handled deterministically by the parser layer
      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Section 20 Unified AIProvider Implementation
  // ---------------------------------------------------------------------------

  async generate(prompt: string, _options?: AIProviderOptions): Promise<string> {
    return this.complete(prompt);
  }

  async evaluate(prompt: string, _options?: AIProviderOptions): Promise<string> {
    const scored = this.scoreOpenResponse(prompt);
    return JSON.stringify({
      correctness: scored.rubricCompliance * 10,
      reasoning: scored.criteria.reasoning * 10,
      technical_depth: scored.criteria.knowledgeDepth * 10,
      communication: scored.criteria.communication * 10,
      confidence: 0.85,
      feedback: scored.rationale,
      knowledge_gaps: [],
    });
  }

  async extract(prompt: string, _options?: AIProviderOptions): Promise<string> {
    return this.complete(prompt);
  }

  /** Deterministic scoring of a narrative answer (see class docs for heuristics). */
  scoreOpenResponse(prompt: string): ScoredResponse {
    const answer = extractText(prompt, ANSWER_MARKER, ANSWER_END_MARKER);
    const questionBlock = extractText(prompt, '<<<QUESTION>>>', '<<<END_QUESTION>>>');
    const skillLabel = extractText(prompt, 'SKILL:', 'DIFFICULTY:');
    const hintsRaw = extractText(prompt, 'RUBRIC_HINTS:', 'END_RUBRIC_HINTS');
    const hints = hintsRaw
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean);

    const words = splitWords(answer);
    const length = words.length;
    const normAnswer = normalize(answer);
    const hitCount = hints.filter((h) => h && normAnswer.includes(normalize(h))).length;

    const specificRatio = countRatio(words, SPECIFIC_TERMS, VAGUE_TERMS);
    const reasoned = markerScore(normAnswer, REASONING_MARKERS);
    const applied = markerScore(normAnswer, APPLIED_MARKERS);
    const structured = markerScore(normAnswer, STRUCTURE_MARKERS) + (hasSections(answer) ? 0.5 : 0);

    const rubricCompliance = clamp01(hints.length === 0 ? 0.5 : hitCount / hints.length);

    const knowledgeDepth = clamp10(Math.min(9, 1.5 + length / 60 + rubricCompliance * 6 + specificRatio * 2));
    const recallPrecision = clamp10(1 + specificRatio * 9);
    const reasoning = clamp10(1 + reasoned * 8 + (hasTradeoff(answer) ? 1.6 : 0));
    const appliedEvidence = clamp10(0.8 + applied * 9 + numberTokens(answer) * 0.6 + toolTokens(answer) * 0.4);
    const communication = clamp10(1 + structured * 7 + Math.min(1.5, length / 120));

    const criteria: RubricCriteria = {
      knowledgeDepth: round1(knowledgeDepth),
      recallPrecision: round1(recallPrecision),
      reasoning: round1(reasoning),
      appliedEvidence: round1(appliedEvidence),
      communication: round1(communication),
    };

    const missingHints = hints.filter((hint) => hint && !normAnswer.includes(normalize(hint)));
    const rationale =
      `Deterministic heuristic: ${hitCount}/${hints.length} rubric cues addressed ` +
      `(${Math.round(rubricCompliance * 100)}% compliance); ${length} words; ` +
      `depth ${Math.round(knowledgeDepth)}, precision ${Math.round(recallPrecision)}, ` +
      `reasoning ${Math.round(reasoning)}, applied ${Math.round(appliedEvidence)}, ` +
      `communication ${Math.round(communication)}. ` +
      `${missingHints.length > 0 ? `Unaddressed rubric cues: ${missingHints.join('; ')}. ` : ''}` +
      `Skill: ${skillLabel || 'unknown'}. Question: ${questionBlock.slice(0, 80)}`;

    return { criteria, rubricCompliance: round1(rubricCompliance), rationale };
  }
}

// ---------------------------------------------------------------------------
// Lexical heuristics
// ---------------------------------------------------------------------------

const SPECIFIC_TERMS = [
  /specific/i, /exactly/i, /particularly/i, /index/i, /latency/i, /throughput/i,
  /consisten[ct]y/i, /coupling/i, /trade-?off/i, /complexity/i, /big-?o/i, /normaliz/i,
  /transaction/i, /shard/i, /partition/i, /cache/i, /deadlock/i, /idempoten/i,
];

const VAGUE_TERMS = [
  /stuff/i, /things/i, /kinda/i, /sort of/i, /etc/i, /so on/i, /whatever/i, /and then/i,
];

const REASONING_MARKERS = [
  /because/i, /therefore/i, /hence/i, /consequently/i, /\bif .+ then\b/i, /so that/i,
  /whereas/i, /however/i, /to handle/i, /in order to/i,
];

const APPLIED_MARKERS = [
  /i (built|designed|led|shipped|developed|owned|scaled|architected)/i,
  /we (built|shipped|deployed|rolled out)/i,
  /in production/i, /go-?live/i, /our (service|api|system|platform)/i, /my team/i,
];

const STRUCTURE_MARKERS = [
  /firstly|first of all|secondly/i, /one (approach|option)|another (approach|option)/i,
  /on the other hand/i, /in summary|to summarize|overall/i,
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function splitWords(s: string): string[] {
  return normalize(s)
    .split(/\s+/)
    .filter(Boolean);
}

/** Ratio of specific-looking to vague words; neutral if neither present. */
function countRatio(words: string[], positive: RegExp[], negative: RegExp[]): number {
  if (words.length === 0) return 0;
  const pos = words.reduce((n, w) => n + (positive.some((re) => re.test(w)) ? 1 : 0), 0);
  const neg = words.reduce((n, w) => n + (negative.some((re) => re.test(w)) ? 1 : 0), 0);
  if (pos + neg === 0) return 0.5;
  return pos / (pos + neg);
}

/** Fraction of markers tripped across the normalized text (scaled to ~0..1). */
function markerScore(text: string, markers: RegExp[]): number {
  if (text.length === 0) return 0;
  const tripped = markers.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
  return Math.min(1, tripped / 2);
}

function hasTradeoff(s: string): boolean {
  return /trade-?off|pros and cons|limitation|downside|cost/i.test(s);
}

function hasSections(s: string): boolean {
  return /(\n[-*] |\n\d+\. |\n#{1,3} )/.test(s) || /(first|second|third|finally)[,;]/.test(s);
}

function numberTokens(s: string): number {
  return (s.match(/\d{2,}(?:\.\d+)?%?|\b\d+x\b|\b\d+[ms]s?\b/g) ?? []).length;
}

function toolTokens(s: string): number {
  const tools = /(react|vue|angular|node|kubernetes|docker|postgres|mysql|redis|aws|gcp|azure|kafka|spark|terraform|graphql|k8s|s3|dynamodb|go|python|typescript|java|c\+\+|rust)/gi;
  return s.match(tools)?.length ?? 0;
}

function extractText(haystack: string, start: string, end: string): string {
  const s = haystack.indexOf(start);
  if (s < 0) return '';
  const from = s + start.length;
  const e = haystack.indexOf(end, from);
  if (e < 0) return haystack.slice(from);
  return haystack.slice(from, e).trim();
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function clamp10(v: number): number {
  return Math.min(10, Math.max(0, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
