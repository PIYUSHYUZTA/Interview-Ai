import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Guards dark mode: every colour is a custom property, the paint roles mirror between themes, dark keeps
// the original product colours, light text is legible, and the theme is set before first paint.
const SOURCE = 'frontend/src';
const read = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? files(full) : [full.replaceAll('\\', '/')];
});
const all = files(SOURCE);
const tokens = read(`${SOURCE}/design-system/tokens.css`);
const block = (selector: string) => { const start = tokens.indexOf(selector); const open = tokens.indexOf('{', start); return tokens.slice(open + 1, tokens.indexOf('\n}', open)); };
const decls = (css: string) => Object.fromEntries([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const palette = decls(block(':root {'));
const dark = decls(block(':root,\n[data-theme="dark"] {'));
const light = decls(block('[data-theme="light"] {'));
const hex = (theme: Record<string, string>, name: string) => { const value = theme[name]; const ref = value.match(/^var\((--palette-[\w-]+)\)$/); return (ref ? palette[ref[1]] : value).toLowerCase(); };
const luminance = (h: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

describe('dark mode', () => {
  it('uses custom properties for every colour in component CSS (raw values only in the token palette)', () => {
    const css = all.filter((f) => f.endsWith('.css') && !f.endsWith('design-system/tokens.css'));
    const raw = css.flatMap((file) => read(file).replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(-webkit-)?mask(-image)?\s*:[^;}]*/g, '') // masks are alpha-only, not colour
      .match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|(?<![-\w])(white|black)(?![-\w])/gi)?.map((m) => `${file}: ${m}`) ?? []);
    expect(raw).toEqual([]);
  });

  it('uses custom properties for every colour in components, except documented non-UI values', () => {
    // Allowed: the browser-chrome theme-color (must be a literal) and the 3D scene's light-source colours.
    const allowed = new Set([`${SOURCE}/design-system/theme.ts`, `${SOURCE}/components/BlenderAssetScene.tsx`, `${SOURCE}/design-system/sound.ts`]);
    const raw = all.filter((f) => /\.tsx?$/.test(f) && !allowed.has(f)).flatMap((file) => (read(file).match(/['"`]#[0-9a-f]{3,8}['"`]|=\s*"#[0-9a-f]{3,8}"|rgba?\(\d/gi) ?? []).map((m) => `${file}: ${m}`));
    expect(raw).toEqual([]);
    const scene = read(`${SOURCE}/components/BlenderAssetScene.tsx`);
    expect(scene.match(/"#[0-9a-f]{6}"/gi) ?? []).toEqual([]); // its SVG fallback uses tokens; only light colours (0x…) remain
  });

  it('defines every paint role in both themes, with dark values equal to the original product colours', () => {
    const paints = Object.keys(dark).filter((name) => name.startsWith('--paint-'));
    expect(paints.length).toBeGreaterThanOrEqual(18);
    expect(paints.filter((name) => !(name in light))).toEqual([]);
    const original: Record<string, string> = { '--paint-jet': '#0a0a0a', '--paint-charcoal': '#090907', '--paint-ink': '#031211', '--paint-abyss': '#081c23', '--paint-snow': '#ededed', '--paint-ivory': '#e8e4d3', '--paint-teal': '#00aebb', '--paint-cerulean': '#007ba7', '--paint-rose': '#ff2d95', '--paint-amber': '#b99d73', '--paint-earth': '#6c5636' };
    for (const [name, value] of Object.entries(original)) expect([name, hex(dark, name)]).toEqual([name, value]);
    expect(dark['color-scheme' as keyof typeof dark] ?? block(':root,\n[data-theme="dark"] {')).toContain('color-scheme: dark');
    expect(block('[data-theme="light"] {')).toContain('color-scheme: light');
  });

  it('keeps light-theme text legible: text paints reach 4.5:1 on every light surface paint', () => {
    for (const text of ['--paint-snow', '--paint-ivory', '--paint-teal-text', '--paint-cerulean-text', '--paint-rose-text', '--paint-amber-text', '--paint-earth-text']) {
      for (const surface of ['--paint-jet', '--paint-charcoal', '--paint-ink']) {
        expect([text, surface, contrast(hex(light, text), hex(light, surface)) >= 4.5]).toEqual([text, surface, true]);
      }
    }
    expect(contrast(hex(light, '--paint-on-accent'), hex(light, '--paint-teal'))).toBeGreaterThanOrEqual(4.5); // ink on teal buttons
  });

  it('sets the theme before first paint, from the saved choice or the system preference', () => {
    for (const page of ['index.html', 'components.html', 'design-system.html']) {
      const html = read(`frontend/${page}`);
      const script = html.indexOf("localStorage.getItem('interview-ai.theme')");
      expect([page, script > 0 && script < html.indexOf('<script type="module"')]).toEqual([page, true]); // inline, before the app
      expect(html).toContain("matchMedia('(prefers-color-scheme: light)')");
      expect(html).toContain('document.documentElement.dataset.theme = theme;');
      expect(html).toContain('<meta name="color-scheme" content="dark light" />');
    }
    const theme = read(`${SOURCE}/design-system/theme.ts`);
    expect(theme).toContain("addEventListener('change', () => { if (!saved()) apply(system(), true); })"); // follows the system until chosen
    expect(theme).toContain('window.localStorage.setItem(THEME_KEY, next);');
  });

  it('switches with a 300ms ease on every surface and a morphing moon/sun icon', () => {
    expect(tokens).toContain('--duration-theme: 300ms;');
    const motion = read(`${SOURCE}/design-system/motion.css`);
    expect(motion).toMatch(/:root\[data-theme-switching\] \*[^{]*\{\s*transition: background-color var\(--duration-theme\) ease, color var\(--duration-theme\) ease, border-color var\(--duration-theme\) ease/);
    expect(motion).toContain('[data-theme-icon="dark"] .ds-theme-sun, [data-theme-icon="light"] .ds-theme-moon { opacity: 0; rotate: -90deg; scale: 0.4; }');
    const nav = read(`${SOURCE}/components/library/navigation.tsx`);
    expect(nav).toContain('<Icon icon={Moon} size="standalone" className="ds-theme-moon" /><Icon icon={Sun} size="standalone" className="ds-theme-sun" />');
    expect(read(`${SOURCE}/App.tsx`).match(/<ThemeToggle/g)?.length).toBe(2); // workspace topbar and sign-in corner
    expect(read(`${SOURCE}/components/LandingPage.tsx`)).toContain('<ThemeToggle />');
  });
});
