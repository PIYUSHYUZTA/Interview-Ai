import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon, IconButton } from '../icon/Icon';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, TrendingDown, TrendingUp, X, type LucideIcon } from '../icon/icons';
import { CountUp, useInViewOnce } from '../motion/reveal';
import { Skeleton } from '../motion/feedback';
import { playSound } from '../sound/sound';
import { SkeletonAvatar, SkeletonTableRows, SkeletonText, type Tone } from './overlays';

/* ── Cards ── */
/** A static surface. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`ds-panel ${className}`}>{children}</div>;
}
/**
 * A card that is a control: it lifts on hover, shows a ring when selected (aria-pressed), dims when
 * disabled, and shows its own skeleton while loading.
 */
export function ChoiceCard({ title, description, icon, selected, onSelect, disabled, loading }: { title: string; description: ReactNode; icon?: LucideIcon; selected: boolean; onSelect: () => void; disabled?: boolean; loading?: boolean }) {
  if (loading) return <div className="ds-panel ds-choice" aria-busy="true"><SkeletonText lines={3} /></div>;
  return <button type="button" className="ds-panel ds-choice ds-lift" aria-pressed={selected} disabled={disabled} onClick={() => { playSound('toggle'); onSelect(); }}>
    {icon && <span className="ds-choice-icon"><Icon icon={icon} size="standalone" /></span>}
    <strong>{title}</strong><span>{description}</span>
  </button>;
}

/* ── Bento grid ── */
export type BentoSpan = 'default' | 'wide' | 'tall' | 'large';
export function BentoGrid({ children, label }: { children: ReactNode; label: string }) {
  return <section className="ds-bento" aria-label={label}>{children}</section>;
}
export function BentoItem({ span = 'default', icon, title, children }: { span?: BentoSpan; icon: LucideIcon; title: string; children: ReactNode }) {
  return <article className="ds-panel ds-bento-item" data-span={span}><span className="ds-choice-icon"><Icon icon={icon} size="standalone" /></span><h3>{title}</h3><p>{children}</p></article>;
}

