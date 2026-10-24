import { describe, expect, it } from 'vitest';
import {
  AnswerEvaluator,
  type AnswerEvaluatorInput,
  type AnswerEvaluatorOutput,
} from './AnswerEvaluator.js';

describe('Service 3: Answer Evaluator', () => {
  const evaluator = new AnswerEvaluator();

  const sampleQuestion = {
    id: 'q-react-vdom',
    prompt: 'Explain how the Virtual DOM in React works, how reconciliation functions, and what performance trade-offs it introduces.',
    skillId: 'frontend',
    difficulty: 6,
    type: 'conceptual' as const,
  };

  const expectedPoints = [
    'Diffing algorithm compares new virtual tree against previous in-memory tree',
    'Heuristic O(n) tree reconciliation using keys and element types',
    'Batching DOM updates into a single layout pass to prevent layout thrashing',
    'Memory overhead of retaining dual in-memory virtual trees vs direct DOM manipulation',
  ];

  it('generates JSON output matching the exact 7 required fields', () => {
    const input: AnswerEvaluatorInput = {
      question: sampleQuestion,
      expected_answer_points: expectedPoints,
      candidate_answer: `The Virtual DOM is an in-memory representation of the real DOM tree. 
When state changes, React creates a new virtual tree and runs a diffing algorithm (reconciliation) against the previous tree. 
Instead of an expensive O(n^3) tree comparison, React uses an O(n) heuristic assuming elements of different types generate different trees and unique keys identify stable list children.
Because direct DOM manipulation causes layout thrashing, React batches mutations into a single operation, improving frame rates.
However, the trade-off is memory overhead: maintaining dual virtual trees in memory consumes heap, and for simple apps direct DOM updates are actually faster.`,
      context: {
        target_skill: 'frontend',
        difficulty: 6,
        question_type: 'conceptual',
        candidate_level: 'senior',
      },
    };

    const output: AnswerEvaluatorOutput = evaluator.evaluateSync(input);

    // Verify exact required fields
    expect(output).toHaveProperty('correctness');
    expect(output).toHaveProperty('reasoning');
    expect(output).toHaveProperty('technical_depth');
    expect(output).toHaveProperty('communication');
    expect(output).toHaveProperty('confidence');
    expect(output).toHaveProperty('feedback');
    expect(output).toHaveProperty('knowledge_gaps');

    // Verify ranges
    expect(output.correctness).toBeGreaterThanOrEqual(0);
    expect(output.correctness).toBeLessThanOrEqual(10);
    expect(output.reasoning).toBeGreaterThanOrEqual(0);
    expect(output.reasoning).toBeLessThanOrEqual(10);
    expect(output.technical_depth).toBeGreaterThanOrEqual(0);
    expect(output.technical_depth).toBeLessThanOrEqual(10);
    expect(output.communication).toBeGreaterThanOrEqual(0);
    expect(output.communication).toBeLessThanOrEqual(10);
    expect(output.confidence).toBeGreaterThanOrEqual(0);
    expect(output.confidence).toBeLessThanOrEqual(1);
    expect(typeof output.feedback).toBe('string');
    expect(Array.isArray(output.knowledge_gaps)).toBe(true);

    // Verify JSON serialization format
    const jsonStr = evaluator.toJSON(output);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.correctness).toBe(output.correctness);
    expect(parsed.reasoning).toBe(output.reasoning);
    expect(parsed.technical_depth).toBe(output.technical_depth);
    expect(parsed.communication).toBe(output.communication);
    expect(parsed.confidence).toBe(output.confidence);
    expect(parsed.feedback).toBe(output.feedback);
    expect(parsed.knowledge_gaps).toEqual(output.knowledge_gaps);
  });

  describe('Rule: Evaluate only evidence present in the answer; never assume unshown knowledge', () => {
    it('scores a strong, evidence-backed answer highly and confirms zero gaps', () => {
      const strongAnswer = `
The Virtual DOM is an in-memory lightweight copy of the real DOM.
1. Reconciliation & Diffing: React uses a heuristic O(n) diffing algorithm to compare the new virtual tree with the previous one. Elements with different types produce completely new subtrees, while stable 'key' props allow React to track items across re-orders without unneeded unmounting.
2. Batching: By accumulating virtual changes, React computes the minimal set of DOM patches and flushes them in a single batch, preventing expensive layout thrashing and reflows.
3. Trade-offs: The primary trade-off is memory overhead because maintaining two in-memory virtual trees increases garbage collection pressure and RAM usage. Additionally, for highly static interfaces, direct vanilla DOM manipulation has lower compute overhead than running the diffing cycle.
`;
      const output = evaluator.evaluateSync({
        question: sampleQuestion,
        expected_answer_points: expectedPoints,
        candidate_answer: strongAnswer,
      });

      expect(output.correctness).toBeGreaterThanOrEqual(8.0);
      expect(output.technical_depth).toBeGreaterThanOrEqual(7.5);
      expect(output.reasoning).toBeGreaterThanOrEqual(7.0);
      expect(output.confidence).toBeGreaterThanOrEqual(0.80);
      expect(output.knowledge_gaps.length).toBe(0);

      const audit = evaluator.audit(strongAnswer, output, expectedPoints);
      expect(audit.passes).toBe(true);
    });

    it('does NOT assume unshown knowledge when candidate gives a vague, hand-waving answer', () => {
      const vagueAnswer = 'I would probably just use React virtual DOM because it is fast and handles things for you and stuff.';
      const output = evaluator.evaluateSync({
        question: sampleQuestion,
        expected_answer_points: expectedPoints,
        candidate_answer: vagueAnswer,
      });

      // Strict anti-assumption checks:
      // Even though candidate mentioned "virtual DOM" and "fast", they provided NO mechanics or trade-offs.
      expect(output.technical_depth).toBeLessThanOrEqual(3.5);
      expect(output.reasoning).toBeLessThanOrEqual(3.5);
      expect(output.correctness).toBeLessThan(5.0);

      // All unevidenced points must be recorded in knowledge_gaps
      expect(output.knowledge_gaps.length).toBeGreaterThanOrEqual(3);
      expect(output.knowledge_gaps).toContain(expectedPoints[1]); // heuristic O(n) diffing was never explained
      expect(output.knowledge_gaps).toContain(expectedPoints[3]); // memory overhead was never mentioned

      // Feedback must explicitly note that unevidenced knowledge cannot be assumed
      expect(output.feedback).toContain('knowledge of unevidenced concepts cannot be assumed');

      const audit = evaluator.audit(vagueAnswer, output, expectedPoints);
      expect(audit.passes).toBe(true);
    });

    it('penalizes buzzword dumping and refuses to credit unproven internal knowledge', () => {
      const buzzwordAnswer = 'In our architecture we use Kafka, Kubernetes, Redis, Microservices, GraphQL, Docker, and Elasticsearch for speed.';
      const output = evaluator.evaluateSync({
        question: 'How do you design a reliable event processing pipeline?',
        expected_answer_points: [
          'Partitioning strategy and consumer group offset management',
          'Idempotent producer and consumer deduplication logic',
          'Dead letter queues for poison pill handling',
          'Backpressure and consumer lag monitoring',
        ],
        candidate_answer: buzzwordAnswer,
      });

      // Because candidate dumped names without mechanics:
      expect(output.technical_depth).toBeLessThanOrEqual(3.5);
      expect(output.reasoning).toBeLessThanOrEqual(2.5);
      expect(output.correctness).toBeLessThan(3.0);

      // Feedback warns about buzzword inflation
      expect(output.feedback).toContain('Buzzword Inflation Notice');

      const audit = evaluator.audit(
        buzzwordAnswer,
        output,
        [
          'Partitioning strategy and consumer group offset management',
          'Idempotent producer and consumer deduplication logic',
          'Dead letter queues for poison pill handling',
          'Backpressure and consumer lag monitoring',
        ],
      );
      expect(audit.passes).toBe(true);
    });

    it('handles explicit refusal or "I don\'t know" by assuming zero knowledge with high confidence', () => {
      const output = evaluator.evaluateSync({
        question: sampleQuestion,
        expected_answer_points: expectedPoints,
        candidate_answer: "I don't know the internal details of this.",
      });

      expect(output.correctness).toBe(0);
      expect(output.reasoning).toBe(0);
      expect(output.technical_depth).toBe(0);
      expect(output.knowledge_gaps.length).toBe(expectedPoints.length);
      expect(output.confidence).toBe(0.95);
      expect(output.feedback).toContain('no unshown knowledge is assumed');
    });

    it('handles completely blank or empty answers without assuming knowledge', () => {
      const output = evaluator.evaluateSync({
        question: sampleQuestion,
        expected_answer_points: expectedPoints,
        candidate_answer: '   ',
      });

      expect(output.correctness).toBe(0);
      expect(output.reasoning).toBe(0);
      expect(output.technical_depth).toBe(0);
      expect(output.communication).toBe(0);
      expect(output.confidence).toBe(0.95);
      expect(output.knowledge_gaps).toEqual(expectedPoints);
      expect(output.feedback).toContain('No answer provided');
    });

    it('accurately isolates partial knowledge and flags remaining points as gaps', () => {
      // Candidate explains diffing and batching, but omits O(n) heuristics and memory overhead
      const partialAnswer = `
The virtual DOM works by maintaining a tree in memory. When changes occur, a diffing algorithm determines what changed.
React then batches DOM updates together to avoid layout thrashing and updates the UI.
`;
      const output = evaluator.evaluateSync({
        question: sampleQuestion,
        expected_answer_points: expectedPoints,
        candidate_answer: partialAnswer,
      });

      // Partial correctness: roughly half
      expect(output.correctness).toBeGreaterThanOrEqual(3.5);
      expect(output.correctness).toBeLessThan(7.5);

      // Gaps must include the unevidenced points
      expect(output.knowledge_gaps).toContain(expectedPoints[3]); // Memory overhead omitted
      expect(output.feedback).toContain('Identified Knowledge Gaps');
    });

    it('evaluates code answers with concrete implementation evidence', () => {
      const codeAnswer = `
function maxSlidingWindow(nums, k) {
  if (!nums.length || k <= 0) return [];
  const result = [];
  const deque = []; // stores indices
  
  for (let i = 0; i < nums.length; i++) {
    // Remove indices outside current window [i - k + 1, i]
    while (deque.length && deque[0] < i - k + 1) {
      deque.shift();
    }
    // Maintain monotonic decreasing order in deque
    while (deque.length && nums[deque[deque.length - 1]] < nums[i]) {
      deque.pop();
    }
    deque.push(i);
    // Record window max once window reaches size k
    if (i >= k - 1) {
      result.push(nums[deque[0]]);
    }
  }
  return result;
}
// Time complexity: O(n) amortized because each element is pushed/popped at most once.
// Space complexity: O(k) for the monotonic deque.
`;
      const output = evaluator.evaluateSync({
        question: 'Implement sliding window maximum in O(n) time complexity.',
        expected_answer_points: [
          'Monotonic deque maintaining decreasing order of element indices',
          'Amortized O(n) time complexity with each element inserted and removed at most once',
          'O(k) auxiliary space complexity bounded by window size',
          'Eviction of out-of-window indices from the front of the deque',
        ],
        candidate_answer: {
          code: codeAnswer,
        },
      });

      expect(output.correctness).toBeGreaterThanOrEqual(8.0);
      expect(output.technical_depth).toBeGreaterThanOrEqual(8.0);
      expect(output.reasoning).toBeGreaterThanOrEqual(7.0);
      expect(output.knowledge_gaps.length).toBe(0);
    });

    it('seamlessly bridges to QuestionEvaluation for scoring engine integration', () => {
      const input: AnswerEvaluatorInput = {
        question: sampleQuestion,
        expected_answer_points: expectedPoints,
        candidate_answer: 'Virtual DOM compares trees and batches mutations in reconciliation.',
      };

      const output = evaluator.evaluateSync(input);
      const qe = evaluator.toQuestionEvaluation(output, 'q-1', 'frontend', 'conceptual');

      expect(qe.questionId).toBe('q-1');
      expect(qe.skillId).toBe('frontend');
      expect(qe.grade).toBeGreaterThanOrEqual(0);
      expect(qe.grade).toBeLessThanOrEqual(10);
      expect(qe.criteria.knowledgeDepth).toBe(output.technical_depth);
      expect(qe.criteria.reasoning).toBe(output.reasoning);
      expect(qe.criteria.communication).toBe(output.communication);
      expect(qe.rubricCompliance).toBeGreaterThanOrEqual(0);
      expect(qe.rubricCompliance).toBeLessThanOrEqual(1);
    });

    it('works asynchronously via evaluate()', async () => {
      const output = await evaluator.evaluate({
        question: sampleQuestion,
        expected_answer_points: expectedPoints,
        candidate_answer: 'React reconciliation diffs virtual trees and batches DOM updates.',
      });

      expect(output.correctness).toBeGreaterThan(0);
      expect(output.feedback.length).toBeGreaterThan(10);
    });
  });
});
