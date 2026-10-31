import { useId, useState } from 'react';
import type { CandidateProgress, InterviewResultsResponse } from '../types';
import { Button, Meter, labelFor } from './ui';

/** Smooth path through points (monotone cubic), so the growth line curves without overshooting. */
function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return '';
  const slopes = points.slice(1).map((p, i) => (p.y - points[i].y) / Math.max(1, p.x - points[i].x));
  const tangents = points.map((_, i) => (i === 0 ? slopes[0] : i === points.length - 1 ? slopes[i - 1] : slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2));
  return points.reduce((path, p, i) => {
    if (i === 0) return `M${p.x},${p.y}`;
    const a = points[i - 1], dx = (p.x - a.x) / 3;
    return `${path} C${a.x + dx},${a.y + tangents[i - 1] * dx} ${p.x - dx},${p.y - tangents[i] * dx} ${p.x},${p.y}`;
  }, '');
}

const W = 640, H = 220, LEFT = 36, RIGHT = 620, TOP = 16, BOTTOM = 188;
const yFor = (score: number) => BOTTOM - (score / 100) * (BOTTOM - TOP);

/**
 * "Performance growth" (dashboard reference: area curve + dashed comparison line + range controls).
 * The filled curve is the overall score; the dashed line is one skill (estimate × 10) from the same
 * comparison group. Only saved assessments are plotted; a trend needs two of them.
 */
