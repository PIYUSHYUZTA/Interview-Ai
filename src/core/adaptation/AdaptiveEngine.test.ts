import { describe, expect, it } from 'vitest';
import { AdaptiveEngine } from './AdaptiveEngine.js';
import { RollingSkillState } from '../assessment/SkillState.js';
import { backendRole } from '../../testSupport/fixtures.js';
import type { SkillState } from '../types.js';

function makeState(skillId: string, estimate: number, confidence: number, samples: number): SkillState {
  const s = new RollingSkillState().init(skillId);
  s.estimate = estimate;
  s.confidence = confidence;
  s.samples = samples;
  return s;
}

describe('ADAPT — adaptive topic selection', () => {
  it('prefers the highest-requirement skill when everything is unknown', () => {
    const engine = new AdaptiveEngine({ seed: 1 });
    const states = ['backend', 'databases', 'system_design', 'algorithms', 'security'].map((id) =>
      makeState(id, 5, 0, 0),
    );
    const pick = engine.selectNext(states, backendRole(), [], []);
    expect(pick.skillId).toBe('backend');
    expect(pick.difficulty).toBeGreaterThanOrEqual(1);
    expect(pick.difficulty).toBeLessThanOrEqual(5);
  });

  it('addresses low confidence first, not just the strongest skill', () => {
    const engine = new AdaptiveEngine({ seed: 2 });
    const states = [
      makeState('backend', 8, 0.9, 6), // established
      makeState('databases', 3, 0.1, 1), // weak + uncertain
    ];
    const pick = engine.selectNext(states, backendRole(), [], []);
    // information gain from uncertainty should outweigh the established shoo-in
    expect(['databases']).toContain(pick.skillId);
  });

  it('penalizes same-skill streaks to rotate topics', () => {
    const engine = new AdaptiveEngine({ seed: 2 });
    const states = [makeState('backend', 6, 0.5, 3), makeState('databases', 6, 0.5, 3)];
    const pick = engine.selectNext(states, backendRole(), ['backend', 'backend'], []);
    expect(pick.skillId).toBe('databases');
  });

  it('maps proficiency to rising difficulty', () => {
    const engine = new AdaptiveEngine({ seed: 0 });
    const beginner = makeState('algorithms', 2, 0.5, 2);
    const expert = makeState('algorithms', 9, 0.9, 8);
    const low = engine.adaptDifficulty(beginner);
    const high = engine.adaptDifficulty(expert);
    expect(low).toBeLessThanOrEqual(2);
    expect(high).toBeGreaterThanOrEqual(4);
  });

  describe('Service 4: Adaptive Engine (Decoupled Decision Maker Mandate)', () => {
    const engine = new AdaptiveEngine({ seed: 42 });
    const scopedRole = {
      title: 'Senior Backend Engineer',
      level: 'senior' as const,
      skills: [
        { skillId: 'backend', weight: 1.0, requiredLevel: 'senior' as const },
        { skillId: 'databases', weight: 0.8, requiredLevel: 'senior' as const },
        { skillId: 'system_design', weight: 0.7, requiredLevel: 'senior' as const },
      ],
    };

    it('generates JSON output matching the exact 4 required fields', () => {
      const decision = engine.decide({
        latest_evaluation: {
          correctness: 8.5,
          reasoning: 8.0,
          technical_depth: 8.5,
          communication: 8.0,
          confidence: 0.9,
          feedback: 'Strong understanding.',
          knowledge_gaps: [],
        },
        rolling_skill_state: [makeState('backend', 7.5, 0.5, 2)],
        current_difficulty: 6,
        full_history: [
          {
            question: { id: 'q1', skillId: 'backend', topic: 'backend', difficulty: 6 },
            evaluation: { correctness: 8.5 },
          },
        ],
        target_role: scopedRole,
      });

      // Verify exact 4 keys
      expect(decision).toHaveProperty('next_action');
      expect(decision).toHaveProperty('next_difficulty');
      expect(decision).toHaveProperty('next_topic');
      expect(decision).toHaveProperty('rationale');

      expect(typeof decision.next_action).toBe('string');
      expect(typeof decision.next_difficulty).toBe('number');
      expect(typeof decision.next_topic).toBe('string');
      expect(typeof decision.rationale).toBe('string');

      // Verify JSON serialization format
      const jsonStr = engine.toJSON(decision);
      const parsed = JSON.parse(jsonStr);
      expect(Object.keys(parsed)).toEqual([
        'next_action',
        'next_difficulty',
        'next_topic',
        'rationale',
      ]);
      expect(parsed.next_action).toBe(decision.next_action);
      expect(parsed.next_difficulty).toBe(decision.next_difficulty);
      expect(parsed.next_topic).toBe(decision.next_topic);
      expect(parsed.rationale).toBe(decision.rationale);
    });

    describe('Decision Policy: Score ≥80% → increase difficulty or go deeper on the same topic', () => {
      it('increases difficulty when score is ≥80%', () => {
        const decision = engine.decide({
          latest_evaluation: { correctness: 9.0 },
          rolling_skill_state: [],
          current_difficulty: 6,
          full_history: [],
          target_role: scopedRole,
          current_topic: 'backend',
        });

        expect(['increase_difficulty', 'deepen_topic']).toContain(decision.next_action);
        expect(decision.next_difficulty).toBe(7);
        expect(decision.next_topic).toBe('backend');
        expect(decision.rationale).toContain('≥80%');
      });

      it('goes deeper on same topic when difficulty is already at maximum (10)', () => {
        const decision = engine.decide({
          latest_evaluation: { correctness: 9.5 },
          rolling_skill_state: [],
          current_difficulty: 10,
          full_history: [],
          target_role: scopedRole,
          current_topic: 'backend',
        });

        expect(decision.next_action).toBe('deepen_topic');
        expect(decision.next_difficulty).toBe(10); // clamped at max
        expect(decision.next_topic).toBe('backend');
      });

      it('supports explicit deepen_topic action preference on high score', () => {
        const decision = engine.decide({
          latest_evaluation: { score: 85 }, // 85%
          rolling_skill_state: [],
          current_difficulty: 5,
          full_history: [],
          target_role: scopedRole,
          current_topic: 'databases',
          action_preference: 'deepen_topic',
        });

        expect(decision.next_action).toBe('deepen_topic');
        expect(decision.next_difficulty).toBe(6);
        expect(decision.next_topic).toBe('databases');
      });
    });

    describe('Decision Policy: Score 50–79% → hold difficulty, probe understanding', () => {
      it('holds difficulty and probes understanding when score is in 50–79% range', () => {
        const decision = engine.decide({
          latest_evaluation: { correctness: 6.5 }, // 65%
          rolling_skill_state: [],
          current_difficulty: 6,
          full_history: [],
          target_role: scopedRole,
          current_topic: 'backend',
        });

        expect(['hold_difficulty', 'probe_understanding']).toContain(decision.next_action);
        expect(decision.next_difficulty).toBe(6); // held constant
        expect(decision.next_topic).toBe('backend');
        expect(decision.rationale).toContain('50–79%');
      });
    });

    describe('Decision Policy: Score <50% → drop difficulty, test fundamentals', () => {
      it('drops difficulty to test fundamentals when score is <50%', () => {
        const decision = engine.decide({
          latest_evaluation: { correctness: 3.5 }, // 35%
          rolling_skill_state: [],
          current_difficulty: 6,
          full_history: [],
          target_role: scopedRole,
          current_topic: 'backend',
        });

        expect(['drop_difficulty', 'test_fundamentals']).toContain(decision.next_action);
        expect(decision.next_difficulty).toBe(5); // dropped from 6 to 5
        expect(decision.next_topic).toBe('backend');
        expect(decision.rationale).toContain('<50%');
      });

      it('clamps minimum difficulty to 1 when dropping from difficulty 1', () => {
        const decision = engine.decide({
          latest_evaluation: { correctness: 2.0 },
          rolling_skill_state: [],
          current_difficulty: 1,
          full_history: [],
          target_role: scopedRole,
          current_topic: 'backend',
        });

        expect(decision.next_action).toBe('test_fundamentals');
        expect(decision.next_difficulty).toBe(1); // cannot drop below 1
      });
    });

    describe('Hard Rule: One weak answer must never alone determine candidate level', () => {
      it('preserves senior/mid candidate level hypothesis despite a single weak answer (<50%)', () => {
        // Candidate demonstrated senior proficiency on Q1 and Q2
        const history = [
          {
            question: { id: 'q1', skillId: 'backend', topic: 'backend', difficulty: 7 },
            evaluation: { correctness: 9.0 }, // 90%
          },
          {
            question: { id: 'q2', skillId: 'backend', topic: 'backend', difficulty: 8 },
            evaluation: { correctness: 8.5 }, // 85%
          },
        ];

        // Q3 is an anomalous weak answer (<50%)
        const weakEvaluation = {
          correctness: 3.0, // 30%
          feedback: 'Lacked details on transaction isolation.',
          knowledge_gaps: ['phantom reads', 'serializable snapshot isolation'],
        };

        const decision = engine.decide({
          latest_evaluation: weakEvaluation,
          rolling_skill_state: [makeState('backend', 8.2, 0.6, 2)],
          current_difficulty: 8,
          full_history: history,
          target_role: scopedRole,
          current_topic: 'backend',
        });

        // 1. Next question probe reacts adaptively by dropping difficulty
        expect(decision.next_action).toBe('drop_difficulty');
        expect(decision.next_difficulty).toBe(7); // drops from 8 to 7

        // 2. HARD RULE INVARIANT: Rolling estimate across multiple data points is maintained!
        expect(decision.rollingSkillEstimate).toBeGreaterThanOrEqual(6.0);
        // Candidate level is NOT collapsed to junior based on this single weak probe!
        expect(['senior', 'mid']).toContain(decision.candidateLevelHypothesis);
        expect(decision.candidateLevelHypothesis).not.toBe('junior');

        // 3. Rationale explicitly articulates adherence to the Hard Rule
        expect(decision.rationale).toContain('HARD RULE');
        expect(decision.rationale).toContain('NOT determined by this single weak answer alone');

        // 4. Audit verification passes
        const audit = engine.audit([...history, { evaluation: weakEvaluation }], decision);
        expect(audit.passes).toBe(true);
      });

      it('requires an accumulated multi-sample stream of evidence to determine lower candidate level', () => {
        // Here candidate consistently demonstrates weak understanding across 4 samples
        const weakHistory = [
          { question: { id: 'q1', skillId: 'backend' }, evaluation: { correctness: 3.0 } },
          { question: { id: 'q2', skillId: 'backend' }, evaluation: { correctness: 2.5 } },
          { question: { id: 'q3', skillId: 'backend' }, evaluation: { correctness: 3.5 } },
        ];

        const fourthWeakEvaluation = { correctness: 2.0 };

        const decision = engine.decide({
          latest_evaluation: fourthWeakEvaluation,
          rolling_skill_state: [],
          current_difficulty: 3,
          full_history: weakHistory,
          target_role: scopedRole,
          current_topic: 'backend',
        });

        // Only after multiple accumulated weak data points does the rolling estimate settle to junior
        expect(decision.rollingSkillEstimate).toBeLessThan(4.5);
        expect(decision.candidateLevelHypothesis).toBe('junior');
      });

      it('does not permanently flag candidate on their very first question if weak', () => {
        const firstWeakEval = { correctness: 2.5 };
        const decision = engine.decide({
          latest_evaluation: firstWeakEval,
          rolling_skill_state: [],
          current_difficulty: 5,
          full_history: [],
          target_role: scopedRole,
          current_topic: 'backend',
        });

        // Adapts difficulty for probe 2
        expect(decision.next_action).toBe('drop_difficulty');
        expect(decision.next_difficulty).toBe(4);

        // Does not permanently declare junior from sample=1
        expect(decision.rationale).toContain('HARD RULE');
      });
    });

    describe('Topic rotation and streak balancing', () => {
      it('rotates to next role requirement after a topic streak of mastery', () => {
        const history = [
          { question: { id: 'q1', skillId: 'backend' }, evaluation: { correctness: 9.0 } },
          { question: { id: 'q2', skillId: 'backend' }, evaluation: { correctness: 9.5 } },
        ];

        const decision = engine.decide({
          latest_evaluation: { correctness: 9.0 },
          rolling_skill_state: [],
          current_difficulty: 7,
          full_history: history,
          target_role: scopedRole,
          current_topic: 'backend',
        });

        expect(decision.next_action).toBe('increase_difficulty');
        expect(decision.next_difficulty).toBe(8);
        // Rotates to next priority skill from role (databases or system_design)
        expect(['databases', 'system_design']).toContain(decision.next_topic);
      });
    });

    describe('Task 3: The Single Most Important Test — Adaptive Brain Proof', () => {
      it('demonstrates dynamic adaptation by feeding identical context with Strong, Moderate, and Weak evaluations', () => {
        const baseContext = {
          current_difficulty: 6,
          current_topic: 'databases',
          target_role: scopedRole,
          rolling_skill_state: [makeState('databases', 6.0, 0.4, 2)],
          full_history: [
            {
              question: {
                id: 'q1',
                skillId: 'databases',
                topic: 'databases',
                difficulty: 6,
                prompt: 'Explain Postgres indexing for high-write workloads.',
              },
              answer: { text: 'Candidate baseline response' },
            },
          ],
        };

        // 1. Strong Evaluation: score = 9.0 (90% >= 80%)
        const strongEval = {
          correctness: 9.0,
          reasoning: 9.0,
          technical_depth: 9.0,
          communication: 8.5,
          confidence: 0.95,
          feedback: 'Excellent breakdown of BRIN, partial indexes, and fillfactor tuning.',
          knowledge_gaps: [],
        };

        // 2. Moderate Evaluation: score = 6.5 (65% in 50–79%)
        const moderateEval = {
          correctness: 6.5,
          reasoning: 6.5,
          technical_depth: 6.0,
          communication: 7.0,
          confidence: 0.70,
          feedback: 'Understands basic B-Tree overhead but omitted HOT (Heap-Only Tuples) updates.',
          knowledge_gaps: ['HOT updates', 'fillfactor tuning'],
        };

        // 3. Weak Evaluation: score = 3.5 (35% < 50%)
        const weakEval = {
          correctness: 3.5,
          reasoning: 3.0,
          technical_depth: 3.0,
          communication: 6.0,
          confidence: 0.80,
          feedback: 'Confused clustered indexes with secondary indexes; missed write amplification.',
          knowledge_gaps: ['WAL overhead', 'B-Tree page splits', 'write amplification'],
        };

        // Feed the identical context to AdaptiveEngine 3 times
        const decisionStrong = engine.decide({ ...baseContext, latest_evaluation: strongEval });
        const decisionModerate = engine.decide({ ...baseContext, latest_evaluation: moderateEval });
        const decisionWeak = engine.decide({ ...baseContext, latest_evaluation: weakEval });

        // Format and print the side-by-side comparison table
        const comparisonTable = [
          {
            Case: 'STRONG (Score: 90%)',
            InputScore: '9.0 / 10',
            InitialDiff: 6,
            NextDifficulty: decisionStrong.next_difficulty,
            NextAction: decisionStrong.next_action,
            PolicyBranch: 'Score >= 80% -> Escalate / Deepen',
          },
          {
            Case: 'MODERATE (Score: 65%)',
            InputScore: '6.5 / 10',
            InitialDiff: 6,
            NextDifficulty: decisionModerate.next_difficulty,
            NextAction: decisionModerate.next_action,
            PolicyBranch: 'Score 50-79% -> Hold & Probe',
          },
          {
            Case: 'WEAK (Score: 35%)',
            InputScore: '3.5 / 10',
            InitialDiff: 6,
            NextDifficulty: decisionWeak.next_difficulty,
            NextAction: decisionWeak.next_action,
            PolicyBranch: 'Score < 50% -> Drop & Fundamentals',
          },
        ];

        console.log('\n================================================================================');
        console.log('      ADAPTIVE BRAIN PROOF: IDENTICAL CONTEXT ACROSS 3 EVALUATOR OUTPUTS       ');
        console.log('================================================================================');
        console.table(comparisonTable);
        console.log('\n--- Rationale Outputs ---');
        console.log(`[STRONG]:   ${decisionStrong.rationale}`);
        console.log(`[MODERATE]: ${decisionModerate.rationale}`);
        console.log(`[WEAK]:     ${decisionWeak.rationale}`);
        console.log('================================================================================\n');

        // Assert that next_difficulty and next_action are meaningfully different across the 3 cases
        // 1. Difficulty strictly mirrors adaptive policy: strong (7) > moderate (6) > weak (5)
        expect(decisionStrong.next_difficulty).toBe(7); // escalated 6 -> 7
        expect(decisionModerate.next_difficulty).toBe(6); // held at 6
        expect(decisionWeak.next_difficulty).toBe(5); // dropped 6 -> 5

        expect(decisionStrong.next_difficulty).toBeGreaterThan(decisionModerate.next_difficulty);
        expect(decisionModerate.next_difficulty).toBeGreaterThan(decisionWeak.next_difficulty);

        // 2. Action strictly mirrors adaptive policy
        expect(['increase_difficulty', 'deepen_topic']).toContain(decisionStrong.next_action);
        expect(['hold_difficulty', 'probe_understanding']).toContain(decisionModerate.next_action);
        expect(['drop_difficulty', 'test_fundamentals']).toContain(decisionWeak.next_action);

        expect(decisionStrong.next_action).not.toBe(decisionModerate.next_action);
        expect(decisionModerate.next_action).not.toBe(decisionWeak.next_action);
        expect(decisionStrong.next_action).not.toBe(decisionWeak.next_action);
      });
    });
  });
});