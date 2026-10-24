import type { CandidateLevelHypothesis, CandidateProfile, Claim, LevelBand, ResumeSourceRef, SkillsTaxonomy } from '../types.js';
import { defaultTaxonomy, inferLevelBandFromYears } from '../taxonomy/skills.js';
import { parseResume, type ParsedResume } from './ResumeParser.js';
import { brief, TopicInferenceEngine } from './TopicInferenceEngine.js';

export interface ProfileBuildInput {
  readonly resumeText: string;
  readonly candidateNameOverride?: string;
  readonly levelBandOverride?: LevelBand;
}

export interface ClaimExtractor {
  /** Turn a parsed resume into falsifiable hypotheses (claims). */
  extractClaims(parsed: ParsedResume, taxonomy: SkillsTaxonomy): Claim[];
}

/** Deterministic claim extractor: each resume assertion becomes a hypothesis. */
export class DefaultClaimExtractor implements ClaimExtractor {
  extractClaims(parsed: ParsedResume, taxonomy: SkillsTaxonomy): Claim[] {
    const claims: Claim[] = [];
    let seq = 0;

    if (parsed.experienceYears != null) {
      claims.push({
        id: `claim-${seq++}`,
        text: `Reports ${parsed.experienceYears} years of professional experience.`,
        source: 'resume',
        sourceRef: findLineRef(parsed.lines, new RegExp(`${parsed.experienceYears}\\s*years?`)) ?? { line: 1, excerpt: '(years claim)', section: 'summary' },
        skillIds: [],
        weight: 1,
        verdict: 'unverified',
        evidenceIds: [],
      });
    }

    for (const mention of parsed.skillMentions) {
      const def = taxonomy.get(mention.skillId);
      if (!def) continue;
      claims.push({
        id: `claim-${seq++}`,
        text: `Claims proficiency in ${def.label} (mention "${mention.keyword}"): "…${mention.evidence}…".`,
        source: 'resume',
        sourceRef: { line: mention.line, excerpt: mention.evidence, section: 'skills' },
        skillIds: [mention.skillId],
        weight: 0.8,
        verdict: 'unverified',
        evidenceIds: [],
      });
    }

    for (const project of parsed.projects) {
      claims.push({
        id: `claim-${seq++}`,
        text: `Hands-on project claim: "${project}".`,
        source: 'resume',
        sourceRef: findLineRef(parsed.lines, project.slice(0, 60)) ?? { line: 1, excerpt: project, section: 'projects' },
        skillIds: [],
        weight: 0.6,
        verdict: 'unverified',
        evidenceIds: [],
      });
    }

    return claims;
  }
}

/** Find the 1-based line + verbatim excerpt where `pattern` matches in `lines`. */
function findLineRef(lines: readonly string[], pattern: string | RegExp): { line: number; excerpt: string; section: string } | undefined {
  const needle = typeof pattern === 'string' ? (line: string) => line.includes(pattern) : (line: string) => pattern.test(line);
  for (let i = 0; i < lines.length; i++) {
    if (needle(lines[i])) {
      const excerpt = lines[i].trim();
      return { line: i + 1, excerpt: excerpt.slice(0, 160) || '(blank)', section: 'resume' };
    }
  }
  return undefined;
}

/**
 * UNDERSTAND layer entry point: resume text → structured candidate profile.
 *
 * The profile intentionally *asserts nothing*: every resume statement becomes a
 * Claim (hypothesis) with verdict `unverified`. The interview loop resolves
 * them only via evidence.
 */
export class ProfileBuilder {
  constructor(
    private readonly taxonomy: SkillsTaxonomy = defaultTaxonomy,
    private readonly claimExtractor: ClaimExtractor = new DefaultClaimExtractor(),
    private readonly topicEngine: TopicInferenceEngine = new TopicInferenceEngine(),
  ) {}

