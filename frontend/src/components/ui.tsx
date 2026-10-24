import { RetroButton } from './vendor/retro-button';
import AILoader from './vendor/smooth-ai-loader';
import './vendor/vendor.css';
import { useEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <RetroButton type="button" variant={variant === 'primary' ? 'default' : variant === 'danger' ? 'destructive' : variant} className={`btn btn-${variant} ${className}`} {...props} />;
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section>; }
export function Status({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`status ${tone}`}><i />{children}</span>; }
export function ErrorNotice({ message, retry }: { message: string | null; retry?: () => void }) {
  return message ? <div role="alert" className="notice error">{message}{retry && <Button variant="ghost" onClick={retry}>Try again</Button>}</div> : null;
}
export function Loading({ label = 'Loading…' }: { label?: string }) { return <div className="loading"><AILoader label={label} variant="dots" /></div>; }
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) { return <div className="empty-state"><span className="empty-mark">↗</span><h3>{title}</h3><p>{children}</p>{action}</div>; }
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="modal" onCancel={(e) => { e.preventDefault(); onClose(); }} aria-labelledby="modal-title"><h2 id="modal-title">{title}</h2>{children}</dialog>;
}
export function Meter({ label, value, max = 10 }: { label: string; value: number; max?: number }) {
  return <div className="meter"><div><span>{label}</span><strong>{value.toFixed(1)}<small> / {max}</small></strong></div><progress aria-label={label} max={max} value={value} /></div>;
}
export function ScoreRing({ score, label = 'Assessment score' }: { score: number | null; label?: string }) {
  return <div className="score-ring" role="img" aria-label={score === null ? 'No assessment yet' : `${label} ${score.toFixed(1)} out of 100`}>
    <svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="66" /><circle className="score-arc" cx="80" cy="80" r="66" pathLength="100" strokeDasharray={`${score ?? 0} 100`} /></svg>
    <div><strong>{score === null ? '—' : score.toFixed(1)}</strong><span>{score === null ? 'NOT ASSESSED' : 'OUT OF 100'}</span></div>
  </div>;
}
export const labelFor = (value: string) => value.replaceAll('_', ' ').replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
