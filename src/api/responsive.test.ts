import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Guards the responsive system: one breakpoint scale (375 / 640 / 768 / 1024 / 1280 / 1536), 44px touch
// targets on the shared controls, fluid type and spacing tokens, and navigation collapsing below 768px.
const SOURCE = 'frontend/src';
const read = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => { const full = path.join(dir, name); return statSync(full).isDirectory() ? files(full) : [full.replaceAll('\\', '/')]; });
const css = files(SOURCE).filter((f) => f.endsWith('.css'));
const tokens = read(`${SOURCE}/design-system/tokens.css`);
const BREAKPOINTS = [640, 768, 1024, 1280, 1536];

describe('responsive', () => {
  it('uses only the breakpoint scale: min-width at a breakpoint, max-width one pixel below it', () => {
    for (const bp of BREAKPOINTS) expect(tokens).toMatch(new RegExp(`--breakpoint-[a-z0-9]+: ${bp}px;`));
    const off: string[] = [];
    for (const file of css) {
      for (const query of read(file).match(/@media[^{]*/g) ?? []) {
        for (const [, kind, value] of query.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)) {
          const ok = kind === 'min' ? BREAKPOINTS.includes(+value) : BREAKPOINTS.includes(+value + 1);
          if (!ok) off.push(`${file}: ${query.trim()}`);
        }
      }
    }
    expect(off).toEqual([]);
    // JavaScript never hard-codes a width either.
    const scripts = files(SOURCE).filter((f) => /\.tsx?$/.test(f)).filter((f) => /(max|min)-width:\s*\d+px|innerWidth\s*[<>]/.test(read(f)));
    expect(scripts).toEqual([]);
  });

  it('gives every shared control a 44×44 touch target', () => {
    expect(tokens).toContain('--touch-target: 44px;');
    const icons = read(`${SOURCE}/design-system/icons.css`);
    expect(icons).toMatch(/\.ds-icon-button \{[^}]*flex-shrink: 0;[^}]*width: var\(--touch-target\);\s*height: var\(--touch-target\);/);
    const components = read(`${SOURCE}/design-system/components.css`);
    for (const rule of ['.ds-button {', '.ds-button-sm {', '.ds-field-action {', '.ds-sidebar-item {', '.ds-tab {', '.ds-breadcrumbs button {', '.ds-navbar-links a {', '.ds-check {', '.ds-chip > :first-child {', '.ds-table th button {', '.ds-page-button {', '.ds-switch {']) {
      const start = components.indexOf(rule); expect([rule, start >= 0]).toEqual([rule, true]);
      const body = components.slice(start, components.indexOf('}', start));
      expect([rule, /(min-)?height: var\(--touch-target\)/.test(body)]).toEqual([rule, true]);
    }
    expect(read(`${SOURCE}/design-system/sound.css`)).toContain('min-height: var(--touch-target);');
    const landing = read(`${SOURCE}/components/LandingPage.css`);
    expect(landing).toMatch(/\.c-nav nav a, \.c-hero-index a, \.c-footer-groups a, \.c-footer-groups button \{ min-height: var\(--touch-target\); min-width: var\(--touch-target\);/);
    expect(landing).toContain('.c-menu-toggle { display: none; position: relative; width: var(--touch-target); height: var(--touch-target);');
    // No control is styled to a smaller fixed size.
    expect(landing.match(/min-height: ?(32|38|42)px/g) ?? []).toEqual([]);
  });

  it('collapses navigation to the menu button below 768px', () => {
    expect(read(`${SOURCE}/components/LandingPage.css`)).toMatch(/@media\(max-width: 767px\) \{ \.c-menu-toggle \{ display: grid; \}/);
    expect(read(`${SOURCE}/design-system/components.css`)).toMatch(/@media \(max-width: 767px\) \{\n  \.ds-navbar-links, \.ds-navbar-cta, \.ds-navbar \.ds-sound-toggle \{ display: none; \}/);
  });

  it('scales type with clamp() and spacing with responsive tokens', () => {
    for (const token of ['--font-size-fluid-display: clamp(', '--font-size-fluid-h1: clamp(', '--font-size-fluid-h2: clamp(', '--font-size-fluid-h3: clamp(', '--space-section: clamp(', '--space-block: clamp(', '--space-gap: clamp(', '--space-gutter: clamp(']) expect(tokens).toContain(token);
    const base = read(`${SOURCE}/design-system/base.css`);
    for (const heading of ['.ds-display', '.ds-h1', '.ds-h2', '.ds-h3']) expect(base).toMatch(new RegExp(`\\${heading} \\{ font: [^;]*var\\(--font-size-fluid-`));
    const product = read(`${SOURCE}/candidate-product.css`);
    expect(product).toContain('.app-shell .main-shell main { padding: var(--space-block) var(--space-gutter); }');
    expect(product).toContain('.app-shell .page-heading h1 { font-size: var(--font-size-fluid-h1); }');
  });

  it('steps three-column grids through two columns before one', () => {
    const product = read(`${SOURCE}/candidate-product.css`);
    expect(product).toMatch(/@media \(min-width: 640px\) and \(max-width: 1023px\) \{\n  \.app-shell :is\(\.metrics-grid, \.report-metadata\) \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
    expect(product).toContain('> :last-child:nth-child(odd) { grid-column: 1 / -1; }');
    const landing = read(`${SOURCE}/components/LandingPage.css`);
    expect(landing).toContain('.c-capability-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }');
    expect(landing).toMatch(/@media\(max-width: 1279px\) \{ \.c-capability-grid \{ grid-template-columns: 1fr 1fr; \}/);
  });

  it('keeps sign-out reachable on phones', () => {
    expect(read(`${SOURCE}/candidate-product.css`)).toContain('.app-shell .topbar .account-signout { display: inline-flex; }');
  });
});
