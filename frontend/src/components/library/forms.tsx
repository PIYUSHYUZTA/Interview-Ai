import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, InputHTMLAttributes, KeyboardEvent, ReactNode, TextareaHTMLAttributes } from 'react';
import { Icon, SearchIcon, Spinner } from '../icon/Icon';
import { Check, CircleCheck, CircleX, ChevronDown, Eye, EyeOff, File, Upload, X } from '../icon/icons';
import { playSound } from '../sound/sound';
import { ProgressBar } from './display';

/* ── Field frame: label, control, helper/error/success message ── */
export type FieldStatus = 'error' | 'success' | undefined;
interface FieldFrameProps { id: string; label: string; status?: FieldStatus; message?: ReactNode; hint?: ReactNode; loading?: boolean; children: ReactNode; trailing?: ReactNode; floating?: boolean }
function FieldFrame({ id, label, status, message, hint, loading, children, trailing, floating = true }: FieldFrameProps) {
  const note = message ?? hint;
  return <div className="ds-field" data-status={status} data-loading={loading || undefined}>
    {!floating && <label className="ds-field-label" htmlFor={id}>{label}</label>}
    <div className={`ds-field-control ${floating ? 'ds-float-field' : ''}`}>
      {children}
      {floating && <label className="ds-float-label" htmlFor={id}>{label}</label>}
      <span className="ds-field-trailing">
        {loading ? <Spinner size="inline" label="Checking" /> : status === 'error' ? <Icon icon={CircleX} label="Error" /> : status === 'success' ? <Icon icon={CircleCheck} label="Looks good" /> : null}
        {trailing}
      </span>
    </div>
    {note && <p className="ds-field-message" id={`${id}-message`} role={status === 'error' ? 'alert' : undefined}>{note}</p>}
  </div>;
}
const described = (id: string, message?: ReactNode, hint?: ReactNode) => (message ?? hint ? `${id}-message` : undefined);

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'placeholder'> & { label: string; status?: FieldStatus; message?: ReactNode; hint?: ReactNode; loading?: boolean };
/** Text input with a floating label, focus ring, and error / success / checking states. */
export function TextField({ label, status, message, hint, loading, id, ...input }: TextFieldProps) {
  const auto = useId(); const fieldId = id ?? auto;
  return <FieldFrame id={fieldId} label={label} status={status} message={message} hint={hint} loading={loading}>
    <input id={fieldId} className="ds-input" placeholder=" " aria-invalid={status === 'error' || undefined} aria-describedby={described(fieldId, message, hint)} {...input} />
  </FieldFrame>;
}

/** Password input with a show/hide toggle. The toggle is a real button with its own label. */
export function PasswordField({ label = 'Password', status, message, hint, loading, id, ...input }: Omit<TextFieldProps, 'type' | 'label'> & { label?: string }) {
  const auto = useId(); const fieldId = id ?? auto;
  const [visible, setVisible] = useState(false);
  return <FieldFrame id={fieldId} label={label} status={status} message={message} hint={hint} loading={loading}
    trailing={<button type="button" className="ds-field-action" aria-pressed={visible} aria-label={visible ? 'Hide password' : 'Show password'} disabled={input.disabled}
      onClick={() => { playSound('toggle'); setVisible((v) => !v); }}><Icon icon={visible ? EyeOff : Eye} /></button>}>
    <input id={fieldId} className="ds-input" type={visible ? 'text' : 'password'} placeholder=" " aria-invalid={status === 'error' || undefined} aria-describedby={described(fieldId, message, hint)} {...input} />
  </FieldFrame>;
}

/** Search: widens on focus, its icon turns toward the text and pulses while results load; Escape clears. */
export function SearchField({ label = 'Search', value, onValue, loading = false, disabled }: { label?: string; value: string; onValue: (value: string) => void; loading?: boolean; disabled?: boolean }) {
  return <div className="ds-search" data-filled={value ? '' : undefined} data-loading={loading || undefined}>
    <span className="ds-search-icon"><SearchIcon loading={loading} /></span>
    <input type="search" className="ds-input" aria-label={label} placeholder={`${label}…`} value={value} disabled={disabled} aria-busy={loading || undefined}
      onChange={(event) => onValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape' && value) { event.preventDefault(); onValue(''); } }} />
    {value && !disabled && <button type="button" className="ds-field-action" aria-label="Clear search" onClick={() => { playSound('remove'); onValue(''); }}><Icon icon={X} /></button>}
  </div>;
}

/** Textarea that grows with its content (up to `maxRows`), with an optional character count. */
export function TextArea({ label, status, message, hint, maxRows = 10, id, value, onChange, maxLength, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; status?: FieldStatus; message?: ReactNode; hint?: ReactNode; maxRows?: number }) {
  const auto = useId(); const fieldId = id ?? auto;
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = 'auto';
    const line = parseFloat(getComputedStyle(area).lineHeight) || 24;
    area.style.height = `${Math.min(area.scrollHeight + 2, line * maxRows + 26)}px`;
  }, [value, maxRows]);
  const count = typeof value === 'string' && maxLength ? `${value.length} / ${maxLength}` : undefined;
  return <FieldFrame id={fieldId} label={label} status={status} message={message} hint={hint ?? count}>
    <textarea ref={ref} id={fieldId} rows={2} className="ds-input ds-textarea" placeholder=" " value={value} onChange={onChange} maxLength={maxLength}
      aria-invalid={status === 'error' || undefined} aria-describedby={described(fieldId, message, hint ?? count)} {...props} />
  </FieldFrame>;
}

/* ── Select: a custom listbox ── */
export interface Option { value: string; label: string; disabled?: boolean }
/**
 * WAI-ARIA select-only combobox: arrows move, Enter/Space choose, Escape closes, typing a letter jumps to
 * the next match. The list opens with a short clip reveal (180ms).
 */
export function Select({ label, options, value, onValue, placeholder = 'Choose…', disabled, loading, status, message }: { label: string; options: Option[]; value: string | null; onValue: (value: string) => void; placeholder?: string; disabled?: boolean; loading?: boolean; status?: FieldStatus; message?: ReactNode }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(Math.max(0, options.findIndex((o) => o.value === value)));
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const selected = options.find((o) => o.value === value);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const enabled = (index: number) => !options[index]?.disabled;
  const move = (from: number, step: number) => { let next = from; do { next = (next + step + options.length) % options.length; } while (!enabled(next) && next !== from); return next; };
  const choose = (index: number) => { if (!enabled(index)) return; onValue(options[index].value); setOpen(false); playSound('click'); button.current?.focus(); };
  const show = (index = Math.max(0, options.findIndex((o) => o.value === value))) => { setActive(index); setOpen(true); playSound('modalOpen'); };
  const keys = (event: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show(); }
      return;
    }
    const handled: Record<string, () => void> = {
      ArrowDown: () => setActive((i) => move(i, 1)), ArrowUp: () => setActive((i) => move(i, -1)),
      Home: () => setActive(move(-1, 1)), End: () => setActive(move(options.length, -1)),
      Enter: () => choose(active), ' ': () => choose(active), Escape: () => { setOpen(false); },
      Tab: () => setOpen(false),
    };
    if (handled[event.key]) { if (event.key !== 'Tab') event.preventDefault(); handled[event.key](); return; }
    if (event.key.length === 1) {
      const start = (active + 1) % options.length;
      const order = [...options.slice(start), ...options.slice(0, start)];
      const match = order.find((o) => !o.disabled && o.label.toLowerCase().startsWith(event.key.toLowerCase()));
      if (match) setActive(options.indexOf(match));
    }
  };
  return <div className="ds-field ds-select" ref={root} data-open={open || undefined} data-status={status}>
    <span className="ds-field-label" id={`${id}-label`}>{label}</span>
    <button ref={button} type="button" role="combobox" className="ds-select-trigger" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`}
      aria-activedescendant={open ? `${id}-option-${active}` : undefined} aria-invalid={status === 'error' || undefined} aria-busy={loading || undefined} disabled={disabled || loading}
      onClick={() => (open ? setOpen(false) : show())} onKeyDown={keys}>
      <span id={`${id}-value`} className={selected ? '' : 'ds-select-placeholder'}>{loading ? 'Loading options…' : selected?.label ?? placeholder}</span>
      {loading ? <Spinner size="inline" /> : <Icon icon={ChevronDown} className="ds-select-chevron" />}
    </button>
    <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="ds-select-list" tabIndex={-1}>{options.map((option, index) => <li key={option.value} id={`${id}-option-${index}`}
      role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined} data-active={index === active || undefined}
      onPointerEnter={() => enabled(index) && setActive(index)} onPointerDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
      <span>{option.label}</span>{option.value === value && <Icon icon={Check} />}
    </li>)}</ul>
    {message && <p className="ds-field-message" role={status === 'error' ? 'alert' : undefined}>{message}</p>}
  </div>;
}

/* ── Checkbox, radio, switch ── */
/** Native checkbox (keyboard, forms, labels all work) drawn as a box whose tick draws itself when checked. */
export function Checkbox({ label, description, onChange, ...input }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; description?: ReactNode }) {
  return <label className="ds-check" data-disabled={input.disabled || undefined}>
    <input type="checkbox" {...input} onChange={(event) => { playSound('toggle'); onChange?.(event); }} />
    <span className="ds-check-box" aria-hidden="true"><Icon icon={Check} className="ds-check-mark" /></span>
    <span className="ds-check-text"><span>{label}</span>{description && <small>{description}</small>}</span>
  </label>;
}

export function RadioGroup({ label, name, options, value, onValue, disabled }: { label: string; name: string; options: (Option & { description?: string })[]; value: string; onValue: (value: string) => void; disabled?: boolean }) {
  return <fieldset className="ds-radio-group" disabled={disabled}>
    <legend className="ds-field-label">{label}</legend>
    {options.map((option) => <label key={option.value} className="ds-check ds-radio" data-disabled={option.disabled || disabled || undefined}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={option.disabled} onChange={() => { playSound('toggle'); onValue(option.value); }} />
      <span className="ds-check-text"><span>{option.label}</span>{option.description && <small>{option.description}</small>}</span>
    </label>)}
  </fieldset>;
}

/** On/off switch: a pill whose thumb slides. `loading` shows the change is being saved. */
export function Switch({ label, checked, onChecked, disabled, loading, description }: { label: string; checked: boolean; onChecked: (value: boolean) => void; disabled?: boolean; loading?: boolean; description?: ReactNode }) {
  const id = useId();
  return <div className="ds-switch-row">
    <button type="button" role="switch" id={id} aria-checked={checked} aria-busy={loading || undefined} disabled={disabled || loading} className="ds-switch"
      aria-describedby={description ? `${id}-description` : undefined} onClick={() => { playSound('toggle'); onChecked(!checked); }}>
      <span className="ds-switch-thumb">{loading && <Spinner size="inline" />}</span>
    </button>
    <label htmlFor={id} className="ds-switch-label">{label}{description && <small id={`${id}-description`}>{description}</small>}</label>
  </div>;
}

/* ── File upload ── */
/**
 * Drag-and-drop zone that is also a normal file picker (click or Enter/Space). Shows drag-over,
 * accepted and rejected states; `progress` (0-100) shows an upload in flight.
 */
export function FileDrop({ label, accept, maxBytes, files, onFiles, onRemove, progress, disabled, multiple = false }: { label: string; accept: string[]; maxBytes: number; files: File[]; onFiles: (files: File[]) => void; onRemove: (file: File) => void; progress?: number; disabled?: boolean; multiple?: boolean }) {
  const id = useId();
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const take = (list: FileList | null) => {
    const incoming = Array.from(list ?? []);
    const rejected = incoming.find((file) => !accept.some((type) => file.name.toLowerCase().endsWith(type)) || file.size > maxBytes);
    if (rejected) { setError(rejected.size > maxBytes ? `${rejected.name} is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.` : `${rejected.name} is not a ${accept.join(' or ')} file.`); playSound('error'); return; }
    setError(null); playSound('success');
    onFiles(multiple ? [...files, ...incoming] : incoming.slice(0, 1));
  };
  const drag = (event: DragEvent, state: boolean) => { event.preventDefault(); if (!disabled) setOver(state); };
  const state = error ? 'rejected' : over ? 'over' : files.length ? 'accepted' : 'idle';
  return <div className="ds-field">
    <label htmlFor={id} className="ds-drop" data-state={state} data-disabled={disabled || undefined}
      onDragEnter={(e) => drag(e, true)} onDragOver={(e) => drag(e, true)} onDragLeave={(e) => drag(e, false)}
      onDrop={(event) => { drag(event, false); if (!disabled) take(event.dataTransfer.files); }}>
      <input id={id} type="file" accept={accept.join(',')} multiple={multiple} disabled={disabled} aria-describedby={`${id}-help`}
        onChange={(event: ChangeEvent<HTMLInputElement>) => { take(event.target.files); event.target.value = ''; }} />
      <span className="ds-drop-icon"><Icon icon={Upload} size="feature" /></span>
      <strong>{over ? 'Drop to upload' : label}</strong>
      <small id={`${id}-help`}>Drag a file here or choose one · {accept.join(', ')} · up to {Math.round(maxBytes / 1024 / 1024)} MB</small>
    </label>
    {error && <p className="ds-field-message" data-status="error" role="alert">{error}</p>}
    {files.length > 0 && <ul className="ds-file-list">{files.map((file) => <li key={file.name + file.size}>
      <Icon icon={File} /><span>{file.name}</span><small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
      {progress !== undefined && progress < 100 ? <ProgressBar label={`Uploading ${file.name}`} value={progress} compact /> :
        <button type="button" className="ds-field-action" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => { playSound('remove'); onRemove(file); }}><Icon icon={X} /></button>}
    </li>)}</ul>}
  </div>;
}
