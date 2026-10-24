import { z } from 'zod';
import type { InterviewStateMachine } from '../core/session/InterviewStateMachine.js';
import type { KnowledgeGap, RoadmapStep, Question } from '../core/types.js';
import { SCORING_WEIGHTS } from '../core/score/ScoringEngine.js';
import { referenceAnswer } from './ReferenceAnswers.js';

const FindingSchema = z.object({ text: z.string(), questionIds: z.array(z.string()) });
export const AnswerCoachingSchema = z.object({
  questionId: z.string(), demonstrated: z.array(z.object({ concept: z.string(), excerpt: z.string() })),
  missing: z.array(z.string()), clarity: z.array(z.object({ issue: z.string(), excerpt: z.string(), suggestion: z.string() })),
  revisionConcepts: z.array(z.string()),
  example: z.object({ label: z.string(), kind: z.enum(['reference', 'scaffold']), wording: z.string() }),
  beforeAfter: z.object({ before: z.string(), after: z.string(), label: z.string() }),
});
export const LearningPlanSchema = z.object({
  skillId: z.string(), priority: z.number(), currentProficiency: z.number().nullable(), targetOutcome: z.string(),
  reason: z.string(), sequence: z.array(z.string()), exercises: z.array(z.string()), projectTask: z.string(),
  checkpoints: z.array(z.string()), successCriteria: z.array(z.string()), evidenceQuestionIds: z.array(z.string()),
});
export const DetailedReportSchema = z.object({
  version: z.literal(1), generatedAt: z.string().datetime(), completionStatus: z.literal('COMPLETED'),
  startedAt: z.string().datetime().nullable(), completedAt: z.string().datetime(), durationSec: z.number().nonnegative().nullable(),
  durationBasis: z.string(), detectedRole: z.string(), roleDetectionBasis: z.string(), summary: z.string(),
  strengths: z.array(FindingSchema), weaknesses: z.array(FindingSchema), nextSteps: z.array(z.string()),
  difficultyProgression: z.array(z.object({ questionId: z.string(), round: z.number(), difficulty: z.number(), skillId: z.string() })),
  scoringWeights: z.record(z.string(), z.number()), methodology: z.string(),
  categoryEvidence: z.record(z.string(), z.array(z.string())),
  answerCoaching: z.array(AnswerCoachingSchema), learningPlan: z.array(LearningPlanSchema),
});

export function transcriptAnswer(entry: InterviewStateMachine['questionHistory'][number]): string {
  const answer = entry.answer;
  if (!answer) return '';
  const selected = answer.selectedChoiceIndex === undefined ? '' : `Selected option: ${entry.question.choices?.[answer.selectedChoiceIndex] ?? answer.selectedChoiceIndex}`;
  return [answer.text === '[Code Submission]' ? '' : answer.text, answer.code, selected].filter(Boolean).join('\n\n');
}

function excerpt(text: string, cue?: string): string {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  return (sentences.find((sentence) => cue && sentence.toLowerCase().includes(cue.toLowerCase())) ?? sentences[0] ?? '').slice(0, 450);
}

function coach(question: Question, answer: string, role: string) {
  const words = answer.toLowerCase();
  const demonstrated = question.rubricHints.filter((cue) => words.includes(cue.toLowerCase())).map((concept) => ({ concept, excerpt: excerpt(answer, concept) }));
  const missing = question.rubricHints.filter((cue) => !demonstrated.some((item) => item.concept === cue));
  const clarity: Array<{ issue: string; excerpt: string; suggestion: string }> = [];
  const personal = /\bI\s+(?:built|designed|implemented|debugged|tested|led|owned|chose|measured|developed|created|resolved|used)\b/i.test(answer);
  if (/project|resume|experience|incident|professional background/i.test(question.prompt) && !personal) {
    clarity.push({ issue: 'Your own contribution is not explicit in this answer.', excerpt: excerpt(answer), suggestion: 'Name the part you personally owned, the decision you made and how you checked the result. Separate your contribution from the team’s work.' });
  }
  if (/\b(stuff|things|something|somehow|various|basically|etc)\b/i.test(answer)) {
    const vague = answer.match(/\b(stuff|things|something|somehow|various|basically|etc)\b/i)![0];
    clarity.push({ issue: `The phrase “${vague}” leaves the mechanism or scope unclear.`, excerpt: excerpt(answer, vague), suggestion: `Replace it with a specific component, action or example relevant to ${question.subtopic}. Add an observable result only if you can substantiate it.` });
  }
  if (!/because|therefore|so that|trade.off|compared|instead of|to avoid/i.test(answer)) {
    clarity.push({ issue: 'The reason for your approach is not explicit in the transcript.', excerpt: excerpt(answer), suggestion: `Explain why the approach fits ${question.subtopic}, identify one alternative and state the cost or limitation you accepted.` });
  }
  if (!/for example|for instance|in production|in my|in our|\bproject\b|\b\d+(?:ms|%| seconds| requests)\b/i.test(answer)) {
    clarity.push({ issue: 'No concrete example is explicit in the transcript.', excerpt: excerpt(answer), suggestion: 'Add one small worked example. State the input or situation, your action and what happened, without inventing experience or measurements.' });
  }
  const before = excerpt(answer);
  const after = /do not know|don.t know|not sure/i.test(answer)
    ? `I have not yet demonstrated ${question.subtopic}. My current understanding is [state only what you know]. I would verify it with [a small example or test] and revise [the specific missing concept].`
    : `${before}${personal ? '' : ' My own contribution was [state your actual responsibility].'} I chose this approach because [explain the mechanism and constraint]. Compared with [an alternative], it [state the trade-off]. I checked the result using [truthful evidence or a worked example].`;
  return {
    questionId: question.id, demonstrated,
    missing: missing.map((cue) => `Make this rubric concept explicit: ${cue}. Its absence from this text check is not proof the answer is incorrect.`),
    clarity, revisionConcepts: missing,
    example: { label: 'AI coach example wording — application-generated reference/template, not the candidate’s words or a live LLM response.', ...referenceAnswer(question, role) },
    beforeAfter: { before, after, label: 'Suggested rewrite scaffold based on your excerpt. Brackets require your truthful details; this was not spoken by you.' },
  };
}

export function buildDetailedReport(sm: InterviewStateMachine, gaps: readonly KnowledgeGap[], roadmap: readonly RoadmapStep[], overallScore: number) {
  if (sm.state !== 'COMPLETED' || !sm.hasCompletedPlan) throw new Error('A final report requires a fully completed interview plan.');
  const evaluated = sm.questionHistory.filter((entry) => entry.evaluation !== null);
  const completedAt = sm.completedAt ?? evaluated.at(-1)!.timestamp;
  const startedAt = sm.timing.sessionStartedAt;
  const strengths = evaluated.filter((entry) => entry.evaluation!.grade >= 7.5).slice(0, 4).map((entry) => ({
    text: `${entry.question.subtopic}: the structured assessment scored this response ${entry.evaluation!.grade.toFixed(1)}/10. Evidence: “${excerpt(transcriptAnswer(entry))}”`, questionIds: [entry.question.id],
  }));
  const weaknesses = evaluated.filter((entry) => entry.evaluation!.grade < 6).slice(0, 4).map((entry) => ({
    text: `${entry.question.subtopic}: this response scored ${entry.evaluation!.grade.toFixed(1)}/10; review the rubric concepts and the explanation alongside “${excerpt(transcriptAnswer(entry))}”.`, questionIds: [entry.question.id],
  }));
  const coaching = evaluated.map((entry) => coach(entry.question, transcriptAnswer(entry), sm.config.role.title));
  const learningPlan = roadmap.slice(0, 5).map((step) => {
    const state = sm.skillStates.find((skill) => skill.skillId === step.skillId);
    const evidence = evaluated.filter((entry) => entry.question.skillId === step.skillId);
    const concepts = [...new Set(coaching.filter((item) => evidence.some((entry) => entry.question.id === item.questionId)).flatMap((item) => item.revisionConcepts))].slice(0, 4);
    const gap = gaps.find((item) => item.skillId === step.skillId)!;
    return {
      skillId: step.skillId, priority: step.priority, currentProficiency: state?.samples ? state.estimate : null,
      targetOutcome: `Demonstrate ${gap.requiredLevel}-level ${step.skillId.replaceAll('_', ' ')} with accurate concepts, a worked example and a justified trade-off.`,
      reason: gap.reason,
      sequence: [`Review ${concepts.length ? concepts.join('; ') : gap.concept}.`, 'Explain the mechanism without notes, then compare one alternative.', 'Apply it in a small implementation and test an edge case.', 'Repeat the relevant interview questions after practice.'],
      exercises: concepts.length ? concepts.map((concept) => `Work one example of ${concept}; explain the inputs, steps, result and one failure case.`) : [`Explain and work through ${gap.concept} before attempting a larger project.`],
      projectTask: step.action,
      checkpoints: ['Before practice: record your explanation and identify one unsupported statement.', 'After the exercise: inspect the result and correct mistakes.', 'In the next practice session: answer a fresh question on this skill.'],
      successCriteria: ['Explain each reviewed concept accurately without relying on keyword lists.', 'Show a reproducible example or implementation with an edge-case test.', 'Justify one decision and its trade-off using evidence.', 'Collect at least two fresh assessed responses; compare their rubric scores and evidence with this report.'],
      evidenceQuestionIds: evidence.map((entry) => entry.question.id),
    };
  });
  const ids = evaluated.map((entry) => entry.question.id);
  return DetailedReportSchema.parse({
    version: 1, generatedAt: new Date().toISOString(), completionStatus: 'COMPLETED',
    startedAt: startedAt === null ? null : new Date(startedAt).toISOString(), completedAt: new Date(completedAt).toISOString(),
    durationSec: startedAt === null ? null : Math.max(0, Math.round((completedAt - startedAt) / 1000)),
    durationBasis: sm.completedAt ? 'Server elapsed time from session start through final evaluation.' : 'Legacy session: elapsed time through the final recorded answer; evaluation end time was not stored.',
    detectedRole: sm.config.detectedRole?.title ?? sm.config.role.title,
    roleDetectionBasis: sm.config.detectedRole?.rationale ?? 'Legacy session: original career detection was not stored; the interview target role is shown.',
    summary: `Completed ${evaluated.length} evaluated answers across ${sm.maxRounds} planned rounds for ${sm.config.role.title}. Overall performance was ${overallScore.toFixed(1)}/100 using the established weighted rubric. ${strengths.length} responses showed strong evidence and ${weaknesses.length} responses need closer revision. Unassessed skills remain unverified.`,
    strengths, weaknesses, nextSteps: learningPlan.map((step) => `Priority ${step.priority}: ${step.sequence[0]} ${step.targetOutcome}`),
    difficultyProgression: evaluated.map((entry) => ({ questionId: entry.question.id, round: entry.round, difficulty: entry.question.difficulty, skillId: entry.question.skillId })),
    scoringWeights: SCORING_WEIGHTS,
    methodology: 'Existing deterministic scoring weights are unchanged. Component scores are rubric-derived proxies, not independent measurements of intelligence or employability. Coaching text checks identify explicit wording only; synonyms or valid alternatives may be missed. Reference examples are learning aids, not candidate evidence or guaranteed solutions. No independent project-understanding or behavioral score is invented.',
    categoryEvidence: { technical: ids, problemSolving: ids, communication: ids, logicalReasoning: ids, adaptability: ids, delivery: ids },
    answerCoaching: coaching, learningPlan,
  });
}
