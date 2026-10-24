import type { AnswerFeedback } from '../types';
import { Meter } from './ui';
export function AnswerReview({ feedback }: { feedback: AnswerFeedback }) {
  return <div className="answer-review"><div className="answer-review-grid"><section><h3>What worked</h3>{feedback.strengths.length ? <ul>{feedback.strengths.map((text) => <li key={text}>{text}</li>)}</ul> : <p>No rubric area reached the strong-evidence threshold on this answer.</p>}</section><section><h3>What to improve</h3>{feedback.improvements.length ? <ul>{feedback.improvements.map((text) => <li key={text}>{text}</li>)}</ul> : <p>All scored rubric areas reached the strong-evidence threshold. Keep explaining trade-offs and concrete examples.</p>}</section></div><div className="answer-rubric">{feedback.criteria.map((criterion) => <Meter key={criterion.key} label={criterion.label} value={criterion.score} />)}</div></div>;
}
