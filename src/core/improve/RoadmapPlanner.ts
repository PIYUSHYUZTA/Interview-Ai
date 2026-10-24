import type { KnowledgeGap, RoadmapStep, RoleRequirement, SkillCategory, SkillsTaxonomy } from '../types.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { norm } from '../utils/norm.js';

const EFFORT_BY_CATEGORY: Record<SkillCategory, RoadmapStep['effort']> = {
  algorithms: 'long',
  system_design: 'long',
  data: 'long',
  databases: 'medium',
  cloud: 'medium',
  mobile: 'medium',
  security: 'medium',
  backend: 'short',
  frontend: 'short',
  devops: 'short',
  testing: 'short',
  engineering: 'short',
};

/** Concrete action templates per category (evidence-driven training plans). */
const ACTION_TEMPLATES: Record<SkillCategory, (label: string) => string> = {
  algorithms: (l) =>
    `Work a pattern-driven drill deck for ${l}: solve 8–10 problems per pattern with written time/space complexity proofs and re-solve your weakest 3 from memory a week later.`,
  databases: (l) =>
    `Rebuild the ${l} fundamentals from first principles: hand-run B-tree insert/delete traces, write the SQL in three equivalent forms, and benchmark with EXPLAIN ANALYZE.`,
  backend: (l) =>
    `Build a small service exercising ${l} weaknesses end-to-end (idempotent API + queue + retry), then load-test it and document failure modes.`,
  frontend: (l) =>
    `Fix a real slow screen using the ${l} techniques you missed (virtualization, memoization, avoiding layout thrash) and measure before/after with the profiler.`,
  cloud: (l) =>
    `Deploy the ${l} workload you struggled with in a disposable sandbox; capture cost/behaviour metrics and compare at least two architecture options.`,
  devops: (l) =>
    `Run a blue-green/canary practice deployment for ${l} with a deliberate rollback exercise, and wire observability gates to block bad promotions.`,
  system_design: (l) =>
    `Do three timed ${l} whiteboard sessions (URL shortener, news feed, key-value store); for each, write the capacity math, data flow, and a decision log of trade-offs.`,
  data: (l) =>
    `Prototype the ${l} pipeline you missed (e.g. ELT vs ETL) on real data with lineage, then reconcile a bug end-to-end to build debugging fluency.`,
  mobile: (l) =>
    `Add offline-first ${l} behavior to a demo app (local store, optimistic updates, conflict resolution) and test under simulated network failures.`,
  security: (l) =>
    `Run OWASP Top 10 exercises for the ${l} areas you missed: exploit a deliberately vulnerable app, then write the fixes and the regression tests.`,
  testing: (l) =>
    `Introduce ${l} on a legacy module with a realistic deadline: write the pyramid (unit/integration/E2E), add a mutation-testing pass, and reduce flakiness.`,
  engineering: (l) =>
    `Hone ${l} with structured practice: run a retro you facilitated, write a postmortem, or rehearse a negotiation/scoping scenario with a peer and get feedback.`,
};

export interface RoadmapDeps {
  readonly taxonomy?: SkillsTaxonomy;
}

/**
 * Turns knowledge gaps into a prioritized, evidence-informed improvement
 * roadmap. Priority = severity (distance from the requirement) × how much the
 * skill matters to the target role.
 */
export class RoadmapPlanner {
  private readonly taxonomy: SkillsTaxonomy;

  constructor(deps: RoadmapDeps = {}) {
    this.taxonomy = deps.taxonomy ?? defaultTaxonomy;
  }

  plan(gaps: readonly KnowledgeGap[], role: RoleRequirement): RoadmapStep[] {
    const decorated: { step: RoadmapStep; score: number }[] = gaps.map((gap) => {
      const def = this.taxonomy.assert(gap.skillId);
      const weight = role.skills.find((s) => s.skillId === gap.skillId)?.weight ?? 0.5;

      return {
        step: {
          skillId: gap.skillId,
          category: def.category,
          priority: 0,
          action: ACTION_TEMPLATES[def.category](def.label),
          rationale: `Estimated ${gap.currentEstimate}/10 vs ${gap.requiredLevel} requirement; severity ${norm.to10(gap.severity).toFixed(1)}/10 (confidence ${Math.round(gap.confidence * 100)}%).`,
          effort: EFFORT_BY_CATEGORY[def.category] ?? 'medium',
        },
        score: gap.severity * (0.5 + weight),
      };
    });

    decorated.sort((a, b) => b.score - a.score);
    return decorated.map(({ step }, index) => ({ ...step, priority: index + 1 }));
  }
}

export const defaultRoadmapPlanner = new RoadmapPlanner();