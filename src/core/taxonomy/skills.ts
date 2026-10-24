import type { SkillsTaxonomy, SkillDef, LevelBand } from '../types.js';

const COMP = (min: number, max: number) => ({
  junior: { min, max },
  mid: { min: min + 1.5, max: max + 1.5 },
  senior: { min: min + 3, max: max + 3 },
} as const);

/**
 * The default known-skills taxonomy the intelligence core reasons over.
 * Every skill has category + per-level competency windows used for gaps.
 */
const DEFINITIONS: readonly SkillDef[] = [
  {
    id: 'algorithms',
    label: 'Algorithms & Data Structures',
    category: 'algorithms',
    description: 'Time/space complexity, classic data structures, algorithm design and problem decomposition.',
    competencyWindow: COMP(3, 6),
  },
  {
    id: 'databases',
    label: 'Databases & Data Modeling',
    category: 'databases',
    description: 'SQL, indexing, normalization, transactions, consistency models, and schema design.',
    competencyWindow: COMP(3, 6),
  },
  {
    id: 'backend',
    label: 'Backend Engineering',
    category: 'backend',
    description: 'APIs, services, concurrency, caching, queues, and server-side architecture.',
    competencyWindow: COMP(3, 6),
  },
  {
    id: 'frontend',
    label: 'Frontend Engineering',
    category: 'frontend',
    description: 'Layout, rendering, state management, accessibility, performance, and browser APIs.',
    competencyWindow: COMP(3, 6),
  },
  {
    id: 'cloud',
    label: 'Cloud & Infrastructure',
    category: 'cloud',
    description: 'Compute, storage, networking, serverless, cost, and cloud-native patterns.',
    competencyWindow: COMP(3, 6),
  },
  {
    id: 'devops',
    label: 'DevOps & CI/CD',
    category: 'devops',
    description: 'Build pipelines, delivery automation, observability, and incident response.',
    competencyWindow: COMP(3, 6),
  },
  {
    id: 'system_design',
    label: 'System Design',
    category: 'system_design',
    description: 'Requirements, capacity estimation, data flow, trade-offs, scaling, and resilience.',
    competencyWindow: COMP(3, 6),
  },
  {
    id: 'data_engineering',
    label: 'Data Engineering & ML',
    category: 'data',
    description: 'Pipelines, warehousing, feature stores, modeling, and ML fundamentals.',
    competencyWindow: COMP(3, 6),
  },
  {
    id: 'mobile',
    label: 'Mobile Engineering',
    category: 'mobile',
    description: 'Platform SDKs, offline, app lifecycle, UI performance, and store delivery.',
    competencyWindow: COMP(3, 6),
  },
  {
    id: 'security',
    label: 'Security',
    category: 'security',
    description: 'Threat modeling, OWASP, authN/authZ, secrets, and secure defaults.',
    competencyWindow: COMP(3, 6),
  },
  {
    id: 'testing',
    label: 'Testing & Quality',
    category: 'testing',
    description: 'Unit, integration, E2E, property tests, TDD, and quality metrics.',
    competencyWindow: COMP(3, 6),
  },
  {
    id: 'software_delivery',
    label: 'Software Delivery & Collaboration',
    category: 'engineering',
    description: 'Estimation, code review, communication, ownership, and cross-team collaboration.',
    competencyWindow: COMP(3, 6),
  },
];

/**
 * Infers a best-effort level band from claimed years of experience.
 * Used only as an initialization heuristic; interview evidence overrides it.
 */
export function inferLevelBandFromYears(years: number): LevelBand {
  if (years < 2) return 'junior';
  if (years < 5) return 'mid';
  return 'senior';
}

function buildTaxonomy(): SkillsTaxonomy {
  const tuples: [string, SkillDef][] = DEFINITIONS.map((d) => [d.id, d]);
  const definitions = new Map<string, SkillDef>(tuples);
  return {
    definitions,
    list: () => [...DEFINITIONS],
    get: (id) => definitions.get(id),
    assert: (id) => {
      const def = definitions.get(id);
      if (!def) throw new Error(`Unknown skill id: ${id}`);
      return def;
    },
  };
}

export const defaultTaxonomy: SkillsTaxonomy = buildTaxonomy();