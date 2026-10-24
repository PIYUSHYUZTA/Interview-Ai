import type { CandidateProfile, RoleRequirement, SessionConfig } from '../core/types.js';
import { ProfileBuilder } from '../core/understanding/ProfileBuilder.js';

export const STRONG_RESUME = `Alex Morgan
Senior Backend Engineer
alex.morgan@example.com

SUMMARY
Backend engineer with 6 years of hands-on experience designing and scaling
high-traffic services in Node.js and PostgreSQL.

EXPERIENCE
Senior Backend Engineer, Fintech Co — 2022 - present
- Led design and delivery of an idempotent payments API (Express, Redis).
- Scaled Postgres from 2M to 40M rows; introduced partitioning and indexing.
- Built a Kafka-based event pipeline for audit and analytics.
- Mentored 3 engineers; ran code reviews and roadmap planning for the team.

Backend Engineer, SaaS Labs — 2019 - 2022
- Built REST APIs and a queue-based job system (Node.js, RabbitMQ).
- Improved CI/CD with GitHub Actions and Docker; cut deploys to 10 minutes.
- Introduced unit and integration testing (Jest), raising coverage to 85%.

PROJECTS
- Payments audit service: real-time transaction ledger with idempotency.
- Insights pipeline: ETL with Apache Spark and dbt modeling.
`;

export const WEAK_RESUME = `Sam Rivera
Software Developer

SUMMARY
Developer with 1 year of experience, mostly doing frontend styling and fixing
small bugs. Looking for an opportunity to grow in backend work.

EXPERIENCE
Junior Developer, Small Agency — 2023 - present
- Fixed HTML/CSS issues on marketing websites.
- Used a little bit of SQL to update content in a database.
- Made small React changes; didn't touch production infra.

PROJECTS
- Learned some React and TypeScript from tutorials.
`;

/** Resume whose core claim is the canonical ML recommendation-system example. */
export const ML_RESUME = `Priya Patel
Machine Learning Engineer

SUMMARY
ML engineer with 3 years of experience building and shipping recommendation
and ranking systems in Python.

EXPERIENCE
Machine Learning Engineer, ShopCo — 2021 - present
- Built a machine-learning recommendation system that suggests products.
- Ran offline evaluation on historical logs before every rollout.

PROJECTS
- Recommendation system: collaborative filtering on purchase history.
`;

export function buildProfile(resume: string, nameOverride?: string): CandidateProfile {
  return new ProfileBuilder().build({ resumeText: resume, candidateNameOverride: nameOverride });
}

/** A demanding backend/SRE-flavored role used to expose knowledge gaps. */
export function backendRole(): RoleRequirement {
  return {
    title: 'Senior Backend Engineer',
    stackNotes: 'Node.js/TypeScript, PostgreSQL, Redis, AWS, Kafka',
    skills: [
      { skillId: 'backend', weight: 1.0, requiredLevel: 'senior' },
      { skillId: 'databases', weight: 0.9, requiredLevel: 'senior' },
      { skillId: 'system_design', weight: 0.7, requiredLevel: 'mid' },
      { skillId: 'algorithms', weight: 0.5, requiredLevel: 'mid' },
      { skillId: 'cloud', weight: 0.4, requiredLevel: 'junior' },
      { skillId: 'security', weight: 0.3, requiredLevel: 'junior' },
    ],
    softRequirements: ['clear communication', 'trade-off reasoning'],
  };
}

export function sessionConfig(profile: CandidateProfile, role: RoleRequirement): SessionConfig {
  return {
    role,
    profile,
    numRounds: 2,
    roundConfig: { questionBudget: 4, maxSameSkillInRow: 2 },
    adaptationParams: { requirementBias: 0.5, gapBias: 0.5 },
  };
}