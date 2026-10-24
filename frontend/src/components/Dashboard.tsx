import { ProgressHistory } from './ProgressHistory';
import type { CandidateProgress } from '../types';
import { useEffect, useState } from 'react';
import { getSessions, getCandidateProgress } from '../api';
import type { SessionSummary, InterviewResultsResponse } from '../types';
import { ArrowRightIcon, FileTextIcon } from './Icons';
import { Button, Card, EmptyState, ErrorNotice, Loading, ScoreRing, Status, labelFor } from './ui';
import { SkillDevelopment } from './SkillDevelopment';
interface Props { onStartNewInterview: (preset?: string) => void; onViewInterviewResults: (id: string) => void }
export function Dashboard({ onStartNewInterview, onViewInterviewResults }: Props) {
  const [progress, setProgress] = useState<CandidateProgress | null>(null);
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [latest, setLatest] = useState<InterviewResultsResponse | null>(null);
  const [previous, setPrevious] = useState<InterviewResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [result, development] = await Promise.all([getSessions(), getCandidateProgress()]);
      setProgress(development);
      const reports = [...development.reports].reverse();
      const rank = new Map(reports.map((r, i) => [r.sessionId, i]));
      setHistory([...result.interviews].sort((a, b) => (rank.get(a.sessionId) ?? -1) - (rank.get(b.sessionId) ?? -1)));
      const current = reports[0] ?? null;
      setLatest(current);
      setPrevious(current ? reports.slice(1).find((r) => r.comparisonKey === current.comparisonKey) ?? null : null);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const completed = history.filter((s) => s.state === 'COMPLETED' && s.overallScore !== null);
  const visible = history.filter((s) => filter === 'all' || (filter === 'completed' ? s.state === 'COMPLETED' && s.overallScore !== null : (s.state !== 'COMPLETED' || s.overallScore === null)));
  if (loading) return <Loading label="Loading your workspace…" />;
  if (error) return <ErrorNotice message={error} retry={load} />;
  return <div className="page dashboard-page"><header className="page-heading"><div><p className="eyebrow">YOUR PRACTICE, WITH PURPOSE</p><h1>{latest ? `Keep moving forward, ${latest.candidateName.split(' ')[0]}.` : 'Your next chapter starts here.'}</h1><p>{latest ? `${latest.roleTitle} · Your latest evidence and next steps, in one place.` : 'Build a baseline. Practice deliberately. See what develops.'}</p></div><Button onClick={() => onStartNewInterview()}>New interview <ArrowRightIcon size={16} /></Button></header>
    <div className="dashboard-summary"><Card className="readiness-card"><p className="eyebrow">ROLE READINESS</p><div className="readiness-layout"><ScoreRing label="Role readiness index" score={latest?.readiness?.score ?? null} /><div><h2>{latest?.readiness ? `${latest.readiness.assessedSkills} of ${latest.readiness.totalSkills} role skills assessed` : 'Start with evidence.'}</h2><p>{latest ? latest.roleTitle : 'Complete an interview to establish your readiness baseline.'}</p>{latest?.readiness && <><label className="coverage-label">Role-weighted evidence coverage <strong>{latest.readiness.coverage}%</strong></label><progress aria-label="Role-weighted evidence coverage" value={latest.readiness.coverage} max={100} /></>}</div></div><details className="score-explainer"><summary>How readiness is calculated</summary><p>{latest?.readiness?.methodology ?? 'A role-weighted index of demonstrated skill verdicts: full credit for meets, half for partially meets, and no credit for gaps or unassessed skills. No score is shown until there is evidence.'}</p><p>A practice indicator, not a hiring prediction. Limited coverage means important abilities remain untested.</p></details>{latest?.providerName === 'deterministic' && <small>Demo mode · heuristic evaluation</small>}</Card>
    <Card className="recent-assessment"><p className="eyebrow">RECENT ASSESSMENT</p>{latest ? <><div className="recent-score"><strong>{latest.overallScore.toFixed(1)}<small>/100</small></strong><Status>{labelFor(latest.performanceBand)}</Status></div><h2>{latest.candidateName}</h2><p>{latest.evidence.length} answers · {latest.gaps.length} identified gaps</p><Button variant="secondary" onClick={() => onViewInterviewResults(latest.sessionId)}>Explore assessment <ArrowRightIcon size={16} /></Button></> : <><h2>Meet your starting point.</h2><p>Your first interview brings together your experience, target role and answer evidence.</p><Button onClick={() => onStartNewInterview()}>Prepare my interview <ArrowRightIcon size={16} /></Button><Button variant="ghost" onClick={() => onStartNewInterview('senior_backend')}>Explore with a sample</Button></>}</Card></div>
    <div className="metrics-grid"><Card><p className="eyebrow">COMPLETED INTERVIEWS</p><strong className="metric-number">{completed.length}</strong><p>Saved to this candidate account</p></Card><Card><p className="eyebrow">ANSWER EVIDENCE</p><strong className="metric-number">{completed.reduce((n, s) => n + s.answered, 0)}</strong><p>Responses across completed interviews</p></Card><Card><p className="eyebrow">MATCHED ASSESSMENT CHANGE</p><strong className="metric-number">{latest && previous ? `${latest.overallScore >= previous.overallScore ? '+' : ''}${(latest.overallScore - previous.overallScore).toFixed(1)}` : '—'}</strong><p>{previous ? 'Overall points vs. previous matching assessment' : 'A second matching assessment is needed'}</p></Card></div>
    <SkillDevelopment latest={latest} previous={previous} />
    {progress && <ProgressHistory progress={progress} onReport={onViewInterviewResults} />}
    <div className="dashboard-grid"><Card><div className="section-heading"><div><p className="eyebrow">YOUR JOURNEY</p><h2>Interview history</h2></div><span className="muted">{history.length} sessions</span></div><div className="segmented history-filters" aria-label="Filter interview history">{['all', 'completed', 'unfinished'].map((item) => <Button key={item} variant={filter === item ? 'secondary' : 'ghost'} aria-pressed={filter === item} onClick={() => setFilter(item)}>{labelFor(item)}</Button>)}</div>{visible.length ? <div className="history-list">{visible.map((s) => <article key={s.sessionId}><div className="history-mark"><FileTextIcon size={19} /></div><div className="history-title"><h3>{s.roleTitle}</h3><p>{s.candidateName} · {s.answered}/{s.totalQuestions} answers</p></div><div className="history-score">{s.overallScore === null ? <Status>{s.state === 'TERMINATED_FOR_INTEGRITY' ? 'Integrity terminated' : s.state === 'READY' ? 'Planned' : 'Incomplete'}</Status> : <><strong>{s.overallScore.toFixed(1)}<small>/100</small></strong><Button variant="ghost" aria-label={`View assessment for ${s.roleTitle}`} onClick={() => onViewInterviewResults(s.sessionId)}>View <ArrowRightIcon size={14} /></Button></>}</div></article>)}</div> : <EmptyState title={history.length ? 'No interviews in this view.' : 'Your first practice is a fresh start.'} action={<Button variant="secondary" onClick={() => onStartNewInterview()}>Set up an interview</Button>}>{history.length ? 'Choose another filter, or begin a new interview.' : 'Upload your resume to see the suggested career direction, or add a target role.'}</EmptyState>}<p className="fine-print">Interview history is saved to this candidate account. Unfinished sessions cannot yet be resumed after leaving or refreshing.</p></Card>
    <Card className="practice-recommendation"><p className="eyebrow">YOUR NEXT BEST STEP</p><h2>{latest?.roadmap[0] ? labelFor(latest.roadmap[0].skillId) : 'Build your baseline.'}</h2><p>{latest?.roadmap[0]?.action ?? 'Start with a complete interview to explore your background, technical reasoning and communication.'}</p><Button variant="secondary" onClick={() => onStartNewInterview()}>Prepare next practice <ArrowRightIcon size={16} /></Button></Card></div>
  </div>;
}