  build(input: ProfileBuildInput): CandidateProfile {
    const parsed = parseResume(input.resumeText, this.taxonomy);
    const name = input.candidateNameOverride ?? parsed.candidateName;
    const years = parsed.experienceYears ?? 0;
    const levelBand = input.levelBandOverride ?? inferLevelBandFromYears(years);
    const claims = this.claimExtractor.extractClaims(parsed, this.taxonomy);

    const declaredSkills = [
      ...new Map(parsed.skillMentions.map((m) => [m.skillId, m])).values(),
    ].map((m) => ({ skillId: m.skillId, claim: m.keyword }));

    const projectDefs = parsed.projects.map((p) => `• ${p}`);

    // Candidate-level estimate is an explicit HYPOTHESIS, never a fact.
    const candidateLevelHypothesis: CandidateLevelHypothesis = {
      band: levelBand ?? 'mid',
      basis:
        `Hypothesis only. Derived from ${parsed.experienceYears ?? 'an undeclared number of'} years of ` +
        `experience and the role titles on the resume. Must be validated (or refuted) by interview evidence.`,
      status: 'hypothesis',
      evidenceOverride: false,
    };

    const lines = input.resumeText.replace(/\r\n/g, '\n').split('\n');

    // Interrogation agenda: topics the interview should probe. Every topic is an
    // open probe bound to a source line — never an assertion about skill.
    const potentialInterviewTopics = this.topicEngine.infer({
      lines,
      mentions: parsed.skillMentions,
      projects: parsed.projects,
      experience: parsed.experience,
    });

    // Line-bound evidence references aggregated from every extractor.
    const evidenceSourceReferences = this.aggregateSourceRefs(parsed, lines);

    const notes = [
      `Parsed ${parsed.skillMentions.length} skill mentions across ${this.taxonomy.list().length} taxonomy skills.`,
      `Experience: ${parsed.experienceYears ?? 'not stated'} years → band guess "${levelBand}" (evidence will override).`,
      `${claims.length} falsifiable claims registered for evidence resolution.`,
      `Experience entries: ${parsed.experience.length}.`,
      `Projects extracted: ${parsed.projects.length}.`,
      `Education entries: ${parsed.education.length}.`,
      `Certifications found: ${parsed.certifications.length}.`,
      `Technologies identified: ${parsed.technologies.length}.`,
      `Responsibility descriptions: ${parsed.responsibilities.length}.`,
      `${potentialInterviewTopics.length} probe topics derived — each must be validated via interview evidence.`,
      `Anti-hallucination: all topics/claims are hypotheses; nothing is assumed from the resume alone.`,
    ];

    return {
      candidateName: name,
      skills: declaredSkills,
      experienceYears: years,
      levelBand,
      education: parsed.education,
      experience: parsed.experience,
      projects: projectDefs,
      certifications: parsed.certifications,
      technologies: parsed.technologies,
      responsibilities: parsed.responsibilities,
      claims,
      notes,
      candidateLevelHypothesis,
      potentialInterviewTopics,
      evidenceSourceReferences,
    };
  }

  private aggregateSourceRefs(parsed: ParsedResume, lines: readonly string[]): readonly ResumeSourceRef[] {
    const refs: ResumeSourceRef[] = [];

    for (const mention of parsed.skillMentions) {
      refs.push({ line: mention.line, excerpt: brief(mention.evidence), section: 'skills' });
    }
    for (const entry of parsed.experience) {
      refs.push(entry.source);
    }
    for (const edu of parsed.education) {
      if (edu.source) refs.push(edu.source);
    }
    for (const project of parsed.projects) {
      const line = lines.findIndex((l) => l.includes(project.slice(0, 60)));
      if (line >= 0) {
        refs.push({ line: line + 1, excerpt: brief(project), section: 'projects' });
      }
    }
    if (refs.length === 0) {
      refs.push({ line: 1, excerpt: '(unstructured resume)', section: 'entire' });
    }

    const seen = new Set<string>();
    const unique = refs.filter((r) => {
      const key = `${r.line}|${r.section ?? ''}|${r.excerpt.slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return unique.slice(0, 16);
  }
}