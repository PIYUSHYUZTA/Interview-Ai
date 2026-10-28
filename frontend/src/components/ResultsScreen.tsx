import { useEffect, useState } from 'react';
import type { InterviewResultsResponse } from '../types';
import { AnswerReview } from './AnswerReview';
import { ReportOverview, DetailedLearningPlan, AnswerCoach } from './DetailedReportSections';
import { getInterviewResults } from '../api';
import { IntegrityReview } from './IntegrityReview';
import { Icon } from './icon/Icon';
import { ArrowRight, ChevronDown, CircleCheck, Target } from './icon/icons';
import { Button, Card, Meter, ScoreRing, Status, labelFor } from './ui';
import { Skeleton, SkeletonScreen } from './motion/feedback';
import { ErrorState } from './library/overlays';
interface Props { interviewId: string; initialResults?: InterviewResultsResponse | null; onRestart: () => void }
export function ResultsScreen({ interviewId, initialResults, onRestart }: Props) {
  const [results, setResults] = useState<InterviewResultsResponse | null>(initialResults ?? null);
  const [loading, setLoading] = useState(!initialResults);
  const [error, setError] = useState<string | null>(null);
  const load = async () => { setLoading(true); setError(null); try { setResults(await getInterviewResults(interviewId)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } };
  useEffect(() => { if (!initialResults) void load(); }, [interviewId, initialResults]);
  if (loading) return <SkeletonScreen label="Bringing your assessment together…" className="page results-page">
    <header className="page-heading"><div><Skeleton width="200px" height="12px" /><Skeleton width="min(480px, 80%)" height="40px" /><Skeleton width="240px" height="16px" /></div></header>
    <Card><Skeleton width="160px" height="12px" /><Skeleton height="180px" /><Skeleton width="60%" height="16px" /></Card>
  </SkeletonScreen>;
  if (error || !results) return <ErrorState title="The assessment did not load" message={error ?? 'No assessment is available.'} onRetry={load} />;
  const strengths = results.details.strengths;
  return <div className="page results-page"><header className="page-heading"><div><p className="eyebrow">YOUR INTELLIGENCE REPORT</p><h1>A clearer picture. A next step.</h1><p>{results.candidateName} · {results.roleTitle}</p></div><Button onClick={onRestart}>Practice again <Icon icon={ArrowRight} /></Button></header>
    <div className="report-hero"><Card className="assessment-overview"><Status tone="success">Interview completed</Status><div className="assessment-score"><ScoreRing score={results.overallScore} /><div><p className="eyebrow">OVERALL ASSESSMENT</p><h2>{labelFor(results.performanceBand)}</h2><p>{results.evidence.length} answers contributed to this assessment.</p></div></div><p className="fine-print">{results.providerName === 'deterministic' ? 'Deterministic demo: heuristic evaluation, not a live LLM assessment.' : `Configured evaluation provider: ${results.providerName}.`} Scores summarize observed answers, not your potential.</p></Card><Card><p className="eyebrow">HOW YOU PERFORMED</p><h2>Component breakdown</h2><div className="component-grid">{Object.entries(results.componentScores).map(([id, value]) => <Meter key={id} label={`${labelFor(id)} · ${Math.round((results.details.scoringWeights[id] ?? 0) * 100)}%`} value={value} />)}</div></Card></div>
    <ReportOverview details={results.details} />
    <div className="report-grid"><Card><div className="section-heading"><div><p className="eyebrow">EVIDENCE, SKILL BY SKILL</p><h2>Skill breakdown</h2></div><Icon icon={Target} size="feature" /></div><div className="skill-list">{Object.entries(results.skillMap).map(([id, skill]) => <article key={id}><div className="section-heading"><h3>{labelFor(id)}</h3><span className={`verdict ${skill.verdict}`}>{labelFor(skill.verdict)}</span></div>{skill.samples ? <Meter label="Observed proficiency" value={skill.estimate} /> : <p className="muted">Not assessed · no answer evidence collected</p>}<small>{skill.samples} responses · {Math.round(skill.confidence * 100)}% evidence confidence</small>{results.evidence.filter((item) => item.skillId === id).slice(0, 2).map((item) => <p className="skill-evidence" key={item.questionId}>“{item.answer.slice(0, 150)}{item.answer.length > 150 ? '…' : ''}” <a href={`#answer-${item.questionId}`}>View scored answer</a></p>)}</article>)}</div></Card>
    <div className="stack"><Card><p className="eyebrow">WHAT YOU DEMONSTRATED</p><h2>Strengths</h2>{strengths.length ? strengths.map((finding, index) => <div className="strength" key={index}><Icon icon={CircleCheck} size="standalone" /><div><p>{finding.text}</p>{finding.questionIds.map((id) => <a href={`#answer-${id}`} key={id}>View response evidence</a>)}</div></div>) : <p>No response met the strong-evidence threshold in this interview. Review the scored rubric for what was demonstrated.</p>}</Card><Card><p className="eyebrow">WHERE TO GO DEEPER</p><h2>Knowledge gaps</h2>{results.details.weaknesses.map((finding, index) => <div className="gap-item" key={`answer-${index}`}><p>{finding.text}</p>{finding.questionIds.map((id) => <a href={`#answer-${id}`} key={id}>Review this answer</a>)}</div>)}{results.gaps.length ? results.gaps.map((gap) => <div className="gap-item" key={gap.skillId}><h3>{labelFor(gap.skillId)}</h3><p>{gap.reason}</p><small>Severity {(gap.severity * 100).toFixed(0)}% · confidence {(gap.confidence * 100).toFixed(0)}%</small></div>) : <p>No role gaps were identified in this assessment.</p>}</Card></div></div>
    <DetailedLearningPlan details={results.details} />
    {results.integrityReview && <IntegrityReview review={results.integrityReview} />}
    <Card className="evidence"><p className="eyebrow">THE ANSWERS BEHIND THE ASSESSMENT</p><h2>Supporting interview evidence</h2><p className="muted">Open each answer for its evidence, scored rubric and specific feedback. Suggestions describe the scored response, not a judgement of your potential.</p>{results.evidence.map((item, i) => <details id={`answer-${item.questionId}`} key={item.questionId}><summary><span className="evidence-number">{String(i + 1).padStart(2, '0')}</span><span>{labelFor(item.skillId)}</span><strong>{item.score.toFixed(1)} / 10</strong><Icon icon={ChevronDown} className="evidence-toggle" /></summary><div><h3>Question</h3><p className="preserve-lines">{item.question}</p><h3>Your answer</h3><p className="preserve-lines">{item.answer}</p><small>Rubric coverage: {Math.round(item.rubricCompliance * 100)}%</small>{item.feedback && <AnswerReview feedback={item.feedback} />}{results.details.answerCoaching.filter((coach) => coach.questionId === item.questionId).map((coach) => <AnswerCoach key={coach.questionId} coaching={coach} />)}</div></details>)}</Card>
  </div>;
}
