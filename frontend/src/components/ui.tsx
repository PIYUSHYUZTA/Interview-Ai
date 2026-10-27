import { RetroButton } from './vendor/retro-button';
import { Spinner } from './icon/Icon';
import { motionTokens, prefersReducedMotion } from '../design-system/motion';
import { playSound } from './sound/sound';
import { EmptyState as LibraryEmptyState } from './library/overlays';
import { Inbox } from './icon/icons';
import './vendor/vendor.css';
import { useEffect, useRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

/**
 * A soft tick confirms the press; buttons that switch something on or off (aria-pressed) click instead.
 * `loading` shows a spinner beside the label and disables the button until the work finishes.
 */
export function Button({ variant = 'primary', className = '', onClick, loading = false, disabled, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean }) {
  return <RetroButton type="button" variant={variant === 'primary' ? 'default' : variant === 'danger' ? 'destructive' : variant} className={`btn btn-${variant} ${className}`} {...props}
    disabled={disabled || loading} aria-busy={loading || undefined}
    onClick={(event) => { playSound(props['aria-pressed'] === undefined ? 'click' : 'toggle'); onClick?.(event); }}>{loading && <Spinner size="inline" />}{children}</RetroButton>;
}
export function Card({ children, className = '', ...section }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) { return <section {...section} className={`card ${className}`}>{children}</section>; }
export function Status({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`status ${tone}`}><i />{children}</span>; }
export function ErrorNotice({ message, retry }: { message: string | null; retry?: () => void }) {
  return message ? <div role="alert" className="notice error">{message}{retry && <Button variant="ghost" onClick={retry}>Try again</Button>}</div> : null;
}
export function Loading({ label = 'Loading…' }: { label?: string }) { return <div className="loading" role="status" aria-live="polite"><Spinner /><span>{label}</span></div>; }
/** Kept for existing call sites; renders the library empty state (illustration, message, one action). */
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) { return <LibraryEmptyState icon={Inbox} title={title} action={action}>{children}</LibraryEmptyState>; }
/** Opens at 96% scale and settles (200ms); closes the same way (150ms) before handing back control. */
export function Modal({ title, children, onClose }: { title: string; children: ReactNode | ((close: () => void) => ReactNode); onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); playSound('modalOpen'); return () => dialog.close(); }, []);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    playSound('modalClose');
    ref.current?.setAttribute('data-closing', '');
    window.setTimeout(onClose, prefersReducedMotion() ? 0 : motionTokens.duration.modalOut * 1000);
  };
  return <dialog ref={ref} className="modal ds-modal" onCancel={(e) => { e.preventDefault(); close(); }} aria-labelledby="modal-title"><h2 id="modal-title">{title}</h2>{typeof children === 'function' ? children(close) : children}</dialog>;
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
