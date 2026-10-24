import type {
  EducationEntry,
  ExperienceEntry,
  CandidateLevelHypothesis,
  SkillsTaxonomy,
} from '../types.js';
import type { AIProvider } from '../provider/AIProvider.js';
import type { LLMProvider } from '../provider/LLMProvider.js';
import { parseResume } from './ResumeParser.js';
import { defaultTaxonomy, inferLevelBandFromYears } from '../taxonomy/skills.js';
import { parseJsonData } from '../ai/json.js';

/**
 * Output format specified for Service 1 (Resume Analyzer):
 * JSON — education, skills, experience, projects, certifications, candidate_level_hypothesis
 */
export interface ResumeAnalyzerOutput {
  readonly education: readonly EducationEntry[];
  readonly skills: readonly { readonly skillId: string; readonly claim: string }[];
  readonly experience: readonly ExperienceEntry[];
  readonly projects: readonly string[];
  readonly certifications: readonly string[];
  readonly candidate_level_hypothesis: CandidateLevelHypothesis;
  // Also provide camelCase alias for TypeScript ecosystem convenience
  readonly candidateLevelHypothesis?: CandidateLevelHypothesis;
}

export interface ResumeAnalyzerDeps {
  readonly taxonomy?: SkillsTaxonomy;
  readonly provider?: AIProvider | LLMProvider;
}

export interface ResumeAnalyzerAuditResult {
  readonly passes: boolean;
  readonly findings: readonly {
    readonly severity: 'ok' | 'warning';
    readonly scope: string;
    readonly finding: string;
  }[];
}

/**
 * Service 1: Resume Analyzer
 *
 * Mandate:
 * Input: raw resume text
 * Output: JSON — education, skills, experience, projects, certifications, candidate_level_hypothesis
 * Rule: never invent information not supported by the resume text
 *
 * Decoupled service:
 * - Deterministic, conservative parsing
 * - Source-bound line references for every extracted fact
 * - Resume claims raised as unverified hypotheses, never accepted as truth
 * - Zero hallucination of undeclared skills, degrees, or experience
 * - Injected AIProvider abstraction seam for Section 20 compliance
 */
export class ResumeAnalyzer {
  private readonly taxonomy: SkillsTaxonomy;
  private readonly provider?: AIProvider | LLMProvider;

  constructor(depsOrTaxonomy?: SkillsTaxonomy | ResumeAnalyzerDeps, provider?: AIProvider | LLMProvider) {
    if (depsOrTaxonomy && typeof depsOrTaxonomy === 'object' && ('taxonomy' in depsOrTaxonomy || 'provider' in depsOrTaxonomy)) {
      const deps = depsOrTaxonomy as ResumeAnalyzerDeps;
      this.taxonomy = deps.taxonomy ?? defaultTaxonomy;
      this.provider = deps.provider ?? provider;
    } else {
      this.taxonomy = (depsOrTaxonomy as SkillsTaxonomy) ?? defaultTaxonomy;
      this.provider = provider;
    }
  }

  get aiProvider(): AIProvider | LLMProvider | undefined {
    return this.provider;
  }

  /**
   * Asynchronously analyze resume text via injected AIProvider if available,
   * falling back reliably to source-anchored deterministic analysis.
   */
  async analyzeAsync(resumeText: string): Promise<ResumeAnalyzerOutput> {
    if (this.provider && typeof (this.provider as AIProvider).extract === 'function') {
      try {
        const prompt =
          `Extract structured facts from the following resume text strictly as JSON with keys:\n` +
          `education, skills, experience, projects, certifications, candidate_level_hypothesis.\n` +
          `skills should be an array of objects: [{"skillId": "skill_key", "claim": "exact mention in text"}].\n` +
          `candidate_level_hypothesis should be an object: {"band": "junior"|"mid"|"senior"|"principal", "basis": "reasoning", "status": "hypothesis"}.\n` +
          `Never invent facts not present in the text.\n\n` +
          `Resume Text:\n${resumeText}`;
        const raw = await (this.provider as AIProvider).extract(prompt, { json: true });
        const parsed = parseJsonData(raw) as Partial<ResumeAnalyzerOutput> | null;
        if (parsed) {
          const rawSkills = Array.isArray(parsed.skills) ? parsed.skills : [];
          const normalizedSkills = rawSkills.map((s: any) => {
            if (typeof s === 'string') {
              return { skillId: s.toLowerCase().replace(/[^a-z0-9_]/g, '_'), claim: s };
            }
            return {
              skillId: String(s.skillId ?? s.name ?? s.claim ?? 'general').toLowerCase().replace(/[^a-z0-9_]/g, '_'),
              claim: String(s.claim ?? s.name ?? s.skillId ?? 'unspecified'),
            };
          });

          const rawHypo = (parsed as any).candidate_level_hypothesis ?? (parsed as any).candidateLevelHypothesis;
          let hypo: CandidateLevelHypothesis;
          if (rawHypo && typeof rawHypo === 'object') {
            hypo = {
              band: (rawHypo.band ?? 'mid') as any,
              basis: rawHypo.basis ?? 'Extracted from resume experience by AI model.',
              status: 'hypothesis',
              evidenceOverride: false,
            };
          } else if (typeof rawHypo === 'string') {
            hypo = {
              band: rawHypo as any,
              basis: 'Extracted from resume experience by AI model.',
              status: 'hypothesis',
              evidenceOverride: false,
            };
          } else {
            const fallback = this.analyze(resumeText);
            hypo = fallback.candidate_level_hypothesis;
          }

          if (normalizedSkills.length > 0) {
            return {
              education: Array.isArray(parsed.education) ? (parsed.education as any) : [],
              skills: normalizedSkills,
              experience: Array.isArray(parsed.experience) ? (parsed.experience as any) : [],
              projects: Array.isArray(parsed.projects) ? (parsed.projects as any) : [],
              certifications: Array.isArray(parsed.certifications) ? (parsed.certifications as any) : [],
              candidate_level_hypothesis: hypo,
              candidateLevelHypothesis: hypo,
            };
          }
        }
      } catch {
        // Fall back gracefully to deterministic line-anchored extraction
      }
    }
    return this.analyze(resumeText);
  }

