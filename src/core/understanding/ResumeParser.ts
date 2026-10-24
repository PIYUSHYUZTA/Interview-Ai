import type { SkillsTaxonomy, SkillDef, EducationEntry, ExperienceEntry, ResumeSourceRef } from '../types.js';

export interface SkillMention {
  readonly skillId: string;
  readonly keyword: string;
  readonly evidence: string;
  /** 1-based resume line where the mention appears. */
  readonly line: number;
}

export interface ParsedResume {
  readonly candidateName: string;
  readonly experienceYears: number | null;
  readonly skillMentions: readonly SkillMention[];
  readonly projects: readonly string[];
  readonly sections: readonly string[];
  /** Individual lines of the (normalized) resume, for line-bound references. */
  readonly lines: readonly string[];
  /** Year ranges found (e.g. 2019-2023), used for experience inference. */
  readonly dateRanges: readonly { readonly start: number; readonly end: number | null }[];
  /** Degree levels found (e.g. "Bachelor", "Master", "PhD"). */
  readonly education: readonly EducationEntry[];
  /** Structured work history with roles, companies, periods and bullets. */
  readonly experience: readonly ExperienceEntry[];
  /** Certification names found. */
  readonly certifications: readonly string[];
  /** Technology tokens mentioned (e.g. specific tools, platforms). */
  readonly technologies: readonly string[];
  /** Responsibility descriptions extracted from experience/projects. */
  readonly responsibilities: readonly string[];
}

const NAME_HINT = /(^|\n)([A-Z][A-Za-z-]+(?:\s+[A-Z][A-Za-z-]+){1,2})(\s*\n|$)/;

const YEAR_RANGE = /(20\d{2})\s*(?:[-–—~]\s*((?:20\d{2})|present|now|current))?/gi;

const EXPERIENCE =
  /\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s*(?:of)?\s*(?:hands-?on|professional|industry|working|software)?\s*(?:experience|exp)\b/gi;

const PROJECT_HEADINGS = /(projects|experience|work experience|selected work)\b/i;

/** Keyword banks mapping taxonomy skill ids to resume vocabulary. */
const SKILL_KEYWORDS: Record<string, readonly string[]> = {
  algorithms: ['algorithms', 'data structures', 'leetcode', 'dynamic programming', 'big-o', 'binary search', 'graph traversal', 'greedy', 'recursion'],
  databases: ['sql', 'postgres', 'mysql', 'database', 'nosql', 'mongodb', 'redis', 'indexing', 'normalization', 'transactions', 'data modeling'],
  backend: ['node', 'express', 'spring', 'django', 'fastapi', 'rest', 'api', 'grpc', 'backend', 'server-side', 'queues', 'microservice'],
  frontend: ['react', 'vue', 'angular', 'css', 'html', 'frontend', 'webpack', 'state management', 'accessibility', 'tailwind', 'redux'],
  cloud: ['aws', 'gcp', 'azure', 'kubernetes', 'serverless', 'lambda', 's3', 'ec2', 'rds', 'cloud'],
  devops: ['docker', 'ci/cd', 'jenkins', 'terraform', 'github actions', 'observability', 'pagerduty', 'deployment', 'kubernetes'],
  system_design: ['system design', 'architecture', 'scalability', 'distributed', 'load balancer', 'microservices', 'capacity', 'high availability'],
  data_engineering: ['pipeline', 'etl', 'spark', 'kafka', 'airflow', 'data warehouse', 'ml', 'machine learning', 'feature store', 'dbt'],
  mobile: ['android', 'ios', 'kotlin', 'swift', 'react native', 'flutter', 'mobile app'],
  security: ['owasp', 'oauth', 'jwt', 'xss', 'csrf', 'security', 'encryption', 'penetration'],
  testing: ['jest', 'cypress', 'playwright', 'tdd', 'unit test', 'integration test', 'e2e', 'coverage'],
  software_delivery: ['agile', 'scrum', 'code review', 'mentor', 'roadmap', 'cross-functional', 'stakeholder', 'sprint'],
};

/**
 * Deterministic resume → structure parser.
 *
 * It is intentionally conservative: it extracts *mentions* and *claims*, not
 * truths. Every mention later becomes a falsifiable hypothesis the interview
 * loop validates with evidence.
 */
export function parseResume(text: string, taxonomy: SkillsTaxonomy): ParsedResume {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\t/g, '  ');
  const lines = normalized.split('\n');
  const name = extractName(normalized);
  const years = extractYears(normalized);
  const dateRanges = extractDateRanges(normalized);
  const sections = normalized
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  const projects = extractProjects(normalized, sections);
  const mentions = extractSkillMentions(normalized, taxonomy);
  const education = extractEducation(lines);
  const experience = extractExperience(lines);
  const certifications = extractCertifications(lines);
  const technologies = extractTechnologies(normalized, mentions);
  const responsibilities = extractResponsibilities(normalized, projects, mentions);

  return {
    candidateName: name,
    experienceYears: years,
    skillMentions: mentions,
    projects,
    sections,
    lines,
    dateRanges,
    education,
    experience,
    certifications,
    technologies,
    responsibilities,
  };
}

function extractName(text: string): string {
  const first = text.split('\n').find((l) => l.trim().length > 0);
  if (!first) return 'Candidate';
  const m = NAME_HINT.exec(first);
  return m ? m[2] : first.trim().slice(0, 60);
}

function extractYears(text: string): number | null {
  const matches = [...text.matchAll(EXPERIENCE)];
  if (matches.length > 0) {
    return Math.max(...matches.map((m) => parseInt(m[1], 10)));
  }
  // fallback: infer from date ranges ("2019 - present" ≈ current year - 2019)
  const ranges = extractDateRanges(text);
  if (ranges.length > 0) {
    const now = new Date().getFullYear();
    const spans = ranges.map((r) => (r.end ?? now) - r.start).filter((n) => n > 0 && n < 40);
    if (spans.length > 0) return Math.max(...spans);
  }
  return null;
}

function extractDateRanges(text: string): ParsedResume['dateRanges'] {
  const ranges: { start: number; end: number | null }[] = [];
  for (const m of text.matchAll(YEAR_RANGE)) {
    const start = parseInt(m[1], 10);
    const endRaw = m[2];
    const end = endRaw && /^\d{4}$/.test(endRaw) ? parseInt(endRaw, 10) : null;
    ranges.push({ start, end });
  }
  // de-duplicate by start year
  return [...new Map(ranges.map((r) => [r.start, r])).values()];
}

function extractProjects(text: string, sections: string[]): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const projectLines: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (/^(education|skills|summary|certifications|awards)/i.test(line)) {
      inSection = false;
      continue;
    }
    if (PROJECT_HEADINGS.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^[-*•]\s+/.test(line) && line.length > 10 && line.length < 200) {
      projectLines.push(line.replace(/^[-*•]\s+/, ''));
    }
  }
  const fallback = sections.filter((s) => s.length < 160 && /(built|led|developed|created|designed)/i.test(s)).slice(0, 6);
  return [...new Set([...projectLines, ...fallback])].slice(0, 8);
}

