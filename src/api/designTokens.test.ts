import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Guards the design system's contract: accessible contrast in both themes, a complete light mirror,
// raw colour values only in the palette block, and the specified scales.
const tokens = readFileSync('frontend/src/design-system/tokens.css', 'utf8');
const utilities = readFileSync('frontend/src/design-system/base.css', 'utf8');

const block = (selector: RegExp) => {
  const start = tokens.search(selector); expect(start).toBeGreaterThanOrEqual(0);
  const open = tokens.indexOf('{', start); let depth = 0, i = open;
  for (; i < tokens.length; i++) { if (tokens[i] === '{') depth++; if (tokens[i] === '}' && --depth === 0) break; }
  return tokens.slice(open + 1, i).replace(/\/\*[\s\S]*?\*\//g, '');
};
// First definition wins, so later overrides (such as reduced motion) cannot mask the base values.
const declarations = (css: string) => Object.fromEntries([...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].reverse().map((m) => [m[1], m[2].trim()]));
const paletteCss = block(/:root\s*\{\s*\/?\*?[^{]*--palette-ink:/);
const palette = declarations(paletteCss);
const dark = declarations(block(/:root,\s*\[data-theme="dark"\]/));
const light = declarations(block(/\[data-theme="light"\]\s*\{/));

const resolve = (theme: Record<string, string>, value: string, seen = 0): string => {
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  if (!ref) return value;
  expect(seen).toBeLessThan(10);
  return resolve(theme, theme[ref[1]] ?? palette[ref[1]], seen + 1);
};
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

describe('design tokens', () => {
  it.each([['dark', dark], ['light', light]] as const)('%s theme: every text and semantic colour meets WCAG AA (4.5:1) on every background', (_name, theme) => {
    const color = (token: string) => { const value = resolve(theme, theme[token]); expect(value, token).toMatch(/^#[0-9A-F]{6}$/i); return value; };
    const backgrounds = ['--bg-base', '--bg-surface', '--bg-elevated', '--bg-overlay'];
    const foregrounds = ['--text-primary', '--text-secondary', '--text-muted', '--color-primary-text', '--color-accent-text', '--color-success', '--color-warning', '--color-error', '--color-info'];
    const failures: string[] = [];
    for (const fg of foregrounds) for (const bg of backgrounds) { const ratio = contrast(color(fg), color(bg)); if (ratio < 4.5) failures.push(`${fg} on ${bg}: ${ratio.toFixed(2)}`); }
    const onPrimary = contrast(color('--color-primary-contrast'), color('--color-primary'));
    if (onPrimary < 4.5) failures.push(`--color-primary-contrast on --color-primary: ${onPrimary.toFixed(2)}`);
    expect(failures).toEqual([]);
    expect(contrast(color('--text-primary'), color('--bg-base'))).toBeGreaterThan(12);
  });

  it('light theme mirrors every colour and depth token of the dark theme', () => {
    expect(Object.keys(dark).filter((token) => token !== 'color-scheme' && !(token in light))).toEqual([]);
    expect(Object.keys(light).filter((token) => !(token in dark))).toEqual([]);
    for (const token of ['--bg-base', '--bg-surface', '--bg-elevated', '--bg-overlay', '--text-primary', '--text-secondary', '--text-muted', '--text-disabled',
      '--color-primary', '--color-accent', '--color-success', '--color-warning', '--color-error', '--color-info', '--shadow-xs', '--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-brand']) {
      expect(dark[token], token).toBeDefined(); expect(light[token], token).toBeDefined();
    }
  });

  it('raw colour values appear only in the palette block', () => {
    const outsidePalette = tokens.replace(/\/\*[\s\S]*?\*\//g, '').replace(paletteCss, '');
    expect(outsidePalette.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi) ?? []).toEqual([]);
    expect(utilities.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi) ?? []).toEqual([]);
  });

  it('defines the specified scales exactly', () => {
    const all = declarations(tokens.replace(/\/\*[\s\S]*?\*\//g, ''));
    expect(['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl'].map((s) => all[`--font-size-${s}`])).toEqual(['12px', '14px', '16px', '18px', '20px', '24px', '32px', '40px', '48px', '60px', '72px']);
    expect([1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24].map((n) => all[`--space-${n}`])).toEqual(['4px', '8px', '12px', '16px', '20px', '24px', '32px', '40px', '48px', '64px', '80px', '96px']);
    expect(['xs', 'sm', 'md', 'lg', 'xl', 'full'].map((r) => all[`--radius-${r}`])).toEqual(['4px', '6px', '8px', '12px', '16px', '9999px']);
    expect([all['--leading-tight'], all['--leading-normal'], all['--leading-relaxed']]).toEqual(['1.2', '1.5', '1.75']);
    expect([all['--tracking-tight'], all['--tracking-normal'], all['--tracking-wide']]).toEqual(['-0.04em', '0', '0.08em']);
    expect([all['--duration-fast'], all['--duration-normal'], all['--duration-slow']]).toEqual(['120ms', '200ms', '350ms']);
    expect(all['--container-max']).toBe('1280px');
    expect(light['--shadow-sm']).toBe('0 2px 8px color-mix(in srgb, var(--shadow-color) 8%, transparent)');
  });
});
