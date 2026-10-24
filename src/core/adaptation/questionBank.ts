import type { Difficulty, QuestionType } from '../types.js';

/** A template inside the question bank. `difficulty` is the designed base. */
export interface BaseQuestion {
  readonly subtopic: string;
  readonly type: QuestionType;
  readonly prompt: string;
  readonly hints: readonly string[];
  readonly difficulty: Difficulty;
  readonly params?: Readonly<Record<string, string | number>>;
  readonly choices?: readonly string[];
  readonly correctChoiceIndex?: number;
  readonly starterCode?: string;
  readonly language?: string;
  readonly testCases?: readonly {
    readonly input: readonly unknown[];
    readonly expected: unknown;
    readonly description?: string;
  }[];
}

function Q(p: Omit<BaseQuestion, 'difficulty'> & { difficulty?: Difficulty }): BaseQuestion {
  return { difficulty: 3, ...p } as BaseQuestion;
}

export const QUESTION_TEMPLATES: ReadonlyMap<string, readonly BaseQuestion[]> = new Map<
  string,
  BaseQuestion[]
>([
  [
    'algorithms',
    [
      Q({
        subtopic: 'complexity analysis',
        type: 'conceptual',
        difficulty: 4,
        prompt:
          'For finding the k-th largest element in an unsorted array of N integers, compare (a) sort-then-index, (b) min-heap of size k, and (c) quickselect. Give time/space complexity for each and state when each is the right choice.',
        hints: ['big-O complexity', 'heap vs sort trade-off', 'average vs worst case'],
      }),
      Q({
        subtopic: 'sliding window',
        type: 'code',
        difficulty: 3,
        prompt:
          'Implement `maxSumOfSubarray(nums, k)` returning the maximum sum of any contiguous length-k subarray. Aim for O(n) time. If k > nums.length, return -Infinity.',
        hints: ['sliding window', 'O(n) time', 'constant extra space'],
        starterCode: 'function maxSumOfSubarray(nums, k) {\n  // your code here\n}',
        language: 'javascript',
        testCases: [
          { input: [[1, 2, 3, 4, 5], 2], expected: 9, description: 'basic' },
          { input: [[-1, -2, 3, -4], 2], expected: 1, description: 'negatives' },
          { input: [[5], 1], expected: 5, description: 'k=len' },
          { input: [[1, 2], 3], expected: -Infinity, description: 'k>len' },
        ],
      }),
      Q({
        subtopic: 'search structures',
        type: 'mcq',
        difficulty: 2,
        prompt: 'Best structure for repeated prefix lookups over a large dictionary of strings?',
        hints: ['typical lookup cost', 'memory vs speed'],
        choices: ['Balanced BST', 'Hash map', 'Trie', 'Sorted array + binary search'],
        correctChoiceIndex: 2,
      }),
    ],
  ],
  [
    'databases',
    [
      Q({
        subtopic: 'indexing',
        type: 'conceptual',
        difficulty: 3,
        prompt:
          'A 10M-row users table scans fully on `WHERE last_name = ?`. Explain what you would add, the B-tree maintenance trade-offs (write amplification, memory, UPDATE cost), and why an index usually does not help `LIKE \'%abc\'`.',
        hints: ['B-tree structure', 'index maintenance cost', 'selectivity / cardinality'],
      }),
      Q({
        subtopic: 'isolation levels',
        type: 'mcq',
        difficulty: 4,
        prompt: 'Under READ COMMITTED in PostgreSQL, which anomaly remains possible?',
        hints: ['isolation levels', 'anomaly taxonomy'],
        choices: ['Dirty reads', 'Non-repeatable reads', 'Phantom reads are fully prevented', 'None — READ COMMITTED is fully serializable'],
        correctChoiceIndex: 1,
      }),
      Q({
        subtopic: 'schema evolution at scale',
        type: 'situational',
        difficulty: 3,
        prompt:
          'The Payments table holds 2 years of immutable rows and feeds a hot balance endpoint; writes block reads at peak. Design the migration/read-path plan: partitioning, replicas, consistency window, and rollback.',
        hints: ['archive / partition', 'read replicas', 'async consistency + rollback'],
      }),
      Q({
        subtopic: 'top-earner SQL',
        type: 'code',
        difficulty: 3,
        prompt:
          'Write SQL returning, per department, the highest-earning employee(s). Tables: employees(id, name, department_id, salary), departments(id, name). Notes: a department with no employees may not appear; ties should all be returned.',
        hints: ['window function RANK', 'join on max-salary aggregate'],
        starterCode: '-- your query here',
        language: 'sql',
        testCases: [{ input: [], expected: 0, description: 'SQL is assessed by the interviewer rubric' }],
      }),
    ],
  ],
  [
    'backend',
    [
      Q({
        subtopic: 'idempotent APIs',
        type: 'conceptual',
        difficulty: 3,
        prompt:
          'Design an idempotent POST /payments API so a client retry can never double-charge. Cover idempotency keys, deduplication storage, uniqueness constraints, races, and key expiry.',
        hints: ['idempotency key', 'unique constraint / dedup store', 'expiry & replay handling'],
      }),
      Q({
        subtopic: 'caching & invalidation',
        type: 'mcq',
        difficulty: 3,
        prompt:
          'A read-heavy endpoint caches rows in Redis with a short TTL. Which invalidation minimizes stale reads while keeping the cache effective?',
        hints: ['TTL vs explicit invalidation', 'write-through vs read-through'],
        choices: [
          'Remove TTL; rely only on write-through updates',
          'Write-through + per-key invalidation on writes + short TTL backstop',
          'Cache everything with no expiry',
          'Disable caching entirely',
        ],
        correctChoiceIndex: 1,
      }),
      Q({
        subtopic: 'outage response',
        type: 'behavioral',
        difficulty: 3,
        prompt:
          'Tell me about a production incident you helped resolve. Structure with STAR (situation, task, action, result): diagnostic steps, blast-radius containment, and what changed afterward.',
        hints: ['STAR structure', 'ownership & follow-up', 'concrete diagnostic steps'],
      }),
    ],
  ],
  [
    'system_design',
    [
      Q({
        subtopic: 'URL shortener',
        type: 'system_design',
        difficulty: 3,
        prompt:
          'Design a URL shortener for 100M writes and 10B reads per day. Cover API, storage model, key generation, caching, analytics, and failure modes. State your top trade-off and why.',
        hints: ['capacity estimate', 'write path & key generation', 'cache + consistency trade-off'],
      }),
      Q({
        subtopic: 'capacity estimation',
        type: 'numerical',
        difficulty: 3,
        prompt:
          'Estimate storage for 10 years of 50B short URLs with 512-byte metadata each, in TB (1e12 bytes). Then, if we cache the 5% hottest ~1M rows\' metadata (512B each), state that cache size in MB.',
        hints: ['order-of-magnitude math', 'separate the two answers clearly'],
        params: { answer: 2560, tolerance: 0.25 },
      }),
      Q({
        subtopic: 'consistency models',
        type: 'mcq',
        difficulty: 4,
        prompt:
          'For a social feed where a creator\'s post must eventually reach every follower, which model is the standard practical choice and why not strict linearizability everywhere?',
        hints: ['eventual consistency', 'availability vs latency'],
        choices: [
          'Strict serializability everywhere',
          'Eventual consistency with a bounded propagation budget',
          'Never replicate',
          'Always read from the creator\'s primary shard',
        ],
        correctChoiceIndex: 1,
      }),
    ],
  ],
  [
    'frontend',
    [
      Q({
        subtopic: 'rendering performance',
        type: 'conceptual',
        difficulty: 3,
        prompt:
          'A product list page with 5k rows janks on scroll. Diagnose likely causes (DOM size, layout thrash, reconciliation) and give concrete remedies with trade-offs.',
        hints: ['virtualized lists', 'avoid layout thrash', 'reconciliation keys'],
      }),
      Q({
        subtopic: 'state & effects',
        type: 'mcq',
        difficulty: 2,
        prompt: 'What is the primary purpose of memoized selectors in state management?',
        hints: ['pure derivation', 'avoid recompute'],
        choices: ['Persist state to localStorage', 'Derive values only when inputs change', 'Run side effects on render', 'Replace the reducer'],
        correctChoiceIndex: 1,
      }),
      Q({
        subtopic: 'accessibility',
        type: 'situational',
        difficulty: 3,
        prompt:
          'A modal dialog is reported as keyboard-inaccessible. List the concrete WCAG issues you would examine and fix (focus trap, aria attributes, focus restore) and how you would verify with automated and manual tools.',
        hints: ['focus management', 'ARIA roles/attributes', 'verification with axe + keyboard'],
      }),
    ],
  ],
  [
    'cloud',
    [
      Q({
        subtopic: 'serverless vs containers',
        type: 'conceptual',
        difficulty: 3,
        prompt:
          'A batch job runs at 10% CPU for 40 minutes, then idles. Contrast (a) a long-running Kubernetes container vs (b) serverless. Compare cold starts, cost, timeout limits, and operations; give a recommendation with reasoning.',
        hints: ['cold start / warm pools', 'cost curve of idle time', 'operational overhead'],
      }),
      Q({
        subtopic: 'durability',
        type: 'mcq',
        difficulty: 2,
        prompt: 'Which statement about object storage durability is correct?',
        hints: ['durability vs availability', 'replication / erasure coding'],
        choices: [
          'Durability is optional if availability is high',
          'Durability is engineered via replication/erasure coding across facilities',
          'Availability is guaranteed identical to durability',
          'Objects live in a single AZ by default',
        ],
        correctChoiceIndex: 1,
      }),
      Q({
        subtopic: 'cost & autoscaling',
        type: 'situational',
        difficulty: 3,
        prompt:
          'Your API runs 24/7 at 5% utilization but needs 2× capacity for one hour nightly. Design cost-cutting options (autoscaling, spot, warm/cold starts) with the risks of each.',
        hints: ['autoscaling policies', 'spot vs on-demand', 'schedule vs reactive scaling'],
      }),
    ],
  ],
  [
    'devops',
    [
      Q({
        subtopic: 'deployment safety',
        type: 'conceptual',
        difficulty: 3,
        prompt:
          'Walk through a zero-downtime deployment of a monolith with a Postgres schema migration: migration ordering (expand-contract), canary + feature flags, rollback, and observability gates that block promotion.',
        hints: ['expand-contract migrations', 'canary + feature flags', 'rollback & observability gates'],
      }),
      Q({
        subtopic: 'canary strategy',
        type: 'mcq',
        difficulty: 3,
        prompt: 'What is the main advantage of canary deployment over blue-green?',
        hints: ['incremental exposure', 'blast radius'],
        choices: [
          'It avoids needing two full environments',
          'It restricts blast radius by gradually routing traffic',
          'It deploys faster by skipping tests',
          'It removes the need for a load balancer',
        ],
        correctChoiceIndex: 1,
      }),
    ],
  ],
  [
    'security',
    [
      Q({
        subtopic: 'authN & authZ',
        type: 'conceptual',
        difficulty: 3,
        prompt:
          'Design token-based auth for a SPA with refresh-token rotation: token lifetimes, storage choices with their XSS/XSRF trade-offs, revocation on logout/breach, and replay protection.',
        hints: ['JWT vs opaque tokens', 'storage & XSS/XSRF trade-offs', 'rotation & revocation'],
      }),
      Q({
        subtopic: 'OWASP awareness',
        type: 'mcq',
        difficulty: 2,
        prompt: 'Which mitigation directly prevents stored XSS?',
        hints: ['output encoding', 'input validation alone is insufficient'],
        choices: ['Always validating input with regex', 'Context-aware output encoding of user content', 'Enabling HTTPS only', 'Rate limiting the API'],
        correctChoiceIndex: 1,
      }),
      Q({
        subtopic: 'security incident',
        type: 'behavioral',
        difficulty: 3,
        prompt:
          'Tell me about a time you found or responded to a security concern. Describe confirming it, scoping impact, coordinating the fix, and what changed permanently afterwards.',
        hints: ['STAR structure', 'incident scoping', 'post-incident hardening'],
      }),
    ],
  ],
  [
    'testing',
    [
      Q({
        subtopic: 'test strategy',
        type: 'conceptual',
        difficulty: 3,
        prompt:
          'For a payment orchestration service pulling together 4 external dependencies, design a pragmatic test pyramid: unit vs integration vs E2E, what you mock and why, and how you keep the suite fast and stable.',
        hints: ['test pyramid', 'fakes vs mocks at boundaries', 'flaky E2E discipline'],
      }),
      Q({
        subtopic: 'coverage vs effectiveness',
        type: 'mcq',
        difficulty: 2,
        prompt: 'Why is line coverage alone a poor quality gate?',
        hints: ['assertion quality', 'mutation testing'],
        choices: [
          'Coverage is hard to measure',
          'High coverage can still permit untested assertions/behaviour',
          'Coverage gates slow CI',
          'Line coverage ignores HTTP',
        ],
        correctChoiceIndex: 1,
      }),
      Q({
        subtopic: 'deadline pressure',
        type: 'situational',
        difficulty: 3,
        prompt:
          'A critical fix is due in 4 hours but the suite is slow and flaky. Prioritise your testing approach and justify which coverage trade-off you would accept for the deadline.',
        hints: ['risk-based testing', 'fast feedback loops', 'technical-debt follow-up'],
      }),
    ],
  ],
  [
    'data_engineering',
    [
      Q({
        subtopic: 'ETL vs ELT',
        type: 'conceptual',
        difficulty: 3,
        prompt:
          'Compare ETL and ELT for a warehouse team adopting dbt: where transformation logic lives, compute vs storage cost, debugging, and schema evolution in each model.',
        hints: ['transformation location', 'compute/storage costs', 'schema evolution & lineage'],
      }),
      Q({
        subtopic: 'partitioning',
        type: 'mcq',
        difficulty: 2,
        prompt: 'Which partitioning key most improves a time-series query pattern?',
        hints: ['data pruning', 'event ordering'],
        choices: ['User id', 'Event date', 'Event type', 'Payload hash'],
        correctChoiceIndex: 1,
      }),
    ],
  ],
  [
    'mobile',
    [
      Q({
        subtopic: 'offline-first sync',
        type: 'conceptual',
        difficulty: 4,
        prompt:
          'Design offline-first sync for a chat app: local storage, optimistic writes, conflict resolution (LWW vs CRDTs), retry/backoff on a flaky network, and surfacing sync state to the user.',
        hints: ['optimistic UI', 'conflict resolution', 'retry & sync-state UI'],
      }),
      Q({
        subtopic: 'app lifecycle',
        type: 'mcq',
        difficulty: 2,
        prompt: 'Why is saving draft state in onBackground/onPause important?',
        hints: ['process death', 'foreground/background'],
        choices: [
          'It improves rendering',
          'The OS may kill the process shortly after backgrounding',
          'It prevents network calls',
          'It is required for app store review',
        ],
        correctChoiceIndex: 1,
      }),
    ],
  ],
  [
    'software_delivery',
    [
      Q({
        subtopic: 'conflict resolution',
        type: 'behavioral',
        difficulty: 3,
        prompt:
          'Describe a time two engineers disagreed on the right technical approach. What did you do to keep the decision evidence-based, and how did you align the team afterwards?',
        hints: ['STAR structure', 'evidence-based decisions', 'team alignment'],
      }),
      Q({
        subtopic: 'estimation',
        type: 'situational',
        difficulty: 3,
        prompt:
          'Your team commits to a 6-week feature; at week 3 the design misses a critical requirement. Outline your re-plan, who you align, and what you would say.',
        hints: ['re-scope options', 'stakeholder alignment', 'trade-off transparency'],
      }),
    ],
  ],
]);