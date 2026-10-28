import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Final quality bar: every spacing and size value sits on the 4pt grid, and icons are only ever Lucide
// (no typographic glyphs standing in for them). Colour tokens, states, motion, responsiveness, sound and
// accessibility have their own contract tests.
const SOURCE = 'frontend/src';
const read = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => { const full = path.join(dir, name); return statSync(full).isDirectory() ? files(full) : [full.replaceAll('\\', '/')]; });
const all = files(SOURCE);
const SPACING = /^(margin|padding|gap|row-gap|column-gap|top|right|bottom|left|inset|width|height|min-width|min-height|max-width|max-height|border-radius|translate|grid-template-columns|grid-template-rows|flex-basis)(-[a-z-]+)?$/;

describe('quality bar', () => {
  it('puts every spacing and size value on the 4pt grid (1–2px hairlines and rings excepted)', () => {
    const off: string[] = [];
    for (const file of all.filter((f) => f.endsWith('.css'))) {
      const text = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, body] of text.matchAll(/\{([^{}]*)\}/g)) {
        for (const [, prop, value] of body.matchAll(/([-a-z]+)\s*:\s*([^;]+)/g)) {
          if (!SPACING.test(prop)) continue;
          for (const [, num] of value.matchAll(/(?<![\w.#-])-?(\d+(?:\.\d+)?)px\b/g)) if (+num > 2 && +num % 4 !== 0) off.push(`${path.basename(file)} ${prop}: ${value.trim().slice(0, 50)}`);
        }
      }
    }
    expect(off).toEqual([]);
    const tsxOff = all.filter((f) => f.endsWith('.tsx')).flatMap((file) => [...read(file).matchAll(/(?:width|height|radius)="(\d+)px"/g)].filter((m) => +m[1] > 2 && +m[1] % 4 !== 0).map((m) => `${path.basename(file)}: ${m[0]}`));
    expect(tsxOff).toEqual([]);
  });

  it('draws every icon with Lucide; no arrows, triangles or numerals standing in for icons', () => {
    const glyph = /[▷▶◀◁▲▼Ⅱ↘↗↙↖↓↑]|>\s*→\s*</;
    const offenders = all.filter((f) => f.endsWith('.tsx')).flatMap((file) => read(file).split('\n').map((line, i) => [line, i + 1] as const)
      .filter(([line]) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && glyph.test(line.replace(/'[^']*→[^']*'/g, '')))
      .map(([line, n]) => `${path.basename(file)}:${n} ${line.trim().slice(0, 70)}`));
    expect(offenders).toEqual([]);
    const cssGlyphs = all.filter((f) => f.endsWith('.css')).flatMap((file) => [...read(file).matchAll(/content\s*:\s*(['"])([^'"]+)\1/g)].filter((m) => /[^\x20-\x7E]|^[+\-x]$/.test(m[2])).map((m) => `${path.basename(file)}: content ${m[0]}`));
    expect(cssGlyphs).toEqual([]);
  });

  it('uses one primary action style across the product', () => {
    expect(read(`${SOURCE}/candidate-product.css`)).toContain('.btn.btn-primary { background: var(--paint-teal); border-color: var(--paint-teal-text); color: var(--paint-on-accent); }');
  });

  it('keeps no retired vendor components in the source tree', () => {
    expect(all.some((f) => f.endsWith('magic-blur-fade.tsx') || f.endsWith('smooth-ai-loader.tsx'))).toBe(false);
  });
});
