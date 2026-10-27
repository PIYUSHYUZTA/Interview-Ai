import type { ButtonHTMLAttributes, PointerEvent } from 'react';
import { Bell, CircleCheck, LoaderCircle, Menu, Search, X, type LucideIcon } from './icons';

/** 16px beside text, 20px on its own, 24px for feature marks. Nothing else. */
export type IconSize = 'inline' | 'standalone' | 'feature';
const PIXELS: Record<IconSize, number> = { inline: 16, standalone: 20, feature: 24 };
/** One stroke everywhere: 1.5px at every size (absolute, not scaled with the icon). */
export const ICON_STROKE = 1.5;

interface IconProps {
  icon: LucideIcon;
  size?: IconSize;
  /** Only when the icon carries meaning with no visible text next to it; otherwise it is hidden from assistive tech. */
  label?: string;
  className?: string;
}

export function Icon({ icon: Glyph, size = 'inline', label, className }: IconProps) {
  return <Glyph size={PIXELS[size]} strokeWidth={ICON_STROKE} absoluteStrokeWidth focusable="false"
    className={['ds-icon', className].filter(Boolean).join(' ')}
    {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} />;
}

/**
 * Icon-only button: a circle, the label is required and doubles as the visible tooltip. A ripple spreads
 * from the pointer on press; `loading` swaps the glyph for a spinner and disables the button.
 */
export function IconButton({ icon, label, size = 'standalone', className, loading = false, disabled, onPointerDown, ...button }: { icon: LucideIcon; label: string; size?: IconSize; loading?: boolean } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'>) {
  return <button type="button" {...button} disabled={disabled || loading} aria-busy={loading || undefined} aria-label={label} data-tooltip={label} className={['ds-icon-button', className].filter(Boolean).join(' ')}
    onPointerDown={(event) => { ripple(event); onPointerDown?.(event); }}>
    {loading ? <Spinner size={size} /> : <Icon icon={icon} size={size} />}
    <span className="ds-ripple-host" aria-hidden="true" />
  </button>;
}

/** Press feedback: a circle that grows from the pointer and fades (removed when its animation ends). */
export function ripple(event: PointerEvent<HTMLElement>) {
  // Ripples are clipped by a host layer so the tooltip outside the button stays visible.
  const host = event.currentTarget.querySelector<HTMLElement>(':scope > .ds-ripple-host') ?? event.currentTarget;
  const bounds = event.currentTarget.getBoundingClientRect();
  const wave = document.createElement('span');
  wave.className = 'ds-ripple';
  wave.style.left = `${event.clientX - bounds.left}px`;
  wave.style.top = `${event.clientY - bounds.top}px`;
  wave.addEventListener('animationend', () => wave.remove(), { once: true });
  host.append(wave);
  window.setTimeout(() => wave.remove(), 1000); // also when animations are off
}

/** Menu ↔ close: the bars turn 45° into the X. */
export function MenuToggleIcon({ open, size = 'standalone' }: { open: boolean; size?: IconSize }) {
  return <span className={`ds-icon-swap ds-menu-toggle${open ? ' is-open' : ''}`} aria-hidden="true">
    <Icon icon={Menu} size={size} className="ds-menu-toggle-menu" />
    <Icon icon={X} size={size} className="ds-menu-toggle-close" />
  </span>;
}

/** Search mark that pulses while work is in progress. */
export function SearchIcon({ loading = false, size = 'inline' }: { loading?: boolean; size?: IconSize }) {
  return <Icon icon={Search} size={size} className={loading ? 'ds-icon-pulse' : undefined} />;
}

/** Success check that draws itself (circle, then tick) when it mounts. */
export function CheckDrawIcon({ size = 'inline', label }: { size?: IconSize; label?: string }) {
  return <Icon icon={CircleCheck} size={size} label={label} className="ds-check-draw" />;
}

/** Bell that rings (±15°, twice) each time ringKey changes, for example with each new notification. */
export function BellRingIcon({ ringKey, size = 'standalone' }: { ringKey: string | number; size?: IconSize }) {
  return <Icon key={ringKey} icon={Bell} size={size} className="ds-bell-ring" />;
}

/** Loading spinner: smooth ease-in-out rotation. Pair it with visible text or a label. */
export function Spinner({ size = 'standalone', label }: { size?: IconSize; label?: string }) {
  return <Icon icon={LoaderCircle} size={size} label={label} className="ds-spinner" />;
}
