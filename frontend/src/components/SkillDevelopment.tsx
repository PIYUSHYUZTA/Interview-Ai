import type { InterviewResultsResponse } from '../types';
import { Card, Meter, labelFor } from './ui';

export function SkillDevelopment({ latest, previous }: { latest: InterviewResultsResponse | null; previous: InterviewResultsResponse | null }) {
  const observed = latest ? Object.entries(latest.skillMap).filter(([, skill]) => skill.samples > 0) : [];
  return <Card className="skill-development"><div className="section-heading"><div><p className="eyebrow">YOUR DEVELOPMENT</p><h2>Skill development</h2></div><span className="tiny-label">OBSERVED PROFICIENCY / 10</span></div>
    <p>{previous ? 'Latest vs. previous assessment with the same account, role, provider and plan settings. Changes describe these interviews, not a guaranteed improvement in ability.' : 'Your latest assessment establishes a baseline. Complete another interview with the same account, role, provider and plan settings to compare.'}</p>
    {observed.length ? <div className="development-grid">{observed.map(([id, skill]) => {
      const before = previous?.skillMap[id]; const delta = before?.samples ? skill.estimate - before.estimate : null;
      return <article key={id}><Meter label={labelFor(id)} value={skill.estimate} /><div className="development-meta"><span>{before?.samples ? `Previous ${before.estimate.toFixed(1)}` : 'No comparable baseline'}</span><strong className={delta === null || delta === 0 ? '' : delta > 0 ? 'trend-up' : 'trend-down'}>{delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}</strong></div><small>{skill.samples} answers · {Math.round(skill.confidence * 100)}% confidence</small></article>;
    })}</div> : <div className="development-empty">Your first completed interview will reveal your starting point. No skill scores are estimated before you answer.</div>}
  </Card>;
}
