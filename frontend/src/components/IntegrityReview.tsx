import type { InterviewResultsResponse } from '../types';
import { Card, Status } from './ui';

const LABELS: Record<string, string> = {
  tab_hidden: 'Interview tab hidden', camera_obstructed: 'Camera image unusable (technical)',
  multiple_faces: 'More than one face', face_absent: 'No face in view', phone_visible: 'Possible phone in view',
  gaze_away: 'Eyes off-centre', head_turned: 'Head turned away', hand_near_face: 'Hand near face',
  position_changed: 'Moved from starting position', repeated_head_turns: 'Repeated head turns', repeated_hand_pattern: 'Repeated hand movements',
};
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

/** Counted warnings and camera incidents recorded during the interview, each with its explanation. Shown, never scored. */
export function IntegrityReview({ review }: { review: NonNullable<InterviewResultsResponse['integrityReview']> }) {
  return <Card className="integrity-review"><p className="eyebrow">MONITORING RECORD</p><h2>Integrity review</h2>
    <p className="muted">Warnings: {review.totalWarnings ?? review.tabWarnings + review.cameraWarnings} ({review.tabWarnings} tab, {review.cameraWarnings} camera). {review.note}</p>
    {review.incidents.length ? <ol className="integrity-incidents">{review.incidents.map((item, index) => <li key={index}>
      <div className="integrity-incident-head"><strong>{LABELS[item.eventType] ?? item.eventType}</strong>
        <Status tone={item.counted ? 'warning' : ''}>{item.counted ? `Warning ${item.warningNumber || ''}`.trim() : item.tier === 'warning' ? 'Qualifying incident · within cooldown, not counted' : 'Review note'}</Status></div>
      <p className="integrity-incident-meta">at {clock(item.startedAtMs)} · {item.occurrences > 1 ? `${item.occurrences} occurrences` : `${Math.round(item.durationMs / 1000)} s${item.ongoingAtEnd ? ' (still ongoing at the end)' : ''}`}{item.confidence !== null ? ` · detector score ${item.confidence.toFixed(2)}` : ''}</p>
      <p>{item.explanation}</p></li>)}</ol>
      : <p>No warnings or sustained camera incidents were recorded.</p>}
  </Card>;
}
