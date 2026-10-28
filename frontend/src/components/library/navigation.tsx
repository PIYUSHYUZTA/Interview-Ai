import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { motionTokens, usePrefersReducedMotion } from '../../design-system/motion';
import { Icon, MenuToggleIcon, ripple } from '../icon/Icon';
import { setTheme, useTheme, type Theme } from '../../design-system/theme';
import { ArrowRight, ChevronRight, Moon, Sun, type LucideIcon } from '../icon/icons';
import { SoundToggle } from '../sound/SoundToggle';
import { playSound } from '../sound/sound';

/* ── Theme toggle: the moon turns away and the sun turns in (and back) ── */
export function ThemeToggle({ tooltipSide = 'bottom' }: { tooltipSide?: 'bottom' | 'left' }) {
  const current = useTheme();
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  return <button type="button" className="ds-icon-button ds-theme-toggle" data-theme-icon={current} aria-label={`Switch to ${next} theme`} data-tooltip={`Switch to ${next} theme`} data-tooltip-side={tooltipSide} data-tooltip-align="end"
    onPointerDown={ripple} onClick={(event) => { playSound('toggle'); setTheme(next, event.currentTarget.querySelector<HTMLElement>('.ds-theme-icon')); }}>
    <span className="ds-icon-swap ds-theme-icon" aria-hidden="true"><Icon icon={Moon} size="standalone" className="ds-theme-moon" /><Icon icon={Sun} size="standalone" className="ds-theme-sun" /></span>
    <span className="ds-ripple-host" aria-hidden="true" />
  </button>;
}

/* ── Top navbar ── */
export interface NavLink { href: string; label: string; current?: boolean }
/**
 * Logo, links, call to action, theme and sound toggles. Condenses past 80px of scroll (without moving the
 * page) and collapses to a full-screen menu on small screens.
 */
export function Navbar({ logo, links, cta, onCta }: { logo: ReactNode; links: NavLink[]; cta: string; onCta: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 80);
    update(); window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return <header className={`ds-navbar ${scrolled ? 'is-scrolled' : ''}`}>
    <a className="ds-navbar-logo" href="#top">{logo}</a>
    <nav aria-label="Primary" className="ds-navbar-links">{links.map((link) => <a key={link.href} href={link.href} aria-current={link.current ? 'page' : undefined}>{link.label}</a>)}</nav>
    <div className="ds-navbar-actions">
      <ThemeToggle />
      <SoundToggle />
      <button type="button" className="ds-button ds-button-primary ds-navbar-cta" onClick={onCta}>{cta}<Icon icon={ArrowRight} /></button>
      <button type="button" className="ds-navbar-menu ds-icon-button ds-has-tooltip" aria-expanded={open} aria-controls="ds-mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} data-tooltip={open ? 'Close menu' : 'Open menu'} data-tooltip-side={open ? 'left' : 'bottom'} data-tooltip-align="end" onClick={() => setOpen((value) => !value)}><MenuToggleIcon open={open} /></button>
    </div>
    <MobileMenu id="ds-mobile-menu" open={open} onClose={() => setOpen(false)} links={links} cta={cta} onCta={onCta} />
  </header>;
}

/** Full-screen overlay; its links arrive one after another (80ms apart). Escape closes it. */
export function MobileMenu({ id, open, onClose, links, cta, onCta }: { id: string; open: boolean; onClose: () => void; links: NavLink[]; cta: string; onCta: () => void }) {
  const reduced = usePrefersReducedMotion();
  const first = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', escape);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', escape); document.body.style.overflow = ''; };
  }, [open, onClose]);
  const item = (index: number) => ({
    initial: reduced ? false as const : { opacity: 0, y: motionTokens.distance.reveal },
    animate: { opacity: 1, y: 0, transition: { duration: reduced ? 0 : motionTokens.duration.reveal, delay: reduced ? 0 : 0.06 + index * motionTokens.stagger.item, ease: motionTokens.ease.out } },
  });
  return <AnimatePresence>{open && <motion.div id={id} className="ds-mobile-menu" role="dialog" aria-modal="true" aria-label="Menu"
    initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: reduced ? 0 : motionTokens.duration.pageOut } }} transition={{ duration: reduced ? 0 : motionTokens.duration.pageIn }}>
    <nav aria-label="Mobile">{links.map((link, index) => <motion.a key={link.href} ref={index === 0 ? first : undefined} href={link.href} onClick={onClose} {...item(index)}>{link.label}<Icon icon={ArrowRight} /></motion.a>)}</nav>
    <motion.div {...item(links.length)}><button type="button" className="ds-button ds-button-primary" onClick={() => { onClose(); onCta(); }}>{cta}<Icon icon={ArrowRight} /></button></motion.div>
  </motion.div>}</AnimatePresence>;
}

