import type { CandidateProfile } from '../types.js';

export type CareerRoleId = 'backend' | 'frontend' | 'data' | 'fullstack';
export type CareerPathConfidence = 'high' | 'medium' | 'low';

export interface CareerPathRecommendation {
  readonly recommendedRoleId: CareerRoleId;
  readonly title: string;
  readonly confidence: CareerPathConfidence;
  readonly rationale: string;
  readonly evidence: readonly string[];
  readonly relatedRoles: readonly { readonly roleId: CareerRoleId; readonly title: string }[];
  readonly needsClarification: boolean;
  readonly clarificationPrompt?: string;
}

const ROLE_TITLES: Record<CareerRoleId, string> = {
  backend: 'Backend Engineer',
  frontend: 'Frontend Engineer',
  data: 'Data & ML Engineer',
  fullstack: 'Full-Stack Engineer',
};

const SIGNALS: Record<Exclude<CareerRoleId, 'fullstack'>, readonly { label: string; pattern: RegExp; weight: number }[]> = {
  frontend: [
    { label: 'Frontend experience or role title', pattern: /front[ -]?end|ui engineer|web interface/i, weight: 2.5 },
    { label: 'React, Vue or Angular experience', pattern: /\breact(?:\.js)?\b|\bvue(?:\.js)?\b|\bangular\b/i, weight: 2 },
    { label: 'Browser interface technologies', pattern: /\bhtml\b|\bcss\b|\baccessibility\b|\bdesign system\b/i, weight: 1.2 },
    { label: 'Web application delivery', pattern: /web application|web app|user interface|\bui\b/i, weight: 1.2 },
    { label: 'Frontend engineering skill', pattern: /$^/, weight: 3 },
  ],
  backend: [
    { label: 'Backend or API experience', pattern: /back[ -]?end|\bapi[s]?\b|server[- ]side|microservices?/i, weight: 2 },
    { label: 'Server-side engineering role', pattern: /backend|back-end|platform engineer|server engineer/i, weight: 2.5 },
    { label: 'Backend engineering skill', pattern: /$^/, weight: 3 },
    { label: 'Server and database technologies', pattern: /\bnode(?:\.js)?\b|\bjava\b|\bgo\b|\brust\b|\bpostgres(?:ql)?\b|\bredis\b|\bspring\b/i, weight: 1.2 },
  ],
  data: [
    { label: 'AI, machine learning or data science work', pattern: /machine learning|\bml\b|\bartificial intelligence\b|\bdata science\b|\bdeep learning\b|\bllm\b/i, weight: 2.5 },
    { label: 'Data or ML engineering role', pattern: /data engineer|machine learning engineer|ml engineer|data scientist|ai engineer/i, weight: 2.5 },
    { label: 'Data engineering and ML skill', pattern: /$^/, weight: 3 },
    { label: 'Data platform or model technologies', pattern: /\bpython\b|\bspark\b|\bpytorch\b|\btensorflow\b|\bscikit-learn\b|\bdbt\b|\bairflow\b/i, weight: 1.4 },
    { label: 'Analytics, modeling or data pipelines', pattern: /analytics|recommendation system|feature engineering|data pipeline|predictive model|model training/i, weight: 1.5 },
  ],
};

/**
 * Derives a tentative interview direction from evidence in the uploaded resume.
 * The result is a recommendation, never a claim that a candidate has a skill.
 */
export class CareerPathDetector {
  detect(profile: CandidateProfile, resumeText: string): CareerPathRecommendation {
    const source = [
      resumeText,
      ...profile.experience.map((entry) => `${entry.role} ${entry.company} ${entry.bullets.join(' ')}`),
      ...profile.projects,
      ...profile.responsibilities,
      ...profile.technologies,
    ].join('\n');
    const lower = source.toLowerCase();
    const matchedSkills = new Set(profile.skills.map((skill) => skill.skillId));
    const evidence: Record<CareerRoleId, string[]> = { backend: [], frontend: [], data: [], fullstack: [] };
    const scores: Record<CareerRoleId, number> = { backend: 0, frontend: 0, data: 0, fullstack: 0 };

    for (const roleId of ['backend', 'frontend', 'data'] as const) {
      for (const signal of SIGNALS[roleId]) {
        if (signal.pattern.source === '$^') {
          const skillId = roleId === 'data' ? 'data_engineering' : roleId;
          if (matchedSkills.has(skillId)) {
            scores[roleId] += signal.weight;
            evidence[roleId].push(signal.label);
          }
        } else if (signal.pattern.test(lower)) {
          scores[roleId] += signal.weight;
          evidence[roleId].push(signal.label);
        }
      }
    }

    // A resume showing substantial evidence in both UI and server work is a
    // better full-stack match than forcing it into either specialist bucket.
    if (scores.frontend >= 2.5 && scores.backend >= 2.5) {
      scores.fullstack = Math.min(scores.frontend, scores.backend) + 1;
      evidence.fullstack = ['Frontend and backend experience both appear in the resume'];
    }

    const ranked = (Object.keys(ROLE_TITLES) as CareerRoleId[])
      .map((roleId) => ({ roleId, score: scores[roleId] }))
      .sort((a, b) => b.score - a.score || a.roleId.localeCompare(b.roleId));
    const best = ranked[0];
    const runnerUp = ranked[1];
    const margin = best.score - runnerUp.score;
    const confidence: CareerPathConfidence = best.score >= 4.5 && margin >= 1.5
      ? 'high'
      : best.score >= 3 && margin >= 0.75
        ? 'medium'
        : 'low';
    const needsClarification = confidence === 'low' || margin < 1.5;
    const basis = evidence[best.roleId];

    return {
      recommendedRoleId: best.roleId,
      title: ROLE_TITLES[best.roleId],
      confidence,
      rationale: basis.length
        ? `This direction is suggested by ${basis.join(', ').toLowerCase()}. Resume signals are preliminary and will be validated in the interview.`
        : 'The resume does not contain enough role-specific evidence for a reliable recommendation.',
      evidence: basis,
      relatedRoles: ranked.slice(0, 3).map(({ roleId }) => ({ roleId, title: ROLE_TITLES[roleId] })),
      needsClarification,
      ...(needsClarification ? { clarificationPrompt: 'Your resume could fit more than one direction. Which role should we tailor this interview toward?' } : {}),
    };
  }
}
