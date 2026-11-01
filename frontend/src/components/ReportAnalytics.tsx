import { lazy, Suspense, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { InterviewResultsResponse } from '../types';
import { detectTier } from '../experience/quality';
import { usePrefersReducedMotion } from '../design-system/motion';
import { Icon } from './icon/Icon';
import { ArrowRight, CircleCheck, FileText, Target, TriangleAlert, Upload } from './icon/icons';
import { Button, labelFor } from './ui';
import { CountUp } from './motion/reveal';
import type { MapAnswer } from './ReportNeuralMap';

const ReportNeuralMap = lazy(() => import('./ReportNeuralMap'));

// Categorical colours for the donut: the six-colour palette only, in a fixed order.
const SERIES = ['var(--paint-teal)', 'var(--paint-amber)', 'color-mix(in srgb, var(--paint-ivory) 72%, transparent)', 'var(--paint-earth)', 'color-mix(in srgb, var(--paint-teal) 48%, var(--paint-ink))', 'color-mix(in srgb, var(--paint-amber) 52%, var(--paint-ink))'];
const MEETS = 6;
const clock = (sec: number | null) => (sec === null ? '—' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
const conic = (parts: number[], colours: string[]) => {
  const total = parts.reduce((a, b) => a + b, 0) || 1; let at = 0;
  return `conic-gradient(${parts.map((p, i) => { const from = at; at += (p / total) * 360; return `${colours[i % colours.length]} ${from}deg ${at}deg`; }).join(', ')})`;
};

/**
 * The report's analytics canvas, after the assessment-dashboard reference (docs/references/05): metric tiles
 * and a component donut on the left, the neural map in the centre, three gauges and the skill bubbles on the
 * right, and a per-question histogram, a strengths/gaps donut and the next step along the bottom.
 */
export function ReportAnalytics({ results, onRestart }: { results: InterviewResultsResponse; onRestart: () => void }) {
  const reduced = !!usePrefersReducedMotion();
  const [tier] = useState(() => detectTier(false)); // the map is static, not animated, under reduced motion; it still renders
  const [active, setActive] = useState<string | null>(null);
  const answers: MapAnswer[] = useMemo(() => results.evidence.map((e) => ({ id: e.questionId, skillId: e.skillId, score: e.score })), [results.evidence]);
  const skills = Object.entries(results.skillMap);
  const assessed = skills.filter(([, s]) => s.samples > 0);
  const components = Object.entries(results.componentScores);
  const met = results.evidence.filter((e) => e.score >= MEETS).length;
  const short = results.evidence.length - met;
  const readiness = results.readiness;
  const activeAnswer = results.evidence.find((e) => e.questionId === active);
  const completed = new Date(results.details.completedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const answerQuality = results.evidence.length ? results.evidence.reduce((sum, e) => sum + e.score, 0) / results.evidence.length : null;

  return <section className="rp" aria-labelledby="rp-title">
    <header className="rp-head">
      <div><p className="rp-eyebrow">Intelligence report</p><h1 id="rp-title">{results.roleTitle}</h1><p>{results.candidateName} · {completed} · {results.evidence.length} answers assessed · {clock(results.details.durationSec)} duration</p>
        <div className="rp-actions"><button type="button" className="rp-action" onClick={printReport}><Icon icon={FileText} />Print or save as PDF</button><button type="button" className="rp-action" onClick={() => downloadReport(results)}><Icon icon={Upload} />Download data</button></div></div>
      <div className="rp-gauges">
        <Gauge value={results.overallScore} max={100} label="Overall" text={results.overallScore.toFixed(0)} />
        <Gauge value={readiness?.score ?? 0} max={100} label="Readiness" text={readiness?.score != null ? String(readiness.score) : '—'} />
        <Gauge value={Math.min(1, met / Math.max(1, results.evidence.length)) * 100} max={100} label="Answers met" text={`${met}/${results.evidence.length}`} />
      </div>
    </header>

    <div className="rp-grid">
      <div className="rp-left">
        <Metric label="Technical knowledge" value={<CountUp value={results.componentScores.technical} decimals={1} />} unit="/10" bar={results.componentScores.technical / 10} note={`Weighted ${Math.round((results.details.scoringWeights.technical ?? 0) * 100)}% of the overall score`} />
        <Metric label="Communication" value={<CountUp value={results.componentScores.communication} decimals={1} />} unit="/10" bar={results.componentScores.communication / 10} note={`Weighted ${Math.round((results.details.scoringWeights.communication ?? 0) * 100)}% of the overall score`} />
        <Metric label="Problem-solving" value={<CountUp value={results.componentScores.problemSolving} decimals={1} />} unit="/10" bar={results.componentScores.problemSolving / 10} note={`Weighted ${Math.round((results.details.scoringWeights.problemSolving ?? 0) * 100)}% of the overall score`} />
        <Metric label="Answer quality" value={answerQuality === null ? '—' : <CountUp value={answerQuality} decimals={1} />} unit="/10" bar={(answerQuality ?? 0) / 10} note={`Mean score of your ${results.evidence.length} evaluated answers`} accent />
      </div>

      <div className="rp-panel rp-map">
        <header className="rp-map-head"><h2 className="rp-panel-title">Your thinking, mapped</h2><p>Each node is one answer, grouped by skill. <span className="rp-key rp-key-met">Met the bar</span> <span className="rp-key rp-key-short">Fell short</span></p></header>
        <div className="rp-map-stage">
          <div className="rp-map-ring" aria-hidden="true" />
          <ol className="rp-map-scale" aria-hidden="true">{[100, 75, 50, 25, 0].map((v) => <li key={v}>{v}</li>)}</ol>
          {tier !== 'still' && answers.length > 0 && <Suspense fallback={null}><ReportNeuralMap answers={answers} active={active} onActive={setActive} still={reduced} dense={tier === 'high'} /></Suspense>}
          {(tier === 'still' || !answers.length) && <p className="rp-map-fallback">{answers.length ? 'The 3D map is off on this device. Every answer is listed in the score histogram below.' : 'No answers were assessed.'}</p>}
          <div className="rp-map-tip" aria-live="polite">{activeAnswer ? <><strong>{labelFor(activeAnswer.skillId)} · {activeAnswer.score.toFixed(1)}/10</strong><span>{activeAnswer.question.slice(0, 110)}{activeAnswer.question.length > 110 ? '…' : ''}</span></> : <span>Point at a node, or at a bar below, to see its question.</span>}</div>
        </div>
      </div>

      <div className="rp-panel rp-skills">
        <h2 className="rp-panel-title">Skills</h2>
        <ul className="rp-bubbles">{assessed.map(([id, s]) => <Bubble key={id} id={id} skill={s} />)}</ul>
        {skills.length > assessed.length && <details className="rp-unassessed"><summary>+{skills.length - assessed.length} not assessed</summary>
          <ul className="rp-bubbles">{skills.filter(([, s]) => !s.samples).map(([id, s]) => <Bubble key={id} id={id} skill={s} />)}</ul></details>}
        <p className="rp-note">{assessed.length} of {skills.length} skills had answer evidence.</p>
      </div>
    </div>

    <div className="rp-bottom">
      <div className="rp-panel rp-histogram">
        <h2 className="rp-panel-title">Score per question</h2>
        <ol className="rp-bars">{results.evidence.map((e, i) => <li key={e.questionId}>
          <a href={`#answer-${e.questionId}`} data-meets={e.score >= MEETS ? '' : undefined} data-active={active === e.questionId ? '' : undefined}
            onMouseEnter={() => setActive(e.questionId)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(e.questionId)} onBlur={() => setActive(null)}
            aria-label={`Question ${i + 1}, ${labelFor(e.skillId)}: ${e.score.toFixed(1)} out of 10. Open the scored answer.`}>
            <span className="rp-bar" style={{ scale: `1 ${Math.max(.04, e.score / 10)}` }} /><span className="rp-bar-n">{i + 1}</span></a></li>)}</ol>
      </div>
      <div className="rp-panel rp-donut-panel">
          <h2 className="rp-panel-title">Component scores</h2>
          <div className="rp-donut" style={{ background: conic(components.map(([, v]) => Math.max(.1, v)), SERIES) }} role="img" aria-label={`Component scores out of 10: ${components.map(([id, v]) => `${labelFor(id)} ${v.toFixed(1)}`).join(', ')}`}><span>{(components.reduce((a, [, v]) => a + v, 0) / Math.max(1, components.length)).toFixed(1)}<small>avg /10</small></span></div>
          <ul className="rp-legend">{components.map(([id, v], i) => <li key={id}><i style={{ background: SERIES[i % SERIES.length] }} />{labelFor(id)}<strong>{v.toFixed(1)}</strong></li>)}</ul>
      </div>
      <div className="rp-panel rp-split">
        <h2 className="rp-panel-title">Strengths and gaps</h2>
        <div className="rp-split-body">
          <div className="rp-donut rp-donut-sm" style={{ background: conic([met, short || (met ? 0 : 1)], ['var(--paint-teal)', 'var(--paint-amber)']) }} role="img" aria-label={`${met} answers met the bar, ${short} fell short`}><span>{met}<small>met</small></span></div>
          <ul className="rp-split-list"><li><Icon icon={CircleCheck} /> {results.details.strengths.length} strengths</li><li data-tone="gap"><Icon icon={TriangleAlert} /> {results.gaps.length} role gaps</li>{results.integrityReview && <li><Icon icon={Target} /> {results.integrityReview.totalWarnings ?? results.integrityReview.tabWarnings + results.integrityReview.cameraWarnings} integrity warnings</li>}</ul>
        </div>
      </div>
      <div className="rp-panel rp-next">
        <h2 className="rp-panel-title">Next step</h2>
        {results.details.learningPlan[0] ? <><p><strong>{labelFor(results.details.learningPlan[0].skillId)}</strong>: {results.details.learningPlan[0].targetOutcome}</p></> : <p>{results.details.nextSteps[0] ?? 'Practise again to build more evidence.'}</p>}
        <Button onClick={onRestart}>Practice again <Icon icon={ArrowRight} /></Button>
      </div>
    </div>
  </section>;
}

/** Print or save as PDF: the light theme prints on ivory paper, with every answer expanded; both are restored after. */
function printReport() { window.print(); }
let printState: { theme?: string; closed: HTMLDetailsElement[] } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => {
    if (!document.querySelector('.rp') || printState) return; // a print already in progress keeps its saved state
    const closed = [...document.querySelectorAll<HTMLDetailsElement>('.rp-page details:not([open])')];
    closed.forEach((item) => { item.open = true; });
    printState = { theme: document.documentElement.dataset.theme, closed };
    document.documentElement.dataset.theme = 'light';
  });
  window.addEventListener('afterprint', () => {
    if (!printState) return;
    printState.closed.forEach((item) => { item.open = false; });
    if (printState.theme) document.documentElement.dataset.theme = printState.theme;
    printState = null;
  });
}

/** The report's actual evaluation results as JSON, exactly as the backend returned them. */
function downloadReport(results: InterviewResultsResponse) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `interview-report-${results.sessionId}.json` });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Bubble({ id, skill }: { id: string; skill: InterviewResultsResponse['skillMap'][string] }) {
  return <li data-verdict={skill.verdict}>
    <span className="rp-bubble" style={{ '--fill': skill.samples ? skill.estimate / 10 : 0 } as CSSProperties}><b>{skill.samples ? skill.estimate.toFixed(1) : '—'}</b></span>
    <span className="rp-bubble-label">{labelFor(id)}</span><span className="rp-bubble-verdict">{labelFor(skill.verdict)}</span>
  </li>;
}

function Gauge({ value, max, label, text }: { value: number; max: number; label: string; text: string }) {
  return <div className="rp-gauge" style={{ '--sweep': `${Math.max(0, Math.min(1, value / max)) * 360}deg` } as CSSProperties} role="img" aria-label={`${label}: ${text}`}>
    <span className="rp-gauge-ring" aria-hidden="true" /><strong aria-hidden="true">{text}</strong><span className="rp-gauge-label" aria-hidden="true">{label}</span>
  </div>;
}

function Metric({ label, value, unit, bar, note, accent = false }: { label: string; value: ReactNode; unit: string; bar?: number; note: string; accent?: boolean }) {
  return <div className="rp-panel rp-metric">
    <span className="rp-eyebrow">{label}</span>
    {bar !== undefined && <span className="rp-track" data-accent={accent ? '' : undefined}><span style={{ scale: `${Math.max(0, Math.min(1, bar))} 1` }} /></span>}
    <strong>{value}<small>{unit}</small></strong>
    <p>{note}</p>
  </div>;
}
