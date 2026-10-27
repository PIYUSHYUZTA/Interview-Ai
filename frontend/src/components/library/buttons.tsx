import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, Spinner, ripple } from '../icon/Icon';
import { Check, Copy, type LucideIcon } from '../icon/icons';
import { playSound } from '../sound/sound';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
/**
 * The library button. Primary is filled and glows on hover; secondary is outlined and its border draws
 * around it on hover; ghost is text until hovered; danger is quiet until hovered, then fills. `loading`
 * shows a spinner and disables the button for the duration.
 */
export function DsButton({ variant = 'primary', size = 'md', loading = false, icon, iconEnd, children, className = '', disabled, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: LucideIcon; iconEnd?: LucideIcon; children: ReactNode }) {
  return <button type="button" {...props} className={`ds-button ds-button-${variant} ds-button-${size} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined}
    onClick={(event) => { playSound(props['aria-pressed'] === undefined ? 'click' : 'toggle'); onClick?.(event); }}>
    {loading ? <Spinner size="inline" /> : icon && <Icon icon={icon} />}
    <span>{children}</span>
    {iconEnd && !loading && <Icon icon={iconEnd} />}
  </button>;
}

/** Copies `text`; the icon turns into a check for two seconds and a live region says what happened. */
export function CopyButton({ text, label = 'Copy', disabled }: { text: string; label?: string; disabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied'); playSound('copy');
    } catch {
      setState('failed'); playSound('error');
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2000);
  };
  const shown = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label;
  return <button type="button" className="ds-button ds-button-secondary ds-button-sm ds-copy" data-state={state} disabled={disabled}
    onPointerDown={ripple} onClick={() => { void copy(); }}>
    <span className="ds-icon-swap" aria-hidden="true" data-copied={state === 'copied' || undefined}><Icon icon={Copy} className="ds-copy-idle" /><Icon icon={Check} className="ds-copy-done" /></span>
    <span>{shown}</span>
    <span className="ds-visually-hidden" role="status">{state === 'idle' ? '' : shown}</span>
    <span className="ds-ripple-host" aria-hidden="true" />
  </button>;
}