/* ── Sidebar ── */
export interface SidebarItem { id: string; label: string; icon: LucideIcon; badge?: string; disabled?: boolean; loading?: boolean }
export function Sidebar({ label, items, current, onSelect, footer, landmark = true }: { label: string; items: SidebarItem[]; current: string; onSelect: (id: string) => void; footer?: ReactNode; landmark?: boolean }) {
  const Root = landmark ? 'aside' : 'div'; // a page-level sidebar is complementary content; a demo is not
  return <Root className="ds-sidebar">
    <nav aria-label={label}><ul>{items.map((item) => <li key={item.id}>
      <button type="button" className="ds-sidebar-item" aria-current={item.id === current ? 'page' : undefined} disabled={item.disabled || item.loading} aria-busy={item.loading || undefined} onClick={() => { playSound('click'); onSelect(item.id); }}>
        <Icon icon={item.icon} size="standalone" /><span>{item.label}</span>{item.badge && <span className="ds-badge ds-badge-subtle" data-tone="primary">{item.badge}</span>}
      </button>
    </li>)}</ul></nav>
    {footer && <div className="ds-sidebar-footer">{footer}</div>}
  </Root>;
}

/* ── Breadcrumbs ── */
export function Breadcrumbs({ items }: { items: { label: string; onSelect?: () => void }[] }) {
  return <nav aria-label="Breadcrumb" className="ds-breadcrumbs"><ol>{items.map((item, index) => {
    const last = index === items.length - 1;
    return <li key={item.label}>
      {last || !item.onSelect ? <span aria-current={last ? 'page' : undefined}>{item.label}</span> : <button type="button" onClick={item.onSelect}>{item.label}</button>}
      {!last && <Icon icon={ChevronRight} className="ds-breadcrumb-separator" />}
    </li>;
  })}</ol></nav>;
}

/* ── Tabs with a sliding underline ── */
export interface Tab { id: string; label: string; content: ReactNode; disabled?: boolean; loading?: boolean }
/** WAI-ARIA tabs: arrow keys, Home and End move between tabs; the underline slides to the selected one. */
export function Tabs({ label, tabs, initial }: { label: string; tabs: Tab[]; initial?: string }) {
  const [selected, setSelected] = useState(initial ?? tabs[0].id);
  const base = useId();
  const reduced = usePrefersReducedMotion();
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const enabled = tabs.filter((tab) => !tab.disabled);
  const choose = (id: string) => { if (id !== selected) playSound('toggle'); setSelected(id); refs.current.get(id)?.focus(); };
  const keys = (event: KeyboardEvent) => {
    const index = enabled.findIndex((tab) => tab.id === selected);
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: enabled.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    choose(enabled[(target + enabled.length) % enabled.length].id);
  };
  const active = tabs.find((tab) => tab.id === selected)!;
  return <div className="ds-tabs">
    <div role="tablist" aria-label={label} className="ds-tablist" onKeyDown={keys}>{tabs.map((tab) => <button key={tab.id} ref={(node) => { if (node) refs.current.set(tab.id, node); }}
      type="button" role="tab" id={`${base}-${tab.id}`} aria-controls={`${base}-${tab.id}-panel`} aria-selected={tab.id === selected} tabIndex={tab.id === selected ? 0 : -1}
      disabled={tab.disabled} className="ds-tab" onClick={() => choose(tab.id)}>
      {tab.label}
      {tab.id === selected && <motion.span className="ds-tab-indicator" layoutId={`${base}-indicator`} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 36 }} />}
    </button>)}</div>
    <div role="tabpanel" id={`${base}-${active.id}-panel`} aria-labelledby={`${base}-${active.id}`} tabIndex={0} className="ds-tabpanel" aria-busy={active.loading || undefined}>{active.content}</div>
  </div>;
}
