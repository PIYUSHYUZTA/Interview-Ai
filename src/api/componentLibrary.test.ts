import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Guards the component library (frontend/src/components/library): every component in the brief exists,
// styles use tokens only (so both themes work), each interactive component styles all of its states, and
// the accessible patterns are in place.
const read = (file: string) => readFileSync(`frontend/src/${file}`, 'utf8').replace(/\r\n/g, '\n');
const library = ['navigation', 'forms', 'buttons', 'overlays', 'display', 'NotFound'].map((name) => read(`components/library/${name}.tsx`)).join('\n');
const css = read('design-system/components.css');
const plain = css.replace(/\/\*[\s\S]*?\*\//g, '');
const exported = (name: string) => new RegExp(`export (?:function|const) ${name}\\b`).test(library + read('components/motion/feedback.tsx') + read('components/icon/Icon.tsx') + read('components/ui.tsx') + read('components/motion/reveal.tsx'));

describe('component library', () => {
  it('has every component the brief lists', () => {
    const components = [
      'Navbar', 'MobileMenu', 'Sidebar', 'Breadcrumbs', 'Tabs', 'ThemeToggle',
      'TextField', 'PasswordField', 'SearchField', 'TextArea', 'Select', 'Checkbox', 'RadioGroup', 'Switch', 'FileDrop', 'ActionButton',
      'DsButton', 'IconButton', 'CopyButton',
      'ToastProvider', 'Modal', 'Drawer', 'Tooltip', 'Popover', 'AlertBanner', 'SkeletonText', 'SkeletonAvatar', 'SkeletonImage', 'SkeletonButton', 'SkeletonCard', 'SkeletonTableRows', 'EmptyState', 'ErrorState', 'NotFound',
      'Panel', 'ChoiceCard', 'BentoGrid', 'BentoItem', 'Avatar', 'Badge', 'Tag', 'Chip', 'ProgressBar', 'Stat', 'CountUp', 'DataTable',
    ];
    expect(components.filter((name) => !exported(name))).toEqual([]);
  });

  it('styles with tokens only, so every component follows the dark and light themes', () => {
    expect(plain.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi) ?? []).toEqual([]);
    const tokens = read('design-system/tokens.css');
    const used = new Set([...plain.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]).filter((name) => !name.startsWith('--tone')));
    expect([...used].filter((name) => !tokens.includes(`${name}:`))).toEqual([]);
  });

  it('defines hover, pressed, keyboard-focus, disabled and loading states for interactive components', () => {
    for (const control of ['.ds-button', '.ds-sidebar-item', '.ds-tab', '.ds-input', '.ds-select-trigger', '.ds-switch', '.ds-field-action', '.ds-choice', '.ds-drop', '.ds-check']) {
      expect([control, new RegExp(`${control.replace('.', '\\.')}[^{]*:hover`).test(plain)]).toEqual([control, true]);
    }
    for (const pressed of ['.ds-button:active', '.ds-sidebar-item:active', '.ds-tab:active', '.ds-switch:active', '.ds-choice:active', '.ds-drop:active', '.ds-check:active', '.ds-field-action:active', '.ds-icon-button:active']) expect(plain).toContain(pressed);
    expect(plain).toMatch(/:where\(\.ds-button, \.ds-tab, \.ds-sidebar-item, \.ds-select-trigger, \.ds-switch, \.ds-field-action, \.ds-choice, \.ds-page-button[^)]*\):focus-visible \{\s*outline: 2px solid var\(--border-focus\)/);
    expect(plain).toMatch(/:where\(\.ds-button, \.ds-tab, \.ds-sidebar-item, \.ds-select-trigger, \.ds-switch, \.ds-choice, \.ds-page-button\):disabled/);
    expect(plain).toContain('[aria-busy="true"] { cursor: progress; }');
    // Loading props exist on the components that do work.
    for (const loading of ['loading = false, icon', 'aria-busy={loading || undefined} disabled={disabled || loading} className="ds-switch"', "aria-busy={loading || undefined} disabled={disabled || loading}\n      onClick={() => (open ? setOpen(false) : show())}", 'progress?: number', 'loading?: boolean }) {\n  if (loading) return <div className="ds-panel ds-choice"']) expect(library).toContain(loading);
  });

  it('uses the accessible pattern for each widget', () => {
    for (const pattern of ['role="tablist"', 'role="tab"', 'aria-selected={tab.id === selected}', 'role="combobox"', 'role="listbox"', 'aria-activedescendant', 'role="switch"', 'aria-checked={checked}', 'aria-sort=', 'role="tooltip"', 'aria-describedby', 'role="progressbar"', 'aria-label="Breadcrumb"', 'aria-current={last ? \'page\' : undefined}', 'aria-modal="true"', "aria-label={visible ? 'Hide password' : 'Show password'}", 'type="checkbox"', 'type="radio"', 'type="file"']) {
      expect([pattern, library.includes(pattern)]).toEqual([pattern, true]);
    }
  });

  it('meets the brief’s specifics', () => {
    expect(plain).toContain('.ds-search:focus-within, .ds-search[data-filled] { width: 360px; }'); // search expands
    expect(plain).toContain('field-sizing: content'); // textarea grows (JS fallback in TextArea)
    expect(plain).toContain('.ds-check > input:checked + .ds-check-box .ds-check-mark path { stroke-dashoffset: 0; }'); // tick draws
    expect(plain).toContain('.ds-switch[aria-checked="true"] .ds-switch-thumb { translate: 16px 0;'); // sliding pill
    expect(plain).toContain('clip-path: inset(0 100% 100% 0);'); // secondary border draws on hover
    expect(plain).toMatch(/\.ds-button-danger:is\(:hover, :focus-visible\):not\(:disabled\) \{ background: var\(--color-error\);/); // subtle, then bold
    expect(read('design-system/icons.css')).toContain('border-radius: var(--radius-full);'); // icon buttons are circles
    expect(plain).toContain('@keyframes ds-ripple');
    expect(plain).toContain('backdrop-filter: blur(6px)'); // modal and drawer backdrops
    expect(plain).toContain('@keyframes ds-drawer-right');
    expect(library).toContain('show(400)'); // tooltip hover delay
    expect(plain).toContain('.ds-tooltip::after'); // tooltip arrow
    expect(library).toContain("layoutId={`${base}-indicator`}"); // tabs underline slides
    expect(library).toContain('delay: reduced ? 0 : 0.06 + index * motionTokens.stagger.item'); // mobile menu stagger
    expect(read('components/motion/feedback.tsx')).toContain("const TOAST_ICONS = { success: CircleCheck, error: CircleAlert, warning: TriangleAlert, info: Info };");
    expect(plain).toContain('@media (prefers-reduced-motion: reduce)');
    // .ds-page is the page-transition wrapper (motion/feedback.tsx); library styles must never target it.
    expect(plain).not.toMatch(/\.ds-page(?![-\w])/);
  });

  it('is used by the product where it replaces something', () => {
    const auth = read('components/AuthScreen.tsx');
    expect(auth).toContain('<PasswordField ');
    expect(auth).toContain('<TextField label="Email address"');
    const app = read('App.tsx');
    expect(app).toContain('<Breadcrumbs items=');
    expect(app).toContain('if (missingPath) return <NotFound');
    expect(read('components/Dashboard.tsx')).toContain('<ErrorState title="Your workspace did not load"');
    expect(read('components/ui.tsx')).toContain('<LibraryEmptyState icon={Inbox}');
    const main = read('main.tsx');
    expect(main.indexOf("components.css")).toBeLessThan(main.indexOf("motion.css"));
  });
});
