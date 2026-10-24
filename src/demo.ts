/**
 * Offline demo of the full intelligence loop.
 *
 * Run with:  npm run demo
 *
 * Builds a candidate profile from a resume, simulates a candidate with known
 * true abilities, performs a 2-round adaptive interview against a demanding
 * Senior Backend role, and prints the evidence-backed assessment.
 */
import { DeterministicProvider } from './core/provider/DeterministicProvider.js';
import { AssessmentOrchestrator } from './core/orchestrator/AssessmentOrchestrator.js';
import { CandidateSimulator } from './simulation/CandidateSimulator.js';
import { buildProfile, STRONG_RESUME } from './testSupport/fixtures.js';
import { JobRequirementIntelligence } from './core/jobs/JobRequirementIntelligence.js';
import { InterviewPlanner } from './core/planner/InterviewPlanner.js';

async function main(): Promise<void> {
  const provider = new DeterministicProvider();
  const profile = buildProfile(STRONG_RESUME);

  // ──────────────────────────────────────────────────────────────────────────
  // 5. JOB REQUIREMENT INTELLIGENCE (Module 5)
  // Parse an optional Job Description + Company Expectations, extract signals,
  // compare Candidate Profile against Role Requirements, and produce gaps/targets.
  // ──────────────────────────────────────────────────────────────────────────
  const jobIntelligence = new JobRequirementIntelligence();
  const sampleJobDescription = `
Senior Backend & Cloud Engineer

About the Team & Culture:
We expect high engineering ownership, collaborative system design, and rigorous production standards.

Responsibilities:
- Architect and scale distributed backend APIs and event-driven microservices
- Manage cloud infrastructure, container orchestration, and CI/CD pipelines
- Maintain database performance, indexing, and transactional integrity

Requirements:
- Strong experience with Node.js, TypeScript, and REST/gRPC APIs
- Deep understanding of databases (PostgreSQL, Redis) and backend architecture
- Hands-on experience with Cloud infrastructure (AWS), Docker, and Kubernetes
- 5+ years of software engineering experience

Preferred:
- Experience with DevOps practices, Terraform, and system monitoring

Technologies:
Node.js, TypeScript, PostgreSQL, Redis, AWS, Docker, Kubernetes, Terraform

Problem-Solving & Domain:
Distributed system design, high availability, performance tuning, fintech payments
`;

  const gapOutput = jobIntelligence.analyze({
    jobDescription: sampleJobDescription,
    companyExpectations: ['High Ownership', 'Production Reliability', 'Technical Mentorship'],
  });

  const comparison = jobIntelligence.compare({
    profile,
    role: gapOutput,
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. INTERVIEW PLANNER (Module 6)
  // Dynamically decide required rounds, order, target skills, difficulty ranges,
  // question types, candidate/role-specific topics, and validation areas.
  // ──────────────────────────────────────────────────────────────────────────
  const planner = new InterviewPlanner();
  const interviewPlan = planner.plan({
    profile,
    role: gapOutput,
    comparison,
  }, { requiredRounds: ['hr_intro', 'technical'], questionsPerRound: 4 });

  const config = {
    interviewPlan,
    role: gapOutput.roleRequirement,
    profile,
    numRounds: interviewPlan.requiredRoundsCount,
    roundConfig: { questionBudget: 4, maxSameSkillInRow: 2 },
  };

  const candidate = new CandidateSimulator(
    { trueAbility: new Map([
      ['backend', 0.85],
      ['databases', 0.78],
      ['system_design', 0.7],
      ['algorithms', 0.65],
      ['cloud', 0.5],
      ['security', 0.4],
    ]) },
    21,
  );

  const orchestrator = new AssessmentOrchestrator({ provider, seed: 21 });

  console.log('='.repeat(88));
  console.log(`INTELLIGENCE CORE — ADAPTIVE MOCK INTERVIEW (offline / deterministic provider)`);
  console.log(`Candidate: ${profile.candidateName}  ·  Band guess: ${profile.levelBand}`);
  console.log(`Role: ${config.role.title}`);
  console.log('='.repeat(88));

  console.log('\n── 5. JOB REQUIREMENT INTELLIGENCE ─────────────────────────────');
  console.log(`Role Title: ${gapOutput.roleTitle}  ·  Expected Level: ${gapOutput.expectedLevel ?? 'mid'}`);
  console.log(`Extracted Required Skills: ${gapOutput.analysis.requiredSkills.join(', ') || '(none)'}`);
  console.log(`Extracted Preferred Skills: ${gapOutput.analysis.preferredSkills.join(', ') || '(none)'}`);
  console.log(`Technologies: ${gapOutput.analysis.relevantTechnologies.join(', ')}`);
  console.log(`Problem Solving: ${gapOutput.analysis.problemSolvingExpectations.join(', ')}`);
  console.log(`Domain Knowledge: ${gapOutput.analysis.domainKnowledge.join(', ')}`);
  console.log(`Company Expectations (${gapOutput.analysis.companyExpectations.length}): ${gapOutput.analysis.companyExpectations.join(' · ')}`);

  console.log('\n── CANDIDATE vs ROLE COMPARISON ──────────────────────────────────');
  console.log(`Matched Skills (${comparison.matchedSkills.length}): ${comparison.matchedSkills.map((s) => s.skillId).join(', ') || '(none)'}`);
  console.log(`Missing Skills (${comparison.missingSkills.length}): ${comparison.missingSkills.map((s) => s.skillId).join(', ') || '(none)'}`);
  console.log(`Weak/Unvalidated Skills (${comparison.weakSkills.length}): ${comparison.weakSkills.map((s) => s.skillId).join(', ') || '(none)'}`);

  console.log(`\nHigh-Priority Role Gaps (count=${comparison.highPriorityGaps.length}):`);
  for (const gap of comparison.highPriorityGaps) {
    console.log(`  • [${gap.skillId}] priority ${gap.priority.toFixed(3)}  severity ${gap.gapSeverity}  (${gap.kind}) — ${gap.evidence}`);
  }

  console.log(`\nInterview Targets for Planner (count=${comparison.interviewTargets.length}):`);
  for (const target of comparison.interviewTargets) {
    console.log(`  • [${target.skillId}] priority ${target.priority.toFixed(3)} — ${target.reason}`);
  }

  console.log('\n── 6. INTERVIEW PLANNER STRUCTURE ──────────────────────────────');
  console.log(`Total Planned Rounds: ${interviewPlan.requiredRoundsCount}  ·  Total Question Budget: ${interviewPlan.totalQuestionBudget}`);
  console.log(`Summary: ${interviewPlan.summary}`);
  for (const round of interviewPlan.rounds) {
    console.log(`\n  ${round.name} [Type: ${round.type} | Diff: d${round.difficultyRange.min}..d${round.difficultyRange.max} | Budget: ${round.questionBudget}q]`);
    console.log(`    Evaluate: ${round.evaluationCriteria.join(', ')}`);
    console.log(`    Target Skills: ${round.targetSkills.join(', ') || '(none)'}`);
    console.log(`    Question Types: ${round.questionTypes.join(', ')}`);
    if (round.areasRequiringValidation.length > 0) {
      console.log(`    Validation Focus: ${round.areasRequiringValidation.slice(0, 2).join(' · ')}`);
    }
  }

  console.log('\n── A. RESUME INTELLIGENCE ──────────────────────────────────────');
  const hyp = profile.candidateLevelHypothesis;
  console.log(`Candidate-level estimate (HYPOTHESIS ${hyp.status}, evidenceOverride=${hyp.evidenceOverride}): ${hyp.band}`);
  console.log(`  basis: ${hyp.basis}`);

  console.log(`\nSkills claimed on the resume (count=${profile.skills.length}):`);
  console.log(`  ${profile.skills.map((s) => s.skillId).join(', ') || '(none)'}`);

  console.log(`\nStructured experience (count=${profile.experience.length}):`);
  for (const entry of profile.experience) {
    console.log(`  • ${entry.role} @ ${entry.company || '(unknown)'} [${entry.period || 'period n/a'}] — ${entry.bullets.length} bullets (line ${entry.source.line})`);
  }
  console.log(`  Education entries: ${profile.education.length} · Certifications: ${profile.certifications.length} · Technologies: ${profile.technologies.length}`);

  console.log(`\nPotential interview topics (count=${profile.potentialInterviewTopics.length}) — open PROBES, not assertions:`);
  for (const topic of profile.potentialInterviewTopics.slice(0, 8)) {
    console.log(`  • ${topic.topic}  [src line ${topic.source.line}]`);
    console.log(`      probes: ${topic.probes.slice(0, 3).join(' · ')}…`);
  }

  console.log(`\nEvidence/source references recorded: ${profile.evidenceSourceReferences.length}`);

  // Run once through the orchestrator and keep its live session for the transcript.
  let completedSession: ReturnType<AssessmentOrchestrator['buildSession']> | undefined;
  const report = await orchestrator.run(config, async (question, liveSession) => {
    completedSession = liveSession;
    return candidate.answerFor(question);
  });
  if (!completedSession) throw new Error('The demo interview did not create a session.');

  for (const [index, item] of completedSession.asked.entries()) {
    const round = Math.floor(index / config.roundConfig.questionBudget) + 1;
    if (index % config.roundConfig.questionBudget === 0) {
      console.log(`\n── ROUND ${round} ────────────────────────────────────────────────────────`);
    }
    const evaluation = item.evaluation;
    if (!evaluation) throw new Error(`Question ${item.question.id} has no evaluation.`);
    console.log(`\nQ ${index + 1}: [${item.question.skillId} | ${item.question.type} | d${item.question.difficulty}] ${item.question.prompt.slice(0, 110)}…`);
    console.log(`   grade ${evaluation.grade.toFixed(1)}/10  →  ${evaluation.rationale.slice(0, 140)}`);
  }

  console.log('\n' + '='.repeat(88));
  console.log('EVIDENCE-BACKED ASSESSMENT');
  console.log('='.repeat(88));
  console.log(`Overall score: ${report.overallScore}/10   Candidate priority: ${report.candidatePriority}`);
  console.log('\nSkill summary (vs required level):');
  for (const s of report.skillSummary) {
    console.log(`  ${s.skillId.padEnd(16)} est ${s.estimate.toFixed(1).padStart(4)}  conf ${s.confidence.toFixed(2)}  → ${s.verdict}`);
  }

  console.log('\n── CANDIDATE INTELLIGENCE MODEL ──────────────────────────────────');
  const cim = report.candidateIntelligence;
  console.log(`Skills tracked: ${cim.summary.skillsTracked} (probed ${cim.summary.probedSkills}, unprobed ${cim.summary.unprobedSkills})`);
  console.log(`Overall proficiency ${cim.summary.overallScore.toFixed(2)}  ·  overall confidence ${cim.summary.overallConfidence.toFixed(2)}`);
  console.log(`Resume evidence ${cim.summary.totalResumeEvidence}  ·  interview evidence ${cim.summary.totalInterviewEvidence}`);
  console.log(`Claims → ${JSON.stringify(cim.summary.claims)}  ·  gaps ${cim.summary.gapsTotal}`);
  for (const s of cim.ordered) {
    console.log(
      `  ${s.skillId.padEnd(16)} score ${s.score.toFixed(2)}  conf ${s.confidence.toFixed(2)}  ` +
        `samples ${s.samples}  ${s.verdict.padEnd(14)} gaps ${s.knowledgeGaps.length}  topics ${s.relatedTopics.length}`,
    );
  }

  console.log('\nKnowledge gaps:');
  if (report.gaps.length === 0) console.log('  (none detected)');
  for (const g of report.gaps) {
    console.log(`  ${g.skillId.padEnd(16)} severity ${g.severity.toFixed(2)}  ${g.reason} [conf ${g.confidence.toFixed(2)}]`);
  }

  console.log('\nImprovement roadmap:');
  for (const step of report.roadmap) {
    console.log(`  #${step.priority} [${step.skillId}] (${step.effort}) ${step.action.slice(0, 150)}`);
  }

  const counts = { validated: 0, refuted: 0, partial: 0, unverified: 0 };
  for (const c of report.claimsResolved) counts[c.verdict]++;
  console.log('\nResume claims resolved via interview evidence:');
  console.log(`  ${JSON.stringify(counts)}`);
  for (const c of report.claimsResolved.filter((x) => x.verdict !== 'unverified')) {
    console.log(`  ${c.verdict.padEnd(10)} ${c.text.slice(0, 110)}`);
  }
  console.log('\nDone. Build the UI/voice layers around this brain. 💡');
}

void main();
