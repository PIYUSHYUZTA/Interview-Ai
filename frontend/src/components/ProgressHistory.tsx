import { useId, useState } from 'react';
import type { CandidateProgress } from '../types';
import { Button, Card, Meter, labelFor } from './ui';

export function ProgressHistory({ progress, onReport }: { progress: CandidateProgress; onReport: (id: string) => void }) {
  const [selected, setSelected] = useState('');
  const [metric, setMetric] = useState('overall');
  const gradientId = useId();
  const cohorts = [...new Map(progress.reports.map((r) => [r.comparisonKey, r])).values()];
  const key = selected || cohorts.at(-1)?.comparisonKey;
  const reports = progress.reports.filter((r) => r.comparisonKey === key);
  const skills = [...new Set(reports.flatMap((r) => Object.entries(r.skillMap).filter(([, skill]) => skill.samples > 0).map(([id]) => id)))];
  const activeMetric = skills.includes(metric) ? metric : 'overall';
  const points = reports.flatMap((r) => activeMetric === 'overall' ? [{ report: r, score: r.overallScore }] : r.skillMap[activeMetric]?.samples ? [{ report: r, score: r.skillMap[activeMetric].estimate * 10 }] : []);
  const coordinates = points.map((p, i) => ({ ...p, x: 44 + i * 556 / Math.max(1, points.length - 1), y: 154 - p.score * 1.3 }));
  const line = coordinates.map((p) => `${p.x},${p.y}`).join(' ');
  return <>
    <Card className="skill-development"><div className="section-heading"><div><p className="eyebrow">SAVED ASSESSMENTS</p><h2>Progress over time</h2></div></div>
      <p>{progress.methodology}</p>
      {cohorts.length > 0 && <div className="progress-controls"><label>Comparison group<select aria-label="Progress comparison group" value={key} onChange={(e) => setSelected(e.target.value)}>{cohorts.map((r, i) => <option key={r.comparisonKey} value={r.comparisonKey}>{r.roleTitle} · {r.providerName} · plan {i + 1}</option>)}</select></label><label>Measure<select aria-label="Progress measure" value={activeMetric} onChange={(e) => setMetric(e.target.value)}><option value="overall">Overall assessment / 100</option>{skills.map((id) => <option key={id} value={id}>{labelFor(id)} / 10</option>)}</select></label></div>}
      {points.length >= 2 ? <figure className="chart-frame"><svg viewBox="0 0 640 178" role="img" aria-label={activeMetric === 'overall' ? 'Saved overall scores from zero to one hundred, oldest to newest' : `Saved ${labelFor(activeMetric)} scores from zero to ten, oldest to newest`}>
        <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#53d9f5" stopOpacity=".24" /><stop offset="100%" stopColor="#53d9f5" stopOpacity=".01" /></linearGradient></defs>
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><text x="2" y={158 - v * 1.3} fill="currentColor" fontSize="11">{activeMetric === 'overall' ? v : v / 10}</text><line x1="38" x2="610" y1={154 - v * 1.3} y2={154 - v * 1.3} stroke="currentColor" opacity=".12" strokeDasharray="3 5" /></g>)}
        <polygon points={`44,154 ${line} 600,154`} fill={`url(#${gradientId})`} />
        <polyline fill="none" stroke="#67dcff" strokeWidth="2.5" strokeLinejoin="round" points={line} />
        {coordinates.map((p) => <g key={p.report.sessionId}><circle cx={p.x} cy={p.y} r="5" fill="#0d2339" stroke="#87e5ff" strokeWidth="2"><title>{new Date(p.report.details.completedAt).toLocaleString()}: {(activeMetric === 'overall' ? p.score : p.score / 10).toFixed(1)}</title></circle></g>)}
      </svg><figcaption className="chart-caption"><span>{new Date(points[0].report.details.completedAt).toLocaleDateString()}</span><span>{new Date(points.at(-1)!.report.details.completedAt).toLocaleDateString()}</span></figcaption></figure> : <div className="development-empty">Complete two interviews with evidence for this measure in the same comparison group to display a trend.</div>}
      <div className="history-list">{reports.map((r) => <article key={r.sessionId}><div className="history-title"><h3>{new Date(r.details.completedAt).toLocaleString()}</h3><p>{r.overallScore.toFixed(1)}/100 · {Object.entries(r.skillMap).filter(([, s]) => s.samples > 0).map(([id, s]) => `${labelFor(id)} ${s.estimate.toFixed(1)}/10`).join(' · ')}</p></div><Button variant="ghost" onClick={() => onReport(r.sessionId)}>Open report</Button></article>)}</div>
    </Card>
    <Card className="skill-development"><p className="eyebrow">LATEST OBSERVED EVIDENCE</p><h2>Current skill profile</h2><div className="development-grid">{progress.currentSkills.map((s) => <article key={s.skillId}><Meter label={labelFor(s.skillId)} value={s.estimate} /><p>{labelFor(s.verdict)} · {Math.round(s.confidence * 100)}% confidence</p><small>{s.roleTitle} · {s.providerName} · {new Date(s.date).toLocaleDateString()}</small><Button variant="ghost" onClick={() => onReport(s.sessionId)}>Source assessment</Button></article>)}</div>{!progress.currentSkills.length && <p>No assessed skills yet.</p>}</Card>
    <Card className="skill-development"><h2>Repeated weaknesses</h2>{progress.repeatedWeaknesses.length ? progress.repeatedWeaknesses.map((s) => <p key={s.skillId}>{labelFor(s.skillId)} · observed gap in {s.count} interviews · {s.stillCurrent ? 'still present in latest evidence' : 'latest evidence no longer shows a gap'}</p>) : <p>No repeated demonstrated gaps recorded yet.</p>}<h3>Recommended practice</h3>{progress.recommendations.length ? <ol className="practice-list">{progress.recommendations.map((r) => <li key={r.skillId}><strong>{labelFor(r.skillId)}</strong>: {r.targetOutcome}<p>{r.reason}</p></li>)}</ol> : <p>Complete an interview for evidence-based recommendations.</p>}</Card>
  </>;
}
