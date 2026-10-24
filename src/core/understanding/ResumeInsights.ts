import type { CandidateProfile, ExperienceEntry, ResumeSourceRef } from '../types.js';

export interface ResumeEvidenceLine {
  readonly text: string;
  readonly source: ResumeSourceRef;
}

export interface ResumeInsights {
  readonly internships: readonly ExperienceEntry[];
  readonly technologies: readonly string[];
  readonly domainKnowledge: readonly string[];
  readonly communicationEvidence: readonly ResumeEvidenceLine[];
  readonly leadershipEvidence: readonly ResumeEvidenceLine[];
  readonly validationAreas: readonly { readonly topic: string; readonly rationale: string; readonly source: ResumeSourceRef }[];
}

const DOMAINS: readonly { label: string; pattern: RegExp }[] = [
  { label: 'finance and payments', pattern: /payment|fintech|banking|ledger|transaction|reconciliation/i },
  { label: 'healthcare', pattern: /healthcare|clinical|patient|medical|pharma/i },
  { label: 'e-commerce and retail', pattern: /e-?commerce|retail|marketplace|catalog|recommendation system/i },
  { label: 'education', pattern: /education|learning platform|student|curriculum/i },
  { label: 'data and analytics', pattern: /data science|analytics|business intelligence|machine learning|\bAI\b|\bML\b/i },
  { label: 'infrastructure and reliability', pattern: /infrastructure|platform engineering|reliability|\bSRE\b|cloud native/i },
  { label: 'security', pattern: /cybersecurity|information security|threat model|vulnerability/i },
];

const COMMUNICATION = /presented|presentation|communicat|stakeholder|cross-functional|collaborat|documented|authored|facilitated|customer-facing/i;
const LEADERSHIP = /led\b|leadership|mentored|managed\b|coached|spearheaded|owned\b|roadmap|directed/i;

/** Extracts conservative, line-bound resume signals for the profile review UI. */
export function extractResumeInsights(profile: CandidateProfile, resumeText: string): ResumeInsights {
  const lines = resumeText.replace(/\r\n/g, '\n').split('\n');
  const evidenceLines = (pattern: RegExp): ResumeEvidenceLine[] => lines.flatMap((line, index) => {
    const text = line.trim();
    return text.length > 0 && pattern.test(text)
      ? [{ text, source: { line: index + 1, excerpt: text.slice(0, 160), section: 'resume' } }]
      : [];
  });
  const lower = resumeText.toLowerCase();

  return {
    internships: profile.experience.filter((entry) => entry.employmentType === 'internship'),
    technologies: profile.technologies,
    domainKnowledge: DOMAINS.filter(({ pattern }) => pattern.test(lower)).map(({ label }) => label),
    communicationEvidence: evidenceLines(COMMUNICATION).slice(0, 8),
    leadershipEvidence: evidenceLines(LEADERSHIP).slice(0, 8),
    validationAreas: profile.potentialInterviewTopics.map(({ topic, rationale, source }) => ({ topic, rationale, source })),
  };
}
