import type { JobDescriptionAnalysis, LevelBand, SkillsTaxonomy } from '../types.js';
import { defaultTaxonomy } from '../taxonomy/skills.js';
import { detectSkillIds } from '../understanding/ResumeParser.js';

/**
 * JOB REQUIREMENT PARSER — deterministic extraction of the signals in a job
 * description.
 *
 * It is deliberately conservative: "a skill is listed" is a *stated* requirement,
 * never an assumption about the candidate. The parser's output (JobDescription
 * Analysis) is later matched against the candidate profile to drive interviewing.
 */

/** Lines that look like a section heading with no trailing period. */
const HEADING_LIKE = /^[A-Z][A-Za-z &/+\-]{2,40}:?\s*$/;
const SECTION_ALIASES: { label: string; matchers: RegExp[] }[] = [
  { label: 'title', matchers: [/title|position|role/i] },
  { label: 'responsibilities', matchers: [/responsibilit/i, /what you(?:'| )?ll do|your day|the opportunity|about the role/i] },
  { label: 'preferred', matchers: [/preferred|nice to have|bonus|pluses?|a plus|desirable|good to have/i] },
  { label: 'required', matchers: [/^required|requirements|must haves?|minimum qualifications|qualifications/i] },
  { label: 'technologies', matchers: [/technolog|stack|tools? we use/i] },
  { label: 'company_expectations', matchers: [/company expectations|expectations|our values|culture|leadership principles|what we look for/i] },
  { label: 'about', matchers: [/^about|about the team|who you are/i] },
  { label: 'benefits', matchers: [/benefits|perks|compensation/i] },
];

const LEVEL_KEYWORDS: { band: LevelBand; matchers: RegExp[] }[] = [
  { band: 'junior', matchers: [/junior|entry|associate|grad/i] },
  { band: 'mid', matchers: [/mid\b|\bii\b|2\s*[-+to]\s*5/i] },
  { band: 'senior', matchers: [/senior|staff|lead|principal|5\s*\+/i] },
];

const DOMAIN_KEYWORDS: { name: string; matchers: RegExp[] }[] = [
  { name: 'fintech/payments', matchers: [/payments?|financ|banking|ledger|charge|reconcil/i] },
  { name: 'e-commerce', matchers: [/e-?commerce|marketplace|retail|catalog/i] },
  { name: 'data/analytics', matchers: [/analytics|data platform|\bbi\b|data science|dashboards/i] },
  { name: 'saas', matchers: [/saas|multi-?tenant|subscription/i] },
  { name: 'infra/devops-platform', matchers: [/platform|infrastructure|reliability|\bsre\b/i] },
  { name: 'real-time/comms', matchers: [/realtime|real-?time|messaging|streaming|live/i] },
];

const PROBLEM_SOLVING_KEYWORDS: { topic: string; matchers: RegExp[] }[] = [
  { topic: 'system design', matchers: [/system design|architecture|design/i] },
  { topic: 'algorithms & data structures', matchers: [/algorithms?|data structures|coding|leetcode/i] },
  { topic: 'trade-off reasoning', matchers: [/trade-?offs?|scale|performance|reliability/i] },
  { topic: 'debugging & ops', matchers: [/debug|monitoring|on-?call|incident|production|outage/i] },
];

export interface JobRequirementParserDeps {
  readonly taxonomy?: SkillsTaxonomy;
}

/**
 * Deterministic job-description → structured requirements parser.
 * `title`, `expectedLevel`, and each skill's *intent* (required vs preferred)
 * are best-effort, evidence-based guesses; they never assert candidate ability.
 */
export class JobRequirementParser {
  private readonly taxonomy: SkillsTaxonomy;

  constructor(deps: JobRequirementParserDeps = {}) {
    this.taxonomy = deps.taxonomy ?? defaultTaxonomy;
  }

  parse(raw: string): JobDescriptionAnalysis {
    const lines = raw.replace(/\r\n/g, '\n')
      .replace(/\b(Required|Requirements|Preferred|Nice to have|Minimum qualifications):[ \t]*(?=\S)/gi, '\n$1:\n')
      .split('\n');
    const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);

    // Segment into titled sections.
    const sections: { label: string; notes: string[] }[] = [];
    let current: { label: string; notes: string[] } | null = null;
    for (const line of nonEmpty) {
      const heading = this.classifyHeading(line);
      if (heading) {
        current = { label: heading, notes: [] };
        sections.push(current);
      } else if (current) {
        current.notes.push(line);
      } else {
        // Pre-heading block (e.g. company blurb) — fold under "about".
        const about = sections.find((s) => s.label === 'about');
        if (about) about.notes.push(line);
        else {
          current = { label: 'about', notes: [line] };
          sections.push(current);
        }
      }
    }

    const title = this.extractTitle(nonEmpty, sections);
    const expectedLevel = this.inferLevel(title, nonEmpty.join(' '));

    // Skills: required vs preferred sections.
    const requiredSkills = this.collectSkillsFrom(sections, ['required']);
    const preferredSkills = this.collectSkillsFrom(sections, ['preferred']);

    const responsibilities = this.collectText(sections, ['responsibilities']);
    const relevantTechnologies = this.collectTechnologies(sections, nonEmpty);
    const problemSolvingExpectations = this.collectProblemSolving(nonEmpty.join('\n'));
    const domainKnowledge = this.collectDomains(nonEmpty.join(' '));
    const companyExpectations = this.collectText(sections, ['company_expectations']);

    return {
      title,
      requiredSkills,
      preferredSkills,
      responsibilities,
      expectedLevel,
      relevantTechnologies,
      problemSolvingExpectations,
      domainKnowledge,
      companyExpectations,
      sections: sections.map((s) => ({ label: s.label, notes: s.notes })),
    };
  }

  private classifyHeading(line: string): string | null {
    if (!HEADING_LIKE.test(line)) return null;
    for (const alias of SECTION_ALIASES) {
      if (alias.matchers.some((re) => re.test(line))) return alias.label;
    }
    return null;
  }

  private extractTitle(nonEmpty: string[], sections: { label: string; notes: string[] }[]): string {
    const titleSection = sections.find((s) => s.label === 'title');
    if (titleSection && titleSection.notes.length) return titleSection.notes[0];
    for (const line of nonEmpty) {
      if (this.classifyHeading(line)) continue;
      if (/\b(engineer|developer|scientist|architect|manager|designer)\b/i.test(line)) return line;
    }
    return 'Untitled role';
  }

  private inferLevel(textWithTitle: string, text: string): LevelBand | undefined {
    const haystack = `${textWithTitle}\n${text}`;
    for (const { band, matchers } of LEVEL_KEYWORDS) {
      if (matchers.some((re) => re.test(haystack))) return band;
    }
    return undefined;
  }

  /** Collect taxonomy skill ids detected in the given section labels. */
  private collectSkillsFrom(sections: { label: string; notes: string[] }[], labels: string[]): string[] {
    const gathered: string[] = [];
    for (const section of sections) {
      if (labels.includes(section.label)) {
        gathered.push(...detectSkillIds(section.notes.join('\n'), this.taxonomy));
      }
    }
    return [...new Set(gathered)];
  }

  private collectText(sections: { label: string; notes: string[] }[], labels: string[]): string[] {
    const out: string[] = [];
    for (const section of sections) {
      if (labels.includes(section.label)) {
        for (const note of section.notes) out.push(note);
      }
    }
    return out;
  }

  private collectTechnologies(sections: { label: string; notes: string[] }[], nonEmpty: string[]): string[] {
    const techSection = sections.find((s) => s.label === 'technologies');
    const textToScan = techSection ? techSection.notes.join(' ') : nonEmpty.join(' ');
    const tokens = textToScan.match(/[A-Za-z][A-Za-z0-9+#.\-]{1,24}/g) ?? [];
    const known = /^(node\.?js|typescript|python|java|go|rust|react|vue|angular|postgres|postgresql|mysql|redis|aws|gcp|azure|docker|kubernetes|kafka|spark|graphql|terraform|mongodb|cloud)$/i;
    const techLike = tokens.filter((t) => known.test(t));
    return [...new Set(techLike)].slice(0, 24);
  }

  private collectProblemSolving(text: string): string[] {
    const topics: string[] = [];
    for (const { topic, matchers } of PROBLEM_SOLVING_KEYWORDS) {
      if (matchers.some((re) => re.test(text))) topics.push(topic);
    }
    return topics;
  }

  private collectDomains(text: string): string[] {
    const domains: string[] = [];
    for (const { name, matchers } of DOMAIN_KEYWORDS) {
      if (matchers.some((re) => re.test(text))) domains.push(name);
    }
    return domains;
  }
}

export const defaultJobRequirementParser = new JobRequirementParser();
