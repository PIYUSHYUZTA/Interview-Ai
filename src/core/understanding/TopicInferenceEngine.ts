import type { ExperienceEntry, InterviewTopic, ResumeSourceRef, SkillsTaxonomy } from '../types.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { detectSkillIds, type SkillMention } from './ResumeParser.js';

/**
 * TOPIC INFERENCE ENGINE — resume claim → interrogation agenda.
 *
 * Deterministic, rule-based and deliberately conservative.
 *
 * THE ANTI-HALLUCINATION RULES:
 *  - The engine never asserts whether a candidate *understands* anything.
 *  - Every emitted topic is an open PROBE: something the interview should
 *    interrogate so the claim can be validated (or refuted) with evidence.
 *  - Every topic stays source-bound (line + excerpt) so nothing floats free.
 *
 * Example: "Built a machine-learning recommendation system." produces topics
 * for system architecture, algorithms & techniques, data & features, model
 * selection, evaluation & metrics, deployment & operations, and the candidate's
 * actual contribution. None of them assume the candidate mastered any topic.
 */

// ---------------------------------------------------------------------------
// Probe templates
// ---------------------------------------------------------------------------

const CONTRIBUTION_PROBES: readonly string[] = [
  'What the candidate (not the team) personally built, ran or owned',
  'Which parts were copied vs designed from first principles',
  'What the candidate would do differently on a second pass',
];

interface ProbeTemplate {
  readonly topic: string;
  readonly rationale: string;
  readonly probes: readonly string[];
}