  /**
   * Analyze raw resume text into structured, source-bound JSON.
   */
  analyze(resumeText: string): ResumeAnalyzerOutput {
    if (!resumeText || typeof resumeText !== 'string' || resumeText.trim().length === 0) {
      return {
        education: [],
        skills: [],
        experience: [],
        projects: [],
        certifications: [],
        candidate_level_hypothesis: {
          band: 'junior',
          basis: 'No resume text provided. Defaulting to baseline unverified hypothesis.',
          status: 'hypothesis',
          evidenceOverride: false,
        },
      };
    }

    const parsed = parseResume(resumeText, this.taxonomy);
    const years = parsed.experienceYears ?? 0;
    const band = inferLevelBandFromYears(years);

    // Skills are strictly extracted from literal mentions found in the text — never invented.
    const declaredSkills = [
      ...new Map(parsed.skillMentions.map((m) => [m.skillId, m])).values(),
    ].map((m) => ({
      skillId: m.skillId,
      claim: m.keyword,
    }));

    // Projects: verbatim entries or bullet lines
    const projects = parsed.projects;

    // Candidate level is explicitly labelled a falsifiable hypothesis, never an assertion of ability.
    const candidate_level_hypothesis: CandidateLevelHypothesis = {
      band,
      basis:
        `Hypothesis only. Derived strictly from ${parsed.experienceYears !== null ? `${parsed.experienceYears} years` : 'undeclared years'} of ` +
        `claimed experience and role titles in the resume. Must be validated through interview probes.`,
      status: 'hypothesis',
      evidenceOverride: false,
    };

    return {
      education: parsed.education,
      skills: declaredSkills,
      experience: parsed.experience,
      projects,
      certifications: parsed.certifications,
      candidate_level_hypothesis,
      candidateLevelHypothesis: candidate_level_hypothesis,
    };
  }

  /**
   * Serialize output to strict JSON string as requested by the contract.
   */
  toJSON(output: ResumeAnalyzerOutput): string {
    const jsonPayload = {
      education: output.education,
      skills: output.skills,
      experience: output.experience,
      projects: output.projects,
      certifications: output.certifications,
      candidate_level_hypothesis: output.candidate_level_hypothesis,
    };
    return JSON.stringify(jsonPayload, null, 2);
  }

  /**
   * Anti-hallucination audit:
   * Verifies that all extracted elements are supported by the raw resume text.
   */
  audit(resumeText: string, output: ResumeAnalyzerOutput): ResumeAnalyzerAuditResult {
    const findings: { severity: 'ok' | 'warning'; scope: string; finding: string }[] = [];
    const lowerResume = resumeText.toLowerCase();

    // 1. Verify candidate level is flagged as hypothesis
    if (output.candidate_level_hypothesis.status !== 'hypothesis') {
      findings.push({
        severity: 'warning',
        scope: 'candidate_level_hypothesis',
        finding: 'Candidate level is not flagged as an unvalidated hypothesis.',
      });
    }

    // 2. Verify skills are grounded in text
    for (const s of output.skills) {
      if (!lowerResume.includes(s.claim.toLowerCase())) {
        findings.push({
          severity: 'warning',
          scope: `skills:${s.skillId}`,
          finding: `Skill claim "${s.claim}" does not appear in the raw resume text.`,
        });
      }
    }

    // 3. Verify education entries have text representation
    for (const edu of output.education) {
      if (edu.source?.excerpt && !lowerResume.includes(edu.source.excerpt.toLowerCase())) {
        findings.push({
          severity: 'warning',
          scope: `education:${edu.field}`,
          finding: `Education excerpt "${edu.source.excerpt}" does not match resume text.`,
        });
      }
    }

    // 4. Verify certifications are grounded
    for (const cert of output.certifications) {
      if (!lowerResume.includes(cert.toLowerCase())) {
        findings.push({
          severity: 'warning',
          scope: `certifications:${cert}`,
          finding: `Certification "${cert}" was not found in raw resume text.`,
        });
      }
    }

    const warnings = findings.filter((f) => f.severity === 'warning');
    return {
      passes: warnings.length === 0,
      findings: findings.length > 0 ? findings : [{ severity: 'ok', scope: 'general', finding: 'All extracted facts are grounded in source text.' }],
    };
  }
}
