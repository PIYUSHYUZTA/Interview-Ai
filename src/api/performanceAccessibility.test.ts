import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Guards performance and accessibility: motion on the compositor (transform/opacity), media that never
// shifts layout, off-screen rendering deferred, one visible focus ring, landmarks, and focus handed over
// correctly between screens and dialogs.
const SOURCE = 'frontend/src';
const read = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => { const full = path.join(dir, name); return statSync(full).isDirectory() ? files(full) : [full.replaceAll('\\', '/')]; });
const css = files(SOURCE).filter((f) => f.endsWith('.css'));
const tsx = files(SOURCE).filter((f) => f.endsWith('.tsx'));
const LAYOUT = /^(width|height|top|left|right|bottom|margin(-[a-z]+)?|padding(-[a-z]+)?|max-height|min-height|block-size|inline-size|font-size|gap|inset)$/;

describe('performance', () => {
  it('animates transform and opacity, not layout (two documented exceptions)', () => {
    const found: string[] = [];
    for (const file of css) {
      const text = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, rule, value] of text.matchAll(/([^{}]*)\{[^{}]*?transition\s*:\s*([^;}]*)/g)) {
        for (const part of value.split(',')) {
          const property = part.trim().split(/\s+/)[0];
          if (property === 'all' || LAYOUT.test(property)) found.push(`${path.basename(file)} ${rule.trim().split('\n').pop()} → ${property}`);
        }
      }
      for (const [, name, body] of text.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\}\s*\}/g)) {
        for (const [, property] of body.matchAll(/([a-z-]+)\s*:/g)) if (LAYOUT.test(property)) found.push(`${path.basename(file)} @keyframes ${name} → ${property}`);
      }
    }
    // The search field widening on focus and a disclosure opening both must move the content around them.
    expect(found.sort()).toEqual([
      'components.css .ds-search → width',
      'motion.css details::details-content → block-size',
    ].sort());
  });

  it('gives elements that animate repeatedly their own compositor layer (will-change)', () => {
    const motion = read(`${SOURCE}/design-system/motion.css`);
    expect(motion).toContain('.ds-ripple, .ds-toast, .ds-toast-progress, dialog.ds-modal, .ds-skeleton, .ds-spinner, .ds-icon-pulse, .ds-bell-ring { will-change: transform, opacity; }');
    expect(motion).toContain('.ds-spotlight-glow {');
    expect(motion).toMatch(/\.ds-spotlight-glow \{[^}]*will-change: translate;/);
    const components = read(`${SOURCE}/design-system/components.css`);
    for (const rule of ['.ds-tab-indicator { will-change: transform;', '.ds-progress-fill { will-change: transform;', '.ds-drawer-panel { will-change: translate;']) expect(components).toContain(rule);
    const landing = read(`${SOURCE}/components/LandingPage.css`);
    expect(landing).toMatch(/\.cinema > \.c-nav::before \{[^}]*will-change: translate;/);
    expect(landing).toContain('.c-hero-backdrop { will-change: transform;');
    // The spotlight follows the pointer by moving a pre-rendered layer, never by repainting a gradient.
    const page = read(`${SOURCE}/components/LandingPage.tsx`);
    expect(page).toContain('glow.style.translate = `${event.clientX - bounds.left}px ${event.clientY - bounds.top}px`;');
    expect(page).not.toContain("'--spotlight-x'");
  });

  it('gives every image and video intrinsic dimensions; images below the fold load lazily', () => {
    for (const file of tsx) {
      for (const [tag] of read(file).matchAll(/<(img|video)\b[^>]*>/g)) {
        expect([path.basename(file), /\bwidth=\{/.test(tag) && /\bheight=\{/.test(tag)]).toEqual([path.basename(file), true]);
        if (tag.startsWith('<img') && !tag.includes('hero-bust-poster.webp" alt="" width={900}')) expect([path.basename(file), tag.includes('loading="lazy"')]).toEqual([path.basename(file), true]);
      }
    }
    expect(read(`${SOURCE}/components/LandingFilm.tsx`)).toContain('preload="none"'); // the film loads only when played
  });

  it('loads off-screen work only when it is needed', () => {
    // Screens are separate chunks, loaded on first visit.
    const app = read(`${SOURCE}/App.tsx`);
    for (const screen of ['LandingPage', 'AuthScreen', 'Dashboard', 'ResumeUploadView', 'InterviewRoom', 'ResultsScreen']) expect(app).toMatch(new RegExp(`const ${screen} = lazy\\(\\(\\) => import\\(`));
    // GSAP is fetched only as the steps section approaches; the film video only when played on screen.
    expect(read(`${SOURCE}/components/landing-gsap.ts`)).toMatch(/import\(/);
    expect(read(`${SOURCE}/components/LandingPage.tsx`)).toContain('void loadGsap().then(');
    // Content-visibility is deliberately not used: its size estimates move content when they miss (layout shift).
    expect(css.some((file) => /content-visibility\s*:/.test(read(file)))).toBe(false);
  });

  it('switches every animation off for reduced motion', () => {
    expect(read(`${SOURCE}/design-system/icons.css`)).toContain('.ds-spinner { animation: none; }');
    expect(read(`${SOURCE}/index.css`)).toMatch(/prefers-reduced-motion:\s*reduce\)\{\*,\*:before,\*:after\{animation:none!important;transition:none!important/);
    expect(read(`${SOURCE}/design-system/components.css`)).toContain('.ds-empty-art i:nth-child(2), .ds-not-found-mark i, .ds-not-found-mark i:nth-child(2) { animation: none; }');
  });
});

describe('accessibility', () => {
  it('shows one focus ring everywhere: 2px brand outline, 2px offset, loaded last', () => {
    const layer = read(`${SOURCE}/design-system/a11y.css`);
    expect(layer).toMatch(/:focus-visible \{\s*outline: 2px solid var\(--border-focus\) !important;\s*outline-offset: 2px !important;\s*\}/);
    const tokens = read(`${SOURCE}/design-system/tokens.css`);
    expect(tokens).toContain('--border-focus: var(--palette-teal);');      // dark: 7:1 on the base
    expect(tokens).toContain('--border-focus: var(--palette-teal-deep);'); // light: 5.2:1 on the base
    const main = read(`${SOURCE}/main.tsx`).trim().split('\n').filter((l) => l.includes('.css'));
    expect(main.at(-1)).toContain('a11y.css');
    for (const page of ['showcase.tsx', 'reference.tsx']) expect(read(`${SOURCE}/design-system/${page}`)).toContain("import './a11y.css';");
    // No component replaces the ring with a glow any more.
    for (const file of css.filter((f) => !f.endsWith('a11y.css'))) expect([path.basename(file), /box-shadow: 0 0 0 3px var\(--color-[a-z]+-subtle\)/.test(read(file))]).toEqual([path.basename(file), false]);
  });

  it('marks the main region on every screen and moves focus to it after a screen change', () => {
    expect(read(`${SOURCE}/components/AuthScreen.tsx`)).toContain('<main className="page auth-page" id="auth-main" tabIndex={-1}>');
    expect(read(`${SOURCE}/components/InterviewRoom.tsx`)).toContain('return <main ref={root} id="room-main" tabIndex={-1}');
    const app = read(`${SOURCE}/App.tsx`);
    expect(app).toContain('function focusMain(frames = 120)');
    expect(app).toContain('if (frames > 0) requestAnimationFrame(() => focusMain(frames - 1));');
    expect(read(`${SOURCE}/components/library/NotFound.tsx`)).toContain("const Root = embedded ? 'section' : 'main';");
  });

  it('returns focus to whatever opened a dialog or drawer', () => {
    for (const file of ['components/ui.tsx', 'components/library/overlays.tsx']) {
      const text = read(`${SOURCE}/${file}`);
      expect(text).toContain('const opener = document.activeElement as HTMLElement | null;');
      expect(text).toContain('return () => { dialog.close(); if (opener?.isConnected) opener.focus(); };');
    }
  });

  it('requires a label on every icon-only button', () => {
    expect(read(`${SOURCE}/components/icon/Icon.tsx`)).toMatch(/label: string;/);
    const iconOnly = tsx.flatMap((file) => [...read(file).matchAll(/<button\b(?![^>]*aria-label)[^>]*>\s*<(?:Icon|MenuToggleIcon)\b[^>]*\/>\s*<\/button>/g)].map((m) => `${path.basename(file)}: ${m[0].slice(0, 80)}`));
    expect(iconOnly).toEqual([]);
  });
});
