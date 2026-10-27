import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { AnimatePresence, motion, PresenceContext } from 'motion/react';
import { motionTokens, prefersReducedMotion, usePrefersReducedMotion } from '../../design-system/motion';
import { CheckDrawIcon, Icon, IconButton, Spinner } from '../icon/Icon';
import { CircleCheck, CircleAlert, X } from '../icon/icons';
import { Button } from '../ui';
import { playSound } from '../sound/sound';

/* ── Toasts ── */
type Tone = 'success' | 'error' | 'info';
interface Toast { id: number; message: string; tone: Tone; leaving: boolean }
const ToastContext = createContext<(message: string, tone?: Tone, options?: { silent?: boolean }) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

/**
 * Confirms something that happened elsewhere or across a screen change (signed in, signed out). Toasts
 * slide in from the bottom-right, stay for the toast lifetime with a bar showing the time left, and pause
 * while hovered or focused. The timer is a real timer, so it also runs with reduced motion.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const notify = useCallback((message: string, tone: Tone = 'success', options: { silent?: boolean } = {}) => {
    const id = ++nextId.current;
    setToasts((list) => [...list.slice(-2), { id, message, tone, leaving: false }]);
    if (!options.silent) playSound(tone === 'error' ? 'error' : 'notify');
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
    window.setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), prefersReducedMotion() ? 0 : motionTokens.duration.modalOut * 1000);
  }, []);
  return <ToastContext.Provider value={notify}>
    {children}
    <div className="ds-toast-region" role="region" aria-label="Notifications">
      <div role="status" aria-live="polite">{toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />)}</div>
    </div>
  </ToastContext.Provider>;
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(motionTokens.toastLifetime * 1000);
  useEffect(() => {
    if (paused || toast.leaving) return;
    const started = performance.now();
    const timer = window.setTimeout(onDismiss, remaining.current);
    return () => { window.clearTimeout(timer); remaining.current -= performance.now() - started; };
  }, [paused, toast.leaving, onDismiss]);
  return <div className="ds-toast" data-tone={toast.tone} data-leaving={toast.leaving ? '' : undefined} data-paused={paused ? '' : undefined}
    onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
    <Icon icon={toast.tone === 'error' ? CircleAlert : CircleCheck} size="standalone" />
    <span>{toast.message}</span>
    <IconButton icon={X} label="Dismiss notification" data-tooltip-side="left" onClick={() => { playSound('remove'); onDismiss(); }} />
    <span className="ds-toast-progress" aria-hidden="true" />
  </div>;
}

/* ── Skeleton loading ── */
/** A placeholder block in the shape of the content that is loading. */
export function Skeleton({ width = '100%', height = '1em', radius, className = '' }: { width?: string; height?: string; radius?: string; className?: string }) {
  return <span className={`ds-skeleton ${className}`} aria-hidden="true" style={{ width, height, borderRadius: radius }} />;
}
/** Wraps a skeleton layout so assistive technology hears one loading message instead of empty shapes. */
export function SkeletonScreen({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return <div className={`ds-skeleton-screen ${className}`} role="status" aria-live="polite" aria-busy="true">
    <span className="ds-visually-hidden">{label}</span>
    {children}
  </div>;
}

/* ── Submit button: text -> spinner -> checkmark ── */
export type ActionState = 'idle' | 'busy' | 'success';
type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { state: ActionState; busyLabel: string; successLabel: string; variant?: 'primary' | 'secondary' };
export function ActionButton({ state, busyLabel, successLabel, children, className = '', disabled, ...props }: ActionButtonProps) {
  useEffect(() => { if (state === 'success') playSound('success'); }, [state]);
  return <Button {...props} className={`ds-action-button ${className}`} data-state={state} aria-busy={state === 'busy' || undefined} disabled={disabled || state !== 'idle'}>
    <span key={state} className="ds-action-swap">
      {state === 'busy' ? <><Spinner />{busyLabel}</> : state === 'success' ? <><CheckDrawIcon />{successLabel}</> : children}
    </span>
  </Button>;
}
/** Resolves after the checkmark has had time to be seen (immediately with reduced motion). */
export const holdSuccess = () => new Promise<void>((resolve) => window.setTimeout(resolve, prefersReducedMotion() ? 0 : motionTokens.successHold * 1000));

/* ── Error shake ── */
/** Returns a ref and a function that shakes that element (±8px, three times, 400ms). */
export function useShake<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const shake = useCallback(() => {
    playSound('error'); // heard even when the shake is switched off by reduced motion
    const element = ref.current;
    if (!element || prefersReducedMotion()) return;
    element.classList.remove('ds-shake');
    void element.offsetWidth; // restart the animation when errors repeat
    element.classList.add('ds-shake');
  }, []);
  useEffect(() => {
    const element = ref.current;
    const done = () => element?.classList.remove('ds-shake');
    element?.addEventListener('animationend', done);
    return () => element?.removeEventListener('animationend', done);
  }, []);
  return [ref, shake] as const;
}

/* ── Floating label input ── */
type FloatingFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'placeholder'> & { label: string; hint?: ReactNode };
/** An input whose label sits inside it and floats up on focus or once filled. */
export function FloatingField({ label, hint, ...input }: FloatingFieldProps) {
  return <label className="field ds-float-field">
    <input aria-label={label} placeholder=" " {...input} />
    <span className="ds-float-label" aria-hidden="true">{label}</span>
    {hint && <small>{hint}</small>}
  </label>;
}

/* ── Page transitions ── */
/**
 * Fades the outgoing screen out (150ms) and the incoming one in (200ms); use inside
 * <AnimatePresence mode="wait">. `rise` adds a small upward settle for screens inside the workspace;
 * whole-screen swaps stay opacity-only so no transform is left on an ancestor of fixed elements.
 */
export function PageTransition({ children, rise = false, onEnter }: { children: ReactNode; rise?: boolean; onEnter?: () => void }) {
  const reduced = usePrefersReducedMotion();
  const entered = useRef(onEnter);
  useEffect(() => { entered.current?.(); }, []);
  const offset = rise && !reduced ? 8 : 0;
  return <motion.div
    className="ds-page"
    initial={{ opacity: 0, y: offset }}
    animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : motionTokens.duration.pageIn, ease: motionTokens.ease.out } }}
    exit={{ opacity: 0, transition: { duration: reduced ? 0 : motionTokens.duration.pageOut, ease: motionTokens.ease.in } }}
  >
    {/* The screen's own entrances must still play when the transition skips its first fade
        (AnimatePresence initial={false} would otherwise switch them off too). */}
    <PresenceContext.Provider value={null}>{children}</PresenceContext.Provider>
  </motion.div>;
}
export { AnimatePresence };
