import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { motionTokens, prefersReducedMotion } from '../../design-system/motion';
import { Icon, IconButton } from '../icon/Icon';
import { CircleCheck, CircleX, Info, TriangleAlert, X, type LucideIcon } from '../icon/icons';
import { playSound } from '../sound/sound';
import { Skeleton } from '../motion/feedback';
import { DsButton } from './buttons';

export type Tone = 'info' | 'success' | 'warning' | 'error';
export const toneIcon: Record<Tone, LucideIcon> = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleX };

/* ── Drawer ── */
/** A modal panel that slides in from the right (or up from the bottom); focus stays inside until closed. */
export function Drawer({ title, side = 'right', onClose, children, footer }: { title: string; side?: 'right' | 'bottom'; onClose: () => void; children: ReactNode | ((close: () => void) => ReactNode); footer?: (close: () => void) => ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); playSound('modalOpen'); return () => dialog.close(); }, []);
  const close = () => {
    if (closing.current) return;
    closing.current = true; playSound('modalClose');
    ref.current?.setAttribute('data-closing', '');
    window.setTimeout(onClose, prefersReducedMotion() ? 0 : motionTokens.duration.modalOut * 1000);
  };
  return <dialog ref={ref} className="ds-drawer" data-side={side} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === ref.current) close(); }}>
    <div className="ds-drawer-panel">
      <header className="ds-drawer-head"><h2 id={titleId}>{title}</h2><IconButton icon={X} label="Close" data-tooltip-side="left" onClick={close} /></header>
      <div className="ds-drawer-body">{typeof children === 'function' ? children(close) : children}</div>
      {footer && <footer className="ds-drawer-foot">{footer(close)}</footer>}
    </div>
  </dialog>;
}

/* ── Tooltip ── */
/** Shows `label` after a short hover delay (immediately on keyboard focus), with an arrow; Escape hides it. */
export function Tooltip({ label, side = 'top', children }: { label: string; side?: 'top' | 'bottom'; children: ReactElement<Record<string, unknown>> }) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!shown) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setShown(false); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [shown]);
  const show = (delay: number) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setShown(true), delay); };
  const hide = () => { window.clearTimeout(timer.current); setShown(false); };
  return <span className="ds-tooltip-anchor" onPointerEnter={() => show(400)} onPointerLeave={hide} onFocus={() => show(0)} onBlur={hide}>
    {cloneElement(children, { 'aria-describedby': id })}
    <span role="tooltip" id={id} className="ds-tooltip" data-side={side} data-shown={shown || undefined}>{label}</span>
  </span>;
}

/* ── Popover ── */
/** A small panel anchored below its trigger. Outside click or Escape closes it and returns focus. */
export function Popover({ trigger, title, children, align = 'start' }: { trigger: (props: { 'aria-expanded': boolean; 'aria-controls': string; onClick: () => void }) => ReactElement; title: string; children: ReactNode; align?: 'start' | 'end' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLElement>('[aria-controls]')?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    const panel = root.current?.querySelector<HTMLElement>('.ds-popover');
    panel?.focus();
    // Flip to end alignment when the panel would run past the right edge of the window.
    if (panel && align === 'start' && panel.getBoundingClientRect().right > window.innerWidth) panel.dataset.align = 'end';
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open, align]);
  return <span className="ds-popover-anchor" ref={root}>
    {trigger({ 'aria-expanded': open, 'aria-controls': id, onClick: () => { setOpen((value) => !value); playSound(open ? 'modalClose' : 'modalOpen'); } })}
    <div id={id} role="dialog" aria-label={title} tabIndex={-1} className="ds-popover" data-open={open || undefined} data-align={align} inert={!open}>
      <strong>{title}</strong>{children}
    </div>
  </span>;
}

/* ── Alert banner ── */
export function AlertBanner({ tone = 'info', title, children, action, onDismiss }: { tone?: Tone; title: string; children?: ReactNode; action?: ReactNode; onDismiss?: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const dismiss = () => { playSound('remove'); setLeaving(true); window.setTimeout(() => onDismiss?.(), prefersReducedMotion() ? 0 : motionTokens.duration.modalOut * 1000); };
  return <div className="ds-alert" data-tone={tone} data-leaving={leaving || undefined} role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}>
    <Icon icon={toneIcon[tone]} size="standalone" />
    <div className="ds-alert-text"><strong>{title}</strong>{children && <p>{children}</p>}</div>
    {action && <div className="ds-alert-action">{action}</div>}
    {onDismiss && <IconButton icon={X} label="Dismiss" data-tooltip-side="left" onClick={dismiss} />}
  </div>;
}

/* ── Empty and error states ── */
/** Nothing here yet: a quiet illustration (concentric rings around the subject's icon), a message and one action. */
export function EmptyState({ icon, title, children, action }: { icon: LucideIcon; title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="ds-empty">
    <div className="ds-empty-art" aria-hidden="true"><i /><i /><i /><span><Icon icon={icon} size="feature" /></span></div>
    <h3>{title}</h3><p>{children}</p>{action}
  </div>;
}
/** Something failed: what happened, and a retry that shows progress while it runs. */
export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message: string; onRetry?: () => Promise<unknown> | void }) {
  const [retrying, setRetrying] = useState(false);
  return <div className="ds-error-state" role="alert">
    <span className="ds-error-mark"><Icon icon={CircleX} size="feature" /></span>
    <h3>{title}</h3><p>{message}</p>
    {onRetry && <DsButton variant="secondary" loading={retrying} onClick={async () => { setRetrying(true); try { await onRetry(); } finally { setRetrying(false); } }}>{retrying ? 'Trying again…' : 'Try again'}</DsButton>}
  </div>;
}

/* ── Skeletons for each kind of content ── */
export const SkeletonText = ({ lines = 3 }: { lines?: number }) => <div className="ds-skeleton-stack">{Array.from({ length: lines }, (_, i) => <Skeleton key={i} height="12px" width={i === lines - 1 ? '60%' : '100%'} />)}</div>;
export const SkeletonAvatar = ({ size = 40 }: { size?: number }) => <Skeleton width={`${size}px`} height={`${size}px`} radius="var(--radius-full)" />;
export const SkeletonImage = ({ ratio = '16 / 9' }: { ratio?: string }) => <span className="ds-skeleton ds-skeleton-image" style={{ aspectRatio: ratio }} aria-hidden="true" />;
export const SkeletonButton = () => <Skeleton width="120px" height="40px" radius="var(--radius-md)" />;
export const SkeletonCard = () => <div className="ds-panel ds-skeleton-card"><div className="ds-cluster"><SkeletonAvatar /><div style={{ flex: 1 }}><SkeletonText lines={2} /></div></div><SkeletonImage /><SkeletonText /><SkeletonButton /></div>;
export const SkeletonTableRows = ({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) => <>{Array.from({ length: rows }, (_, r) => <tr key={r} aria-hidden="true">{Array.from({ length: columns }, (_, c) => <td key={c}><Skeleton height="12px" width={c === 0 ? '70%' : '50%'} /></td>)}</tr>)}</>;
