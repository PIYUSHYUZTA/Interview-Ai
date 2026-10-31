import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { getSessions, getCandidateProgress } from '../api';
import type { CandidateProgress, SessionSummary, InterviewResultsResponse } from '../types';
import { Icon } from './icon/Icon';
import type { LucideIcon } from './icon/icons';
import { ArrowRight, ChartColumn, CircleCheck, Clock, FileText, Mic, Sparkles, Target, TriangleAlert } from './icon/icons';
import { Button, EmptyState, Status, labelFor } from './ui';
import { Skeleton, SkeletonScreen } from './motion/feedback';
import { CountUp, RevealGroup, revealItem } from './motion/reveal';
import { ErrorState } from './library/overlays';
import { SkillDevelopment } from './SkillDevelopment';
import { GrowthChart, SkillProfile } from './ProgressHistory';

/** The two sample résumés the setup screen can prefill (see ResumeUploadView). */
const SAMPLES = [{ id: 'senior_backend', label: 'Senior backend engineer' }, { id: 'ml_engineer', label: 'Machine learning engineer' }];

interface Props { onStartNewInterview: (preset?: string) => void; onViewInterviewResults: (id: string) => void }

/**
 * Candidate dashboard, after the Synexis reference: page title with one highlighted figure, three stat
 * tiles with mini bars, a growth chart beside an activity feed with the voice orb, and a quick-start strip.
 * Every number comes from saved interviews; nothing is invented when there is no data yet.
 */
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
  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState title="Your workspace did not load" message={error} onRetry={load} />;

  const completed = history.filter((s) => s.state === 'COMPLETED' && s.overallScore !== null);
  const visible = history.filter((s) => filter === 'all' || (filter === 'completed' ? s.state === 'COMPLETED' && s.overallScore !== null : (s.state !== 'COMPLETED' || s.overallScore === null)));
  const saved = progress?.reports ?? []; // oldest first
  const recent = saved.slice(-8);
  const thisWeek = saved.filter((r) => Date.now() - new Date(r.details.completedAt).getTime() < 7 * 864e5).length;
  const change = latest && previous ? latest.overallScore - previous.overallScore : null;
  const observed = latest ? Object.entries(latest.skillMap).filter(([, s]) => s.samples > 0) : [];
  const first = latest?.candidateName.split(' ')[0];
  const nextStep = latest?.roadmap[0];

  return <div className="page dashboard-page ws-dashboard">
    <header className="ws-title">
      <h1>{first ? `${first}’s practice overview` : 'Practice overview'}</h1>
      <p>{latest
        ? <>{latest.roleTitle} · Your latest overall score is <strong className="ws-highlight">{latest.overallScore.toFixed(1)}/100</strong>{change !== null && <>, <strong className="ws-highlight">{change >= 0 ? '+' : ''}{change.toFixed(1)}</strong> against your previous matching interview</>}.</>
        : 'Build a baseline. Practise deliberately. See what develops.'}</p>
    </header>

    <RevealGroup className="ws-kpis">
      <KpiTile index={0} label="Completed interviews" icon={CircleCheck} badge={thisWeek ? `+${thisWeek} this week` : undefined}
        value={<CountUp value={completed.length} />} note={`${completed.reduce((n, s) => n + s.answered, 0)} answers assessed`}
        bars={recent.map((r) => r.evidence.length)} barsLabel="Answers in each of your latest interviews" />
      <KpiTile index={1} label="Latest overall score" icon={ChartColumn} badge={change === null ? undefined : `${change >= 0 ? '+' : ''}${change.toFixed(1)}`} badgeTone={change !== null && change < 0 ? 'down' : 'up'}
        value={latest ? <><CountUp value={latest.overallScore} decimals={1} /><small>/100</small></> : '—'} note={latest ? labelFor(latest.performanceBand) : 'No assessment yet'}
        bars={recent.map((r) => r.overallScore)} max={100} barsLabel="Overall score of your latest interviews" />
      <KpiTile index={2} label="Role readiness" icon={Target} badge={latest?.readiness ? `${latest.readiness.coverage}% coverage` : undefined}
        value={latest?.readiness?.score != null ? <><CountUp value={latest.readiness.score} /><small>/100</small></> : '—'}
        note={latest?.readiness ? `${latest.readiness.assessedSkills} of ${latest.readiness.totalSkills} role skills assessed` : 'Needs a completed interview'}
        bars={observed.map(([, s]) => s.estimate * 10)} max={100} barsLabel="Your latest skill estimates" accent />
    </RevealGroup>

    <div className="ws-main">
      {progress && <GrowthChart progress={progress} onReport={onViewInterviewResults} />}
      <section className="ws-panel ws-activity" aria-labelledby="ws-activity-title">
        <header className="ws-panel-head"><div><h2 id="ws-activity-title">Recent activity</h2></div></header>
        {history.length ? <ol className="ws-feed">{history.slice(0, 4).map((s) => {
          const done = s.state === 'COMPLETED' && s.overallScore !== null;
          const icon = done ? CircleCheck : s.state === 'TERMINATED_FOR_INTEGRITY' ? TriangleAlert : Clock;
          return <li key={s.sessionId}><span className="ws-feed-icon" data-tone={done ? 'done' : s.state === 'TERMINATED_FOR_INTEGRITY' ? 'alert' : 'open'}><Icon icon={icon} /></span>
            <div><strong>{s.roleTitle}</strong><p>{done ? `Assessed ${s.overallScore!.toFixed(1)}/100 · ${s.answered} answers` : s.state === 'TERMINATED_FOR_INTEGRITY' ? 'Ended by the integrity policy' : s.state === 'READY' ? 'Planned, not started' : `${s.answered}/${s.totalQuestions} answers · unfinished`}</p></div>
            {done && <button type="button" className="ws-feed-link" aria-label={`Open the report for ${s.roleTitle}`} onClick={() => onViewInterviewResults(s.sessionId)}><Icon icon={ArrowRight} /></button>}</li>;
        })}</ol> : <p className="ws-feed-empty">Your interviews and reports will appear here.</p>}
        <div className="ws-orb-wrap"><button type="button" className="ws-orb" aria-label="Start a voice interview" onClick={() => onStartNewInterview()}><Icon icon={Mic} size="feature" /></button></div>
        <a className="ws-feed-all" href="#ws-history">View full history</a>
      </section>
    </div>

    <section className="ws-panel ws-quick" aria-labelledby="ws-quick-title">
      <span className="ws-quick-icon"><Icon icon={Sparkles} size="standalone" /></span>
      <div><h2 id="ws-quick-title">Instant practice interview</h2><p>Start from a sample résumé in seconds, or use your own on the next screen.</p></div>
      <div className="ws-chips" role="group" aria-label="Sample résumés">{SAMPLES.map((sample) => <button key={sample.id} type="button" className="ws-chip" onClick={() => onStartNewInterview(sample.id)}>{sample.label}</button>)}</div>
      <Button onClick={() => onStartNewInterview()}>Start interview <Icon icon={ArrowRight} /></Button>
    </section>

    {nextStep !== undefined && <SidebarSlot><div className="ws-next"><span className="ws-next-icon"><Icon icon={Target} /></span><strong>Your next best step</strong><p>{labelFor(nextStep.skillId)}: {nextStep.action}</p><Button variant="secondary" onClick={() => onStartNewInterview()}>Practise this <Icon icon={ArrowRight} /></Button></div></SidebarSlot>}

    <div className="ws-below">
      <SkillDevelopment latest={latest} previous={previous} />
      {progress && <SkillProfile progress={progress} onReport={onViewInterviewResults} />}
      <section className="ws-panel ws-history" id="ws-history" aria-labelledby="ws-history-title">
        <header className="ws-panel-head"><div><h2 id="ws-history-title">Interview history</h2><p>{history.length} sessions saved to this account.</p></div>
          <div className="ws-pills" role="group" aria-label="Filter interview history">{['all', 'completed', 'unfinished'].map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)}>{labelFor(item)}</button>)}</div></header>
        {visible.length ? <div className="history-list">{visible.map((s) => <article key={s.sessionId}><div className="history-mark"><Icon icon={FileText} size="standalone" /></div><div className="history-title"><h3>{s.roleTitle}</h3><p>{s.candidateName} · {s.answered}/{s.totalQuestions} answers</p></div><div className="history-score">{s.overallScore === null ? <Status>{s.state === 'TERMINATED_FOR_INTEGRITY' ? 'Integrity terminated' : s.state === 'READY' ? 'Planned' : 'Incomplete'}</Status> : <><strong>{s.overallScore.toFixed(1)}<small>/100</small></strong><Button variant="ghost" aria-label={`View assessment for ${s.roleTitle}`} onClick={() => onViewInterviewResults(s.sessionId)}>View <Icon icon={ArrowRight} /></Button></>}</div></article>)}</div>
          : <EmptyState title={history.length ? 'No interviews in this view.' : 'Your first practice is a fresh start.'} action={<Button variant="secondary" onClick={() => onStartNewInterview()}>Set up an interview</Button>}>{history.length ? 'Choose another filter, or begin a new interview.' : 'Upload your résumé to see the suggested career direction, or add a target role.'}</EmptyState>}
        <p className="fine-print">Unfinished sessions cannot yet be resumed after leaving or refreshing.</p>
      </section>
      {latest?.readiness && <details className="ws-method ws-readiness-method"><summary>How readiness is calculated</summary><p>{latest.readiness.methodology}</p><p>A practice indicator, not a hiring prediction. Limited coverage means important abilities remain untested.</p></details>}
      {latest?.providerName === 'deterministic' && <p className="fine-print">Demo mode · heuristic evaluation</p>}
    </div>
  </div>;
}

/** A stat tile: uppercase label, large figure, note, change badge, faint icon and a mini bar chart. */
function KpiTile({ index, label, icon, value, note, badge, badgeTone = 'up', bars, max, barsLabel, accent = false }: { index: number; label: string; icon: LucideIcon; value: ReactNode; note: string; badge?: string; badgeTone?: 'up' | 'down'; bars: number[]; max?: number; barsLabel: string; accent?: boolean }) {
  const top = max ?? Math.max(1, ...bars);
  const reveal = revealItem(index);
  return <article {...reveal} className={`ws-kpi ${reveal.className}`}>
    <header><span className="ws-eyebrow">{label}</span>{badge && <span className="ws-badge" data-tone={badgeTone}>{badge}</span>}<span className="ws-kpi-icon"><Icon icon={icon} size="feature" /></span></header>
    <strong className="ws-kpi-value">{value}</strong>
    <p className="ws-kpi-note">{note}</p>
    {bars.length > 0 && <div className="ws-bars" data-accent={accent ? '' : undefined} role="img" aria-label={`${barsLabel}: ${bars.map((b) => Math.round(b)).join(', ')}`}>{bars.map((b, i) => <span key={i} style={{ scale: `1 ${Math.max(.06, b / top)}` }} />)}</div>}
  </article>;
}

/** Renders into the sidebar's card slot (the reference's promo-card position), when the shell provides one. */
function SidebarSlot({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.getElementById('sidebar-slot')); }, []);
  return target ? createPortal(children, target) : null;
}

/** The dashboard's shape while it loads: title, three stat tiles, chart and activity. */
function DashboardSkeleton() {
  return <SkeletonScreen label="Loading your workspace…" className="page dashboard-page ws-dashboard">
    <header className="ws-title"><Skeleton width="min(420px, 80%)" height="32px" /><Skeleton width="min(520px, 70%)" height="16px" /></header>
    <div className="ws-kpis">{[0, 1, 2].map((card) => <div className="ws-kpi" key={card}><Skeleton width="120px" height="12px" /><Skeleton width="80px" height="32px" /><Skeleton height="40px" /></div>)}</div>
    <div className="ws-main"><div className="ws-panel"><Skeleton height="240px" /></div><div className="ws-panel"><Skeleton height="240px" /></div></div>
  </SkeletonScreen>;
}