/* ── Avatar ── */
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
/** Photo when it loads, initials when it does not; an optional presence dot that is also announced. */
export function Avatar({ name, src, status, size = 'md', loading }: { name: string; src?: string; status?: 'online' | 'away' | 'offline'; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (loading) return <SkeletonAvatar size={{ sm: 28, md: 40, lg: 56 }[size]} />;
  return <span className="ds-avatar" data-size={size} role="img" aria-label={status ? `${name}, ${status}` : name}>
    {src && !failed ? <img src={src} alt="" onError={() => setFailed(true)} /> : <span aria-hidden="true">{initials(name)}</span>}
    {status && <i className="ds-avatar-status" data-status={status} aria-hidden="true" />}
  </span>;
}

/* ── Badge, tag, chip ── */
export type BadgeTone = Tone | 'neutral' | 'primary';
export function Badge({ tone = 'neutral', variant = 'subtle', children }: { tone?: BadgeTone; variant?: 'subtle' | 'solid' | 'outline'; children: ReactNode }) {
  return <span className={`ds-badge ds-badge-${variant}`} data-tone={tone}>{children}</span>;
}
export function Tag({ icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return <span className="ds-tag">{icon && <Icon icon={icon} />}{children}</span>;
}
/** A filter chip: pressed when selected; removable chips have their own labelled remove button. */
export function Chip({ children, selected, onToggle, onRemove, disabled }: { children: string; selected?: boolean; onToggle?: () => void; onRemove?: () => void; disabled?: boolean }) {
  return <span className="ds-chip" data-selected={selected || undefined}>
    {onToggle ? <button type="button" aria-pressed={!!selected} disabled={disabled} onClick={() => { playSound('toggle'); onToggle(); }}>{children}</button> : <span>{children}</span>}
    {onRemove && <IconButton icon={X} size="inline" label={`Remove ${children}`} disabled={disabled} className="ds-chip-remove" onClick={() => { playSound('remove'); onRemove(); }} />}
  </span>;
}

/* ── Progress ── */
/** Fills to `value` once visible (animated); without a value it shows indeterminate progress. */
export function ProgressBar({ label, value, max = 100, tone = 'primary', compact = false, showValue = true }: { label: string; value?: number; max?: number; tone?: BadgeTone; compact?: boolean; showValue?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInViewOnce(ref, '0px');
  const ratio = value === undefined ? undefined : Math.min(1, Math.max(0, value / max));
  return <div className="ds-progress" data-compact={compact || undefined} data-tone={tone} ref={ref}>
    {!compact && <div className="ds-progress-head"><span>{label}</span>{showValue && ratio !== undefined && <span>{Math.round(ratio * 100)}%</span>}</div>}
    <div className="ds-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-busy={value === undefined || undefined}>
      <span className="ds-progress-fill" data-indeterminate={ratio === undefined || undefined} style={ratio === undefined ? undefined : { transform: `scaleX(${seen ? ratio : 0})` }} />
    </div>
  </div>;
}

/* ── Stat ── */
export function Stat({ label, value, decimals = 0, suffix, delta, loading }: { label: string; value: number; decimals?: number; suffix?: string; delta?: { value: number; label: string }; loading?: boolean }) {
  return <div className="ds-panel ds-stat" aria-busy={loading || undefined}>
    <span className="ds-stat-label">{label}</span>
    {loading ? <Skeleton width="96px" height="36px" /> : <strong className="ds-stat-value"><CountUp value={value} decimals={decimals} />{suffix && <small>{suffix}</small>}</strong>}
    {delta && !loading && <span className="ds-stat-delta" data-trend={delta.value >= 0 ? 'up' : 'down'}><Icon icon={delta.value >= 0 ? TrendingUp : TrendingDown} />{delta.value >= 0 ? '+' : ''}{delta.value} {delta.label}</span>}
  </div>;
}

/* ── Data table ── */
export interface Column<Row> { key: keyof Row & string; label: string; sortable?: boolean; numeric?: boolean; render?: (row: Row) => ReactNode }
/** Sortable headers (aria-sort), row hover, pagination; skeleton rows while loading; an empty message when empty. */
export function DataTable<Row extends Record<string, string | number>>({ caption, columns, rows, pageSize = 5, loading, empty }: { caption: string; columns: Column<Row>[]; rows: Row[]; pageSize?: number; loading?: boolean; empty?: ReactNode }) {
  const [sort, setSort] = useState<{ key: string; direction: 'ascending' | 'descending' } | null>(null);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const sign = sort.direction === 'ascending' ? 1 : -1;
    return [...rows].sort((a, b) => (a[sort.key] > b[sort.key] ? sign : a[sort.key] < b[sort.key] ? -sign : 0));
  }, [rows, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);
  const toggle = (key: string) => { playSound('click'); setPage(0); setSort((s) => (s?.key === key ? { key, direction: s.direction === 'ascending' ? 'descending' : 'ascending' } : { key, direction: 'ascending' })); };
  const go = (next: number) => { playSound('click'); setPage(next); };
  return <div className="ds-table-wrap">
    <table className="ds-table" aria-busy={loading || undefined}>
      <caption>{caption}</caption>
      <thead><tr>{columns.map((column) => {
        const direction = sort?.key === column.key ? sort.direction : undefined;
        return <th key={column.key} scope="col" aria-sort={column.sortable ? direction ?? 'none' : undefined} data-numeric={column.numeric || undefined}>
          {column.sortable ? <button type="button" onClick={() => toggle(column.key)}>{column.label}<Icon icon={direction === 'ascending' ? ArrowUp : direction === 'descending' ? ArrowDown : ArrowUpDown} /></button> : column.label}
        </th>;
      })}</tr></thead>
      <tbody>{loading ? <SkeletonTableRows rows={pageSize} columns={columns.length} /> : visible.length ? visible.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column.key} data-numeric={column.numeric || undefined}>{column.render ? column.render(row) : row[column.key]}</td>)}</tr>)
        : <tr><td colSpan={columns.length} className="ds-table-empty">{empty ?? 'Nothing to show yet.'}</td></tr>}</tbody>
    </table>
    {!loading && sorted.length > pageSize && <nav className="ds-pagination" aria-label={`${caption} pages`}>
      <span aria-live="polite">{current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length}</span>
      <IconButton icon={ChevronLeft} label="Previous page" disabled={current === 0} onClick={() => go(current - 1)} />
      {Array.from({ length: pages }, (_, index) => <button key={index} type="button" className="ds-page-button" aria-current={index === current ? 'page' : undefined} aria-label={`Page ${index + 1}`} onClick={() => go(index)}>{index + 1}</button>)}
      <IconButton icon={ChevronRight} label="Next page" disabled={current === pages - 1} onClick={() => go(current + 1)} />
    </nav>}
  </div>;
}