function findWordIndex(text: string, keyword: string): number {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^a-zA-Z0-9_-])${escaped}(?:$|[^a-zA-Z0-9_-])`, 'i');
  const match = re.exec(text);
  if (!match) return -1;
  return match.index + (match[0].toLowerCase().startsWith(keyword.toLowerCase()) ? 0 : 1);
}

function extractSkillMentions(text: string, taxonomy: SkillsTaxonomy): SkillMention[] {
  const mentions: SkillMention[] = [];

  for (const skillId of Object.keys(SKILL_KEYWORDS)) {
    if (!taxonomy.get(skillId)) continue;
    for (const keyword of SKILL_KEYWORDS[skillId]) {
      const idx = findWordIndex(text, keyword);
      if (idx >= 0) {
        mentions.push({
          skillId,
          keyword,
          evidence: snippetAround(text, idx, keyword.length, 48),
          line: lineForIndex(text, idx),
        });
        break; // one mention per skill is enough to raise the hypothesis
      }
    }
  }
  return mentions;
}

/** 1-based line number for a character offset within `text`. */
export function lineForIndex(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/**
 * Label any free resume text with the taxonomy skills its vocabulary suggests.
 * Deterministic and conservative: a skill is only returned if one of its
 * keyword-bank terms literally appears. Used to bind topics/evidence to skills.
 */
export function detectSkillIds(text: string, taxonomy: SkillsTaxonomy): string[] {
  const ids: string[] = [];
  for (const skillId of Object.keys(SKILL_KEYWORDS)) {
    if (!taxonomy.get(skillId)) continue;
    for (const keyword of SKILL_KEYWORDS[skillId]) {
      if (findWordIndex(text, keyword) >= 0) {
        ids.push(skillId);
        break; // one keyword per skill is enough
      }
    }
  }
  return ids.slice(0, 6);
}

function snippetAround(text: string, index: number, length: number, radius: number): string {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

export function isKnownSkillKeyword(def: SkillDef, token: string): boolean {
  const tk = token.toLowerCase();
  return (SKILL_KEYWORDS[def.id] ?? []).some(
    (k) => k.toLowerCase().includes(tk) || tk.includes(k.toLowerCase()),
  );
}

/** Heading-ish lines that mark the start of a new resume section. */
const SECTION_HEADING =
  /^(education|skills?|summary|technologies?|experience|work experience|employment|projects?|certifications?|awards|accomplishments|leadership|open source)/i;

/**
 * Find the line span of the first section whose heading matches `heading`.
 * Returns `found: false` when no such heading exists.
 */
function findSectionSpan(lines: string[], heading: RegExp): { start: number; end: number; found: boolean } {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0 && trimmed.length < 60 && heading.test(trimmed)) {
      start = i;
      break;
    }
  }
  if (start < 0) return { start: 0, end: 0, found: false };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0 && trimmed.length < 60 && SECTION_HEADING.test(trimmed)) {
      end = i;
      break;
    }
  }
  return { start, end, found: true };
}

/** Build a line-bound source reference pointing at `lineText` on line `lineNo`. */
function sourceRefFor(lines: string[], lineNo: number, section: string): ResumeSourceRef {
  const raw = lines[lineNo - 1] ?? '';
  const excerpt = raw.trim();
  return { line: lineNo, excerpt: excerpt.length > 0 ? excerpt.slice(0, 160) : '(blank)', section };
}

/** Extract education section entries (degree, field, institution) with source refs. */
function extractEducation(lines: string[]): EducationEntry[] {
  const education: EducationEntry[] = [];
  const span = findSectionSpan(lines, /education/i);
  if (!span.found) return education;

  for (let i = span.start + 1; i < span.end; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length < 5) continue;
    const degreeMatch = trimmed.match(/(bs|ba|bachelor|master|ms|mba|phd|doctorate|degree)/i);
    if (degreeMatch) {
      let institution = '';
      let field = trimmed;
      const instMatch = trimmed.match(/(?:at|from)\s+([A-Z][a-zA-Z\s]+)/i);
      if (instMatch) {
        institution = instMatch[1].trim();
        field = trimmed.replace(instMatch[0], '').trim();
      }
      education.push({
        level: degreeMatch[1].toLowerCase(),
        field: field.replace(/[.,]/g, '').trim(),
        institution,
        source: sourceRefFor(lines, i + 1, 'education'),
      });
    }
  }
  return education;
}

/** Extract certification names. */
function extractCertifications(lines: string[]): Array<string> {
  const certs: Array<string> = [];
  const certKeywords = [
    'aws certified', 'google certified', 'microsoft certified', 'certified Scrum Master',
    'pmp', 'ciw', 'itil', 'aws solutions architect', 'google professional',
  ];
  const span = findSectionSpan(lines, /(certifications|certificates|licenses|awards)/i);
  if (!span.found) return certs;

  for (let i = span.start + 1; i < span.end; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length < 3) continue;
    for (const kw of certKeywords) {
      if (trimmed.toLowerCase().includes(kw.toLowerCase())) {
        certs.push(trimmed);
        break;
      }
    }
  }
  return certs;
}

/** Split a role header line into role / company / period (best-effort, deterministic). */
interface RoleHeader {
  readonly role: string;
  readonly company: string;
  readonly period: string;
}

const PERIOD_TAIL = /\s*[–—\-|~]\s*((?:20\d{2})(?:\s*[-–—~]\s*(?:20\d{2}|present|now|current))?)\s*$/i;

function parseRoleHeader(trimmed: string): RoleHeader | null {
  if (trimmed.length < 3) return null;
  let period = '';
  let rest = trimmed;
  const periodMatch = PERIOD_TAIL.exec(trimmed);
  if (periodMatch) {
    period = periodMatch[1].trim();
    rest = (trimmed.slice(0, periodMatch.index) + trimmed.slice(periodMatch.index + periodMatch[0].length)).trim();
    // Edge: "Role, Company — 2020 - present" the period match consumed the dash separator too.
    rest = rest.replace(/\s*[–—|~]\s*$/, '').trim();
  }

  const parts = rest.split(',').map((s) => s.trim()).filter(Boolean);
  const role = parts.shift() ?? rest;
  const company = parts.join(', ');
  if (role.length === 0) return null;
  return { role: role.slice(0, 120), company: company.slice(0, 120), period: period.slice(0, 40) };
}

/** Extract a structured work history (role / company / period / bullets) with source refs. */
function extractExperience(lines: string[]): ExperienceEntry[] {
  const span = findSectionSpan(lines, /^(experience|work experience|employment|professional experience|career)\b/i);
  if (!span.found) return [];

  const entries: ExperienceEntry[] = [];
  let current: { header: RoleHeader; bullets: string[]; line: number } | null = null;

  const flush = (): void => {
    if (!current) return;
    const { header, bullets, line } = current;
    const period = header.period;
    entries.push({
      role: header.role,
      company: header.company,
      period,
      employmentType: /intern|internship|co-op|coop/i.test(header.role) ? 'internship' : 'employment',
      bullets,
      source: sourceRefFor(lines, line, 'experience'),
    });
    current = null;
  };

  for (let i = span.start + 1; i < span.end; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const bullet = /^[-*•]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      if (current) {
        // Greedy but safe: take the most descriptive slice of the bullet.
        const text = bullet[1].trim();
        if (text.length >= 8) current.bullets.push(text);
      }
      continue;
    }
    // A non-bullet line is a new role header (role, company — period).
    const header = parseRoleHeader(trimmed);
    if (header && !/^(skills|projects|education|summary|certifications)/i.test(trimmed)) {
      flush();
      current = { header, bullets: [], line: i + 1 };
    }
  }
  flush();
  return entries;
}

/** Extract technology tokens from skill mentions and resume text. */
function extractTechnologies(text: string, mentions: SkillMention[]): ParsedResume['technologies'] {
  const techSet = new Set<string>();
  const allText = text.toLowerCase();

  // From explicit skill mentions
  for (const mention of mentions) {
    const def = SKILL_KEYWORDS[mention.skillId];
    if (def) {
      for (const kw of def) {
        if (allText.includes(kw.toLowerCase())) {
          techSet.add(kw);
        }
      }
    }
  }

  // Additional common tech keywords beyond the skill taxonomy
  const extraTech = [
    'linux', 'windows', 'macos', 'docker', 'kubernetes', 'jenkins', 'github actions',
    'git', 'bitbucket', 'gitlab', 'jira', 'confluence', 'sonar', 'nexus', 'artifactory',
    'postman', 'swagger', 'openapi', 'rest api', 'graphql', 'grpc',
    'nginx', 'apache', 'iis', 'tomcat', 'weblogic', 'jboss',
    'postgresql', 'mysql', 'mariadb', 'redis', 'mongodb', 'dynamodb', 'cassandra',
    'kafka', 'rabbitmq', 'sqs', 'redis', 'elasticsearch', 'solr',
    'jenkins', 'circleci', 'github actions', 'gitlab ci', 'azure devops', 'gitlab ci',
    'aws', 'gcp', 'azure', 'docker', 'kubernetes', 'openshift',
    'linux', 'windows', 'macos', 'ubuntu', 'centos',
    'visual studio', 'vs code', 'intelliJ', 'eclipse', 'pyCharm',
    'jenkins', 'circleci', 'travis ci', 'github actions',
    'swagger', 'openapi', 'postman',
  ];

  for (const token of extraTech) {
    if (allText.includes(token.toLowerCase())) {
      techSet.add(token);
    }
  }

  return [...techSet];
}

/** Extract responsibility descriptions from experience and project text. */
function extractResponsibilities(text: string, projects: string[], mentions: SkillMention[]): Array<string> {
  const respSet = new Set<string>();

  // From project descriptions - look for action-oriented sentences
  const allProjects = [...projects];
  // Also look at first few lines of experience-like sections
  const experienceLines = text.split('\n')
    .filter((l) => /(experience|work experience|employment)/i.test(l) || l.trim().length > 80)
    .slice(0, 10);

  const responsibilityPatterns = [
    /i (built|designed|led|shipped|developed|created|owned|architected)/i,
    /we (built|shipped|deployed|rolled out)/i,
    /responsible for/i,
    /role was to/i,
    /duties included/i,
  ];

  // From projects
  for (const project of allProjects) {
    if (project.length > 10) {
      // Check for responsibility patterns
      for (const pattern of responsibilityPatterns) {
        const matches = project.match(pattern);
        if (matches) {
          respSet.add(matches[0]);
        }
      }
      // Also add the project itself if it's descriptive enough
      if (project.split(' ').length > 8) {
        respSet.add(project);
      }
    }
  }

  // From experience text patterns
  for (const line of experienceLines) {
    const trimmed = line.trim();
    if (trimmed.length > 20) {
      for (const pattern of responsibilityPatterns) {
        if (pattern.test(trimmed)) {
          respSet.add(trimmed);
          break;
        }
      }
    }
  }

  // From skill mentions evidence
  for (const mention of mentions) {
    const evLower = mention.evidence.toLowerCase();
    if (evLower.length > 20) {
      respSet.add(mention.evidence);
    }
  }

  return [...respSet];
}