export function GrowthChart({ progress, onReport }: { progress: CandidateProgress; onReport: (id: string) => void }) {
  const gradientId = useId();
  const cohorts = [...new Map(progress.reports.map((r) => [r.comparisonKey, r])).values()];
  const [selected, setSelected] = useState('');
  const key = selected || cohorts.at(-1)?.comparisonKey;
  const reports = progress.reports.filter((r) => r.comparisonKey === key);
  const skills = [...new Set(reports.flatMap((r) => Object.entries(r.skillMap).filter(([, s]) => s.samples > 0).map(([id]) => id)))];
  const [skill, setSkill] = useState('');
  const compare = skills.includes(skill) ? skill : skills[0];
  const x = (i: number) => LEFT + (i * (RIGHT - LEFT)) / Math.max(1, reports.length - 1);
  const overall = reports.map((r, i) => ({ x: x(i), y: yFor(r.overallScore), report: r }));
  const skillLine = compare ? reports.flatMap((r, i) => (r.skillMap[compare]?.samples ? [{ x: x(i), y: yFor(r.skillMap[compare].estimate * 10) }] : [])) : [];
  const line = smoothPath(overall);
  const date = (r: InterviewResultsResponse) => new Date(r.details.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return <section className="ws-panel ws-growth" aria-labelledby="ws-growth-title">
    <header className="ws-panel-head">
      <div><h2 id="ws-growth-title">Performance growth</h2><p>Overall score per saved assessment{compare ? <>, with <span className="ws-key-dashed">{labelFor(compare)}</span> for comparison</> : ''}.</p></div>
      <div className="ws-controls">
        {cohorts.length > 1 && <label className="ws-select"><span className="ds-visually-hidden">Comparison group</span><select aria-label="Progress comparison group" value={key} onChange={(e) => setSelected(e.target.value)}>{cohorts.map((r, i) => <option key={r.comparisonKey} value={r.comparisonKey}>{r.roleTitle} · group {i + 1}</option>)}</select></label>}
        {skills.length > 0 && <div className="ws-pills" role="group" aria-label="Comparison skill">{skills.slice(0, 4).map((id) => <button key={id} type="button" aria-pressed={id === compare} onClick={() => setSkill(id)}>{labelFor(id)}</button>)}</div>}
      </div>
    </header>
    {reports.length >= 2 ? <figure className="ws-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Overall score across ${reports.length} saved assessments, from ${reports[0].overallScore.toFixed(1)} to ${reports.at(-1)!.overallScore.toFixed(1)} out of 100`}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style={{ stopColor: 'var(--paint-teal)' }} stopOpacity=".32" /><stop offset="100%" style={{ stopColor: 'var(--paint-teal)' }} stopOpacity="0" /></linearGradient></defs>
        {[0, 50, 100].map((v) => <g key={v} className="ws-grid"><line x1={LEFT} x2={RIGHT} y1={yFor(v)} y2={yFor(v)} /><text x="0" y={yFor(v) + 4}>{v}</text></g>)}
        <path d={`${line} L${RIGHT},${BOTTOM} L${LEFT},${BOTTOM} Z`} fill={`url(#${gradientId})`} />
        {skillLine.length > 1 && <path className="ws-line-dashed" d={smoothPath(skillLine)} fill="none" />}
        <path className="ws-line" d={line} fill="none" pathLength={1} />
        {overall.map((p) => <circle key={p.report.sessionId} className="ws-point" cx={p.x} cy={p.y} r="4"><title>{date(p.report)}: {p.report.overallScore.toFixed(1)}/100</title></circle>)}
      </svg>
      <figcaption className="ws-axis">{reports.map((r, i) => <span key={r.sessionId}>#{i + 1} · {date(r)}</span>)}</figcaption>
    </figure> : <div className="ws-chart-empty"><p>Complete two interviews in the same comparison group to see your growth.</p></div>}
    <details className="ws-method"><summary>How scores are compared</summary><p>{progress.methodology}</p></details>
    <table className="ds-visually-hidden"><caption>Saved assessments in this comparison group</caption><thead><tr><th>Date</th><th>Overall</th>{compare && <th>{labelFor(compare)}</th>}<th>Report</th></tr></thead>
      <tbody>{reports.map((r) => <tr key={r.sessionId}><td>{date(r)}</td><td>{r.overallScore.toFixed(1)}</td>{compare && <td>{r.skillMap[compare]?.samples ? (r.skillMap[compare].estimate).toFixed(1) : '—'}</td>}<td><button type="button" onClick={() => onReport(r.sessionId)}>Open report</button></td></tr>)}</tbody></table>
  </section>;
}

/** Latest observed skills, repeated gaps and recommended practice (below the dashboard's first screen). */
export function SkillProfile({ progress, onReport }: { progress: CandidateProgress; onReport: (id: string) => void }) {
  return <section className="ws-panel ws-skills" aria-labelledby="ws-skills-title">
    <header className="ws-panel-head"><div><h2 id="ws-skills-title">Current skill profile</h2><p>Latest observed evidence for each skill.</p></div></header>
    {progress.currentSkills.length ? <div className="ws-skill-grid">{progress.currentSkills.map((s) => <article key={s.skillId}><Meter label={labelFor(s.skillId)} value={s.estimate} /><p>{labelFor(s.verdict)} · {Math.round(s.confidence * 100)}% confidence</p><small>{s.roleTitle} · {new Date(s.date).toLocaleDateString()}</small><Button variant="ghost" onClick={() => onReport(s.sessionId)}>Source assessment</Button></article>)}</div> : <p>No assessed skills yet.</p>}
    <div className="ws-skill-notes">
      <div><h3>Repeated gaps</h3>{progress.repeatedWeaknesses.length ? progress.repeatedWeaknesses.map((s) => <p key={s.skillId}>{labelFor(s.skillId)} · observed in {s.count} interviews · {s.stillCurrent ? 'still present in latest evidence' : 'no longer shown in latest evidence'}</p>) : <p>No repeated gaps recorded yet.</p>}</div>
      <div><h3>Recommended practice</h3>{progress.recommendations.length ? <ol className="practice-list">{progress.recommendations.map((r) => <li key={r.skillId}><strong>{labelFor(r.skillId)}</strong>: {r.targetOutcome}<p>{r.reason}</p></li>)}</ol> : <p>Complete an interview for evidence-based recommendations.</p>}</div>
    </div>
  </section>;
}
