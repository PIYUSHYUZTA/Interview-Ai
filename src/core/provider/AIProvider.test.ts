import { describe, expect, it, vi } from 'vitest';
import type { AIProvider, AIProviderOptions } from './AIProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { AnthropicProvider } from './providers/AnthropicProvider.js';
import { DeterministicProvider } from './DeterministicProvider.js';
import { ResumeAnalyzer } from '../understanding/ResumeAnalyzer.js';
import { QuestionGenerator } from '../adaptation/QuestionGenerator.js';
import { AnswerEvaluator } from '../assessment/evaluators/AnswerEvaluator.js';
import { buildProfile, backendRole, STRONG_RESUME } from '../../testSupport/fixtures.js';

describe('Section 20: AI Provider Abstraction (generate, evaluate, extract)', () => {
  it('verifies that concrete providers implement the unified AIProvider interface', () => {
    const openai = new OpenAIProvider({ apiKey: 'test-key-openai', model: 'gpt-4o' });
    const anthropic = new AnthropicProvider({ apiKey: 'test-key-anthropic', model: 'claude-3-5-sonnet-latest' });
    const deterministic = new DeterministicProvider();

    // Check interface compliance
    for (const provider of [openai, anthropic, deterministic]) {
      expect(typeof provider.name).toBe('string');
      expect(typeof provider.generate).toBe('function');
      expect(typeof provider.evaluate).toBe('function');
      expect(typeof provider.extract).toBe('function');
    }

    expect(openai.name).toBe('openai');
    expect(anthropic.name).toBe('anthropic');
    expect(deterministic.name).toBe('deterministic');
  });

  it('QuestionGenerator calls through AIProvider.generate()', async () => {
    const generateSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        question: 'Explain Postgres MVCC and write skew under snapshot isolation.',
        topic: 'Databases',
        subtopic: 'Transaction Isolation',
        difficulty: 8,
        question_type: 'conceptual',
        target_skill: 'databases',
        expected_answer_points: [
          'Multi-version concurrency control mechanism',
          'Snapshot isolation transaction visibility',
          'Write skew anomaly scenario and serializable isolation',
        ],
      }),
    );

    const mockProvider: AIProvider = {
      name: 'mock-llm',
      generate: generateSpy,
      evaluate: vi.fn(),
      extract: vi.fn(),
    };

    const qgen = new QuestionGenerator({ provider: mockProvider });
    expect(qgen.aiProvider).toBe(mockProvider);

    const result = await qgen.generateQuestionAsync({
      candidateProfile: buildProfile(STRONG_RESUME),
      roleRequirements: backendRole(),
      round: 1,
      rollingSkillState: [],
      questionHistory: [],
    });

    expect(generateSpy).toHaveBeenCalledOnce();
    expect(result.question).toContain('Explain Postgres MVCC');
    expect(result.target_skill).toBe('databases');
    expect(result.expected_answer_points).toHaveLength(3);
  });

  it('AnswerEvaluator calls through AIProvider.evaluate()', async () => {
    const evaluateSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        correctness: 8.5,
        reasoning: 8.0,
        technical_depth: 9.0,
        communication: 8.5,
        confidence: 0.9,
        feedback: 'Precise explanation of lock-free indexing and memory barriers.',
        knowledge_gaps: [],
      }),
    );

    const mockProvider: AIProvider = {
      name: 'mock-llm',
      generate: vi.fn(),
      evaluate: evaluateSpy,
      extract: vi.fn(),
    };

    const evaluator = new AnswerEvaluator({ provider: mockProvider });
    expect(evaluator.aiProvider).toBe(mockProvider);

    const output = await evaluator.evaluate({
      question: 'How do lock-free queues operate in memory?',
      expected_answer_points: ['Atomic CAS instructions', 'Memory barriers', 'ABA problem prevention'],
      candidate_answer: 'Lock-free queues use compare-and-swap (CAS) primitives and hazard pointers to avoid ABA issues.',
    });

    expect(evaluateSpy).toHaveBeenCalledOnce();
    expect(output.correctness).toBe(8.5);
    expect(output.reasoning).toBe(8.0);
    expect(output.technical_depth).toBe(9.0);
    expect(output.communication).toBe(8.5);
    expect(output.confidence).toBe(0.9);
  });

  it('ResumeAnalyzer calls through AIProvider.extract()', async () => {
    const extractSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        education: [{ institution: 'Stanford', degree: 'B.S. CS', graduationYear: 2020 }],
        skills: [{ skillId: 'backend', claim: 'Node.js, Go' }, { skillId: 'databases', claim: 'PostgreSQL' }],
        experience: [{ company: 'Stripe', role: 'Staff Engineer', startYear: 2020, endYear: 2024, bullets: [] }],
        projects: ['High-throughput ledger'],
        certifications: ['AWS Certified Architect'],
        candidate_level_hypothesis: {
          band: 'senior',
          basis: 'Staff engineer role and 4 years of Tier-1 backend platform development.',
          status: 'hypothesis',
          evidenceOverride: false,
        },
      }),
    );

    const mockProvider: AIProvider = {
      name: 'mock-llm',
      generate: vi.fn(),
      evaluate: vi.fn(),
      extract: extractSpy,
    };

    const analyzer = new ResumeAnalyzer({ provider: mockProvider });
    expect(analyzer.aiProvider).toBe(mockProvider);

    const output = await analyzer.analyzeAsync('Senior Staff Engineer with 4 years experience at Stripe.');

    expect(extractSpy).toHaveBeenCalledOnce();
    expect(output.skills).toHaveLength(2);
    expect(output.experience).toHaveLength(1);
    expect(output.candidate_level_hypothesis.band).toBe('senior');
  });

  it('PROVES SWAPPING PROVIDERS: swapping from OpenAI to Claude requires ZERO changes to business logic', async () => {
    // 1. Setup mock OpenAI provider
    const openAIGenerateSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        question: 'OpenAI-generated question on distributed consensus',
        topic: 'Backend',
        subtopic: 'Raft',
        difficulty: 8,
        question_type: 'system_design',
        target_skill: 'backend',
        expected_answer_points: ['Leader election', 'Log replication', 'Heartbeat timers'],
      }),
    );
    const openAIEvaluateSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        correctness: 9.0,
        reasoning: 8.5,
        technical_depth: 9.0,
        communication: 8.5,
        confidence: 0.95,
        feedback: 'Solid answer from OpenAI provider.',
        knowledge_gaps: [],
      }),
    );
    const openAIExtractSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        education: [],
        skills: [{ skillId: 'backend', claim: 'Go' }],
        experience: [],
        projects: [],
        certifications: [],
        candidate_level_hypothesis: { band: 'mid', basis: 'OpenAI extracted', status: 'hypothesis', evidenceOverride: false },
      }),
    );

    const openAI: AIProvider = {
      name: 'openai',
      generate: openAIGenerateSpy,
      evaluate: openAIEvaluateSpy,
      extract: openAIExtractSpy,
    };

    // 2. Setup mock Claude/Anthropic provider
    const claudeGenerateSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        question: 'Claude-generated question on distributed consensus',
        topic: 'Backend',
        subtopic: 'Paxos vs Raft',
        difficulty: 9,
        question_type: 'system_design',
        target_skill: 'backend',
        expected_answer_points: ['Multi-decree Paxos', 'Raft term safety'],
      }),
    );
    const claudeEvaluateSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        correctness: 9.5,
        reasoning: 9.0,
        technical_depth: 9.5,
        communication: 9.0,
        confidence: 0.98,
        feedback: 'In-depth answer from Claude provider.',
        knowledge_gaps: [],
      }),
    );
    const claudeExtractSpy = vi.fn().mockResolvedValue(
      JSON.stringify({
        education: [],
        skills: [{ skillId: 'backend', claim: 'Go' }, { skillId: 'distributed_systems', claim: 'Raft' }],
        experience: [],
        projects: [],
        certifications: [],
        candidate_level_hypothesis: { band: 'senior', basis: 'Claude extracted', status: 'hypothesis', evidenceOverride: false },
      }),
    );

    const claude: AIProvider = {
      name: 'anthropic',
      generate: claudeGenerateSpy,
      evaluate: claudeEvaluateSpy,
      extract: claudeExtractSpy,
    };

    // 3. Instantiate services with OpenAI
    let qgen = new QuestionGenerator({ provider: openAI });
    let evaluator = new AnswerEvaluator({ provider: openAI });
    let analyzer = new ResumeAnalyzer({ provider: openAI });

    const q1 = await qgen.generateQuestionAsync({
      candidateProfile: buildProfile(STRONG_RESUME),
      roleRequirements: backendRole(),
      round: 1,
    });
    const e1 = await evaluator.evaluate({
      question: q1.question,
      expected_answer_points: q1.expected_answer_points,
      candidate_answer: 'We use Raft leader leases.',
    });
    const r1 = await analyzer.analyzeAsync('Go engineer specializing in distributed systems');

    expect(openAIGenerateSpy).toHaveBeenCalledOnce();
    expect(openAIEvaluateSpy).toHaveBeenCalledOnce();
    expect(openAIExtractSpy).toHaveBeenCalledOnce();
    expect(q1.question).toContain('OpenAI-generated');
    expect(e1.correctness).toBe(9.0);
    expect(r1.candidate_level_hypothesis.band).toBe('mid');

    // 4. SWAP TO CLAUDE: Only the dependency injection parameter changes.
    // Zero modifications to QuestionGenerator, AnswerEvaluator, or ResumeAnalyzer!
    qgen = new QuestionGenerator({ provider: claude });
    evaluator = new AnswerEvaluator({ provider: claude });
    analyzer = new ResumeAnalyzer({ provider: claude });

    const q2 = await qgen.generateQuestionAsync({
      candidateProfile: buildProfile(STRONG_RESUME),
      roleRequirements: backendRole(),
      round: 1,
    });
    const e2 = await evaluator.evaluate({
      question: q2.question,
      expected_answer_points: q2.expected_answer_points,
      candidate_answer: 'We use Multi-decree Paxos with pre-vote.',
    });
    const r2 = await analyzer.analyzeAsync('Go engineer specializing in distributed systems');

    expect(claudeGenerateSpy).toHaveBeenCalledOnce();
    expect(claudeEvaluateSpy).toHaveBeenCalledOnce();
    expect(claudeExtractSpy).toHaveBeenCalledOnce();
    expect(q2.question).toContain('Claude-generated');
    expect(e2.correctness).toBe(9.5);
    expect(r2.candidate_level_hypothesis.band).toBe('senior');
  });
});