const ML_PROBES: readonly ProbeTemplate[] = [
  {
    topic: 'System architecture',
    rationale: 'Claim involves a data/ML system — interrogation must ground it in a concrete architecture.',
    probes: ['Components and how they connect', 'Training vs inference path', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Algorithms & techniques',
    rationale: 'Claim involves model work — interview must surface which techniques were used and why.',
    probes: ['Which algorithms/techniques were applied', 'How the approach compares to alternatives', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Data & features',
    rationale: 'ML claims stand or fall on the data story — volume, labels, quality, feature engineering.',
    probes: ['Data sources and volume', 'Labeling/quality work', 'Feature engineering decisions', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Model selection',
    rationale: 'A trustworthy ML claim includes how the model was chosen among alternatives.',
    probes: ['Which models were considered', 'Why the chosen one won', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Evaluation & metrics',
    rationale: 'Any ML claim must be validated by how the outcome was measured.',
    probes: ['Offline vs online metrics', 'Baselines and target numbers', 'Where it underperformed', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Deployment & operations',
    rationale: 'Claims of built systems imply serving, monitoring and retraining — probe that.',
    probes: ['How the system was served', 'Monitoring and retraining loop', 'Rollback and recovery', ...CONTRIBUTION_PROBES],
  },
  {
    topic: "Candidate's actual contribution",
    rationale: 'Resume bullets blur team vs individual work; contribution must be separated.',
    probes: [...CONTRIBUTION_PROBES],
  },
];

const SYSTEM_DESIGN_PROBES: readonly ProbeTemplate[] = [
  {
    topic: 'Architecture & components',
    rationale: 'Probe the design concretely so the claim can be checked.',
    probes: ['Component map', 'Data flow', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Scaling & performance',
    rationale: 'Probe the claimed scale, not the adjectives.',
    probes: ['Load model', 'Bottlenecks found', 'Numbers mentioned on the resume', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Trade-offs & alternatives',
    rationale: 'Probe whether alternatives were weighed before building.',
    probes: ['Rejected options and why', 'Capacity planning', ...CONTRIBUTION_PROBES],
  },
];

const DATABASE_PROBES: readonly ProbeTemplate[] = [
  {
    topic: 'Schema design & data modeling',
    rationale: 'Probe the modeling choices behind the database claim.',
    probes: ['Why this schema', 'Indexing strategy', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Query performance & indexing',
    rationale: 'Probe the query work behind "scaled/optimized" claims.',
    probes: ['Slowest queries', 'Index/partition decisions', 'Plan analysis familiarity', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Transactions & consistency',
    rationale: 'Probe correctness under concurrency.',
    probes: ['Isolation levels', 'Deadlock/failure handling', ...CONTRIBUTION_PROBES],
  },
];
const API_PROBES: readonly ProbeTemplate[] = [
  {
    topic: 'API design & contracts',
    rationale: 'Probe the interface decisions behind the API claim.',
    probes: ['Endpoint/resource design', 'Versioning and evolution', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Reliability patterns',
    rationale: 'Probe production-ness of the claim (the resume often says "idempotent", "reliable").',
    probes: ['Idempotency, retries, timeouts', 'Failure modes handled', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Performance under load',
    rationale: 'Probe the scale claim with concrete numbers.',
    probes: ['Throughput/latency numbers', 'Load testing done', ...CONTRIBUTION_PROBES],
  },
];

const FRONTEND_PROBES: readonly ProbeTemplate[] = [
  {
    topic: 'Rendering & performance',
    rationale: 'Probe how the UI work was validated.',
    probes: ['Render path', 'Performance budgets', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'State management',
    rationale: 'Probe the state architecture of the frontend claim.',
    probes: ['How state is held/mutated', 'Why the chosen approach', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Accessibility & quality',
    rationale: 'Probe non-functional depth beyond "made UI".',
    probes: ['A11y work done', 'Testing/browser matrix', ...CONTRIBUTION_PROBES],
  },
];

const DEVOPS_PROBES: readonly ProbeTemplate[] = [
  {
    topic: 'Deployment architecture',
    rationale: 'Probe how delivery actually worked end to end.',
    probes: ['Pipeline stages', 'Environment promotion', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Infrastructure & automation',
    rationale: 'Probe the infra story behind "deploy/CI/CD" claims.',
    probes: ['Infra-as-code choices', 'Reproducibility', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Monitoring & incident response',
    rationale: 'Probe ops maturity behind observability claims.',
    probes: ['Alerting and dashboards', 'Incident handling', ...CONTRIBUTION_PROBES],
  },
];

const GENERIC_PROBES: readonly ProbeTemplate[] = [
  {
    topic: 'Problem framing & success metrics',
    rationale: 'Probe what the work was for and how it was judged.',
    probes: ['Problem statement', 'Success metric', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Design decisions & trade-offs',
    rationale: 'Probe whether the work was deliberate or cargo-culted.',
    probes: ['Key decisions', 'Trade-offs considered', ...CONTRIBUTION_PROBES],
  },
  {
    topic: 'Hands-on implementation',
    rationale: 'Probe the actual work performed.',
    probes: ['What was implemented', 'Hardest bug/issue', ...CONTRIBUTION_PROBES],
  },
];

// ---------------------------------------------------------------------------
// Content-triggered rules (first match wins per source unit)
// ---------------------------------------------------------------------------

interface ContentRule {
  readonly id: string;
  readonly match: RegExp;
  readonly templates: () => readonly ProbeTemplate[];
}

const CONTENT_RULES: readonly ContentRule[] = [
  {
    id: 'ml',
    match: /machine learning|\bml\b|recommendation|predictive|neural|deep learning|model training|classification|ranking/i,
    templates: () => ML_PROBES,
  },
  {
    id: 'distributed',
    match: /scal|distributed|high traffic|throughput|latency|microservice|load balancer|partition|shard|cache/i,
    templates: () => SYSTEM_DESIGN_PROBES,
  },
  {
    id: 'database',
    match: /sql|postgres|mysql|indexing|schema|transaction|data model|mongodb|normalization/i,
    templates: () => DATABASE_PROBES,
  },
  {
    id: 'api',
    match: /\bapi\b|rest|grpc|endpoint|queue|message|idempoten|webhook|server/i,
    templates: () => API_PROBES,
  },
  {
    id: 'frontend',
    match: /react|vue|angular|component|css|browser|ui |frontend|tailwind/i,
    templates: () => FRONTEND_PROBES,
  },
  {
    id: 'devops',
    match: /ci\/cd|docker|kubernetes|deploy|terraform|pipeline|aws|gcp|azure|observabilit|monitor|jenkins|github actions/i,
    templates: () => DEVOPS_PROBES,
  },
];

/**
 * A strong content match (ML, distributed systems, databases, …) warrants the
 * full interrogation agenda; weaker signals get at most a couple of probes.
 */
function agendaLimit(fullAgenda: boolean): number {
  return fullAgenda ? Infinity : 2;
}
interface SourceUnit {
  readonly text: string;
  readonly ref: ResumeSourceRef;
  readonly category?: string;
  /** Skill ids this source unit touches, when determinable. */
  readonly skillIds?: readonly string[];
}

/**
 * Expands resume content into a probe-based interview agenda.
 * Every emitted topic is evidence-bound and never asserts candidate skill.
 */
export class TopicInferenceEngine {
  constructor(private readonly taxonomy: SkillsTaxonomy = defaultTaxonomy) {}

  infer(input: {
    readonly lines: readonly string[];
    readonly mentions: readonly SkillMention[];
    readonly projects: readonly string[];
    readonly experience: readonly ExperienceEntry[];
  }): InterviewTopic[] {
    const units = this.assembleSourceUnits(input);
    const topics: InterviewTopic[] = [];
    const seen = new Set<string>();

    for (const unit of units) {
      const templates = this.matchTemplates(unit.text, unit.category);
      for (const template of templates) {
        const key = `${template.topic}|${unit.ref.line}|${unit.ref.section}`;
        if (seen.has(key)) continue;
        seen.add(key);
        topics.push({
          topic: template.topic,
          rationale: `${template.rationale} Raised by resume statement: “${brief(unit.text)}”.`,
          source: unit.ref,
          probes: template.probes.slice(0, 6),
          skillIds: unit.skillIds,
        });
      }
    }
    return topics.slice(0, 14);
  }

  private matchTemplates(text: string, category?: string): readonly ProbeTemplate[] {
    const low = text.toLowerCase();
    for (const rule of CONTENT_RULES) {
      if (rule.match.test(low)) {
        // The claim strongly signals a domain — emit its full probe agenda.
        return rule.templates().slice(0, agendaLimit(true));
      }
    }

    if (category) {
      const byCategory: Record<string, readonly ProbeTemplate[]> = {
        data: ML_PROBES,
        system_design: SYSTEM_DESIGN_PROBES,
        databases: DATABASE_PROBES,
        backend: API_PROBES,
        frontend: FRONTEND_PROBES,
        devops: DEVOPS_PROBES,
        cloud: DEVOPS_PROBES,
        algorithms: [
          {
            topic: 'Algorithms & data structures',
            rationale: 'Probe the algorithmic claim with analysis rather than vibes.',
            probes: ['Complexity analysis', 'Why this approach', ...CONTRIBUTION_PROBES],
          },
        ],
        mobile: FRONTEND_PROBES,
        security: [
          {
            topic: 'Security threat model',
            rationale: 'Probe the security claim concretely.',
            probes: ['Threats considered', 'Mitigations applied', ...CONTRIBUTION_PROBES],
          },
        ],
        testing: [
          {
            topic: 'Testing strategy',
            rationale: 'Probe the quality claim.',
            probes: ['What was covered', 'How flake was handled', ...CONTRIBUTION_PROBES],
          },
        ],
      };
      const templates = byCategory[category];
      if (templates) return templates.slice(0, agendaLimit(false));
    }

    return GENERIC_PROBES.slice(0, agendaLimit(false));
  }

  private assembleSourceUnits(input: {
    readonly lines: readonly string[];
    readonly mentions: readonly SkillMention[];
    readonly projects: readonly string[];
    readonly experience: readonly ExperienceEntry[];
  }): SourceUnit[] {
    const units: SourceUnit[] = [];
    for (const mention of input.mentions) {
      units.push({
        text: mention.evidence,
        ref: { line: mention.line, excerpt: brief(mention.evidence), section: 'skills' },
        skillIds: [mention.skillId],
      });
    }
    for (const project of input.projects) {
      const line = findLine(input.lines, project);
      units.push({
        text: project,
        ref: { line: line ?? 1, excerpt: brief(project), section: 'projects' },
        skillIds: detectSkillIds(project, this.taxonomy),
      });
    }
    for (const entry of input.experience) {
      for (const bullet of entry.bullets) {
        units.push({
          text: bullet,
          ref: { line: entry.source.line, excerpt: brief(bullet), section: 'experience' },
          skillIds: detectSkillIds(bullet, this.taxonomy),
        });
      }
    }
    return units;
  }
}

/** Shorten a resume excerpt for labels/notes without chopping too aggressively. */
export function brief(text: string, max = 96): string {
  const flattened = text.replace(/\s+/g, ' ').trim();
  return flattened.length <= max ? flattened : `${flattened.slice(0, max - 1)}…`;
}

/** First 1-based line that contains the given snippet, else null. */
function findLine(lines: readonly string[], haystack: string): number | null {
  const needle = haystack.slice(0, 60);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) return i + 1;
  }
  return null;
}