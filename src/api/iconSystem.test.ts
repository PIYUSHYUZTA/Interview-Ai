import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Guards the icon system: one library (Lucide) through one module, one stroke, three sizes, labelled
// icon-only controls, and no hand-drawn SVG icons.
const SOURCE = 'frontend/src';
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  return statSync(full).isDirectory() ? files(full) : /\.(tsx?|css)$/.test(name) ? [full] : [];
});
const all = files(SOURCE).map((file) => ({ file: file.replaceAll('\\', '/'), text: readFileSync(file, 'utf8') }));
const tsx = all.filter((f) => /\.tsx?$/.test(f.file));

// Inline SVG that is a graphic, not an icon.
const GRAPHICS: Record<string, string> = {
  'BlenderAssetScene.tsx': '3D scene fallback illustration',
  'IntelligenceScene.tsx': 'sculpture fallback illustration',
  'LandingPage.tsx': 'brand logo mark',
  'LandingProductPreviews.tsx': 'camera illustration in a product preview',
  'ProgressHistory.tsx': 'progress chart',
  'ui.tsx': 'score ring',
  'VisionOverlay.tsx': 'landmark overlay on the camera preview',
};

describe('icon system', () => {
  it('uses Lucide only, imported through the single icon module', () => {
    const otherLibraries = tsx.filter((f) => /from ['"](@phosphor-icons|@heroicons|react-icons|@radix-ui\/react-icons|@tabler\/icons|react-feather)/.test(f.text));
    expect(otherLibraries.map((f) => f.file)).toEqual([]);
    const directLucide = tsx.filter((f) => /from ['"]lucide-react['"]/.test(f.text) && !f.file.endsWith('components/icon/icons.ts'));
    expect(directLucide.map((f) => f.file)).toEqual([]);
    const pkg = JSON.parse(readFileSync('frontend/package.json', 'utf8'));
    expect(Object.keys(pkg.dependencies).filter((d) => /icon|lucide|phosphor|heroicons|feather/.test(d))).toEqual(['lucide-react']);
  });

  it('has no hand-drawn SVG icons; remaining inline SVGs are documented graphics', () => {
    const withSvg = tsx.filter((f) => /<svg\b/.test(f.text)).map((f) => path.basename(f.file));
    expect(withSvg.sort()).toEqual(Object.keys(GRAPHICS).sort());
  });

  it('sizes icons by role only (16 / 20 / 24) and draws every icon with one 1.5px stroke', () => {
    // Sizes are named (TypeScript rejects anything else); this also catches pixel literals such as size={19}.
    const numericSizes = tsx.filter((f) => /<(?:Icon|IconButton|Spinner|SearchIcon|CheckDrawIcon|BellRingIcon|MenuToggleIcon)\b[^>]*\bsize=\{\s*\d/.test(f.text)).map((f) => f.file);
    expect(numericSizes).toEqual([]);
    const sizes = [...tsx.map((f) => f.text).join('\n').matchAll(/<(?:Icon|IconButton|Spinner|SearchIcon|CheckDrawIcon|BellRingIcon|MenuToggleIcon)\b[^>]*\bsize="([^"]+)"/g)].map((m) => m[1]);
    expect(sizes.every((s) => ['inline', 'standalone', 'feature'].includes(s))).toBe(true);
    const component = readFileSync(`${SOURCE}/components/icon/Icon.tsx`, 'utf8');
    expect(component).toContain("const PIXELS: Record<IconSize, number> = { inline: 16, standalone: 20, feature: 24 };");
    expect(component).toContain('export const ICON_STROKE = 1.5;');
    expect(component).toContain('absoluteStrokeWidth');
    const strokeElsewhere = tsx.filter((f) => /strokeWidth=/.test(f.text) && !f.file.endsWith('components/icon/Icon.tsx') && !(path.basename(f.file) in GRAPHICS));
    expect(strokeElsewhere.map((f) => f.file)).toEqual([]);
    const tokens = readFileSync(`${SOURCE}/design-system/tokens.css`, 'utf8');
    for (const [token, value] of [['--icon-size-inline', '16px'], ['--icon-size-standalone', '20px'], ['--icon-size-feature', '24px'], ['--icon-stroke', '1.5px']]) {
      expect(tokens).toContain(`${token}: ${value};`);
    }
  });

  it('every icon-only control carries a label and a visible tooltip', () => {
    const component = readFileSync(`${SOURCE}/components/icon/Icon.tsx`, 'utf8');
    expect(component).toMatch(/label: string;/); // IconButton cannot be used without a label
    expect(component).toContain('aria-label={label} data-tooltip={label}');
    const landing = readFileSync(`${SOURCE}/components/LandingPage.tsx`, 'utf8');
    expect(landing).toMatch(/className="c-menu-toggle ds-has-tooltip" data-tooltip=\{menuOpen \? 'Close menu' : 'Open menu'\}[^>]*aria-label=\{menuOpen \? 'Close menu' : 'Open menu'\}/);
  });

  it('defines the hover state and the five animations, all respecting reduced motion', () => {
    const css = readFileSync(`${SOURCE}/design-system/icons.css`, 'utf8');
    expect(css).toMatch(/:hover, :focus-visible\)[^{]*\.ds-icon \{\s*scale: 1\.1;\s*color:/);
    for (const animation of ['ds-menu-toggle.is-open .ds-menu-toggle-menu { opacity: 0; rotate: 45deg; }', 'ds-icon-pulse', 'ds-draw', '@keyframes ds-bell-ring { 0%, 100% { rotate: 0deg; } 15% { rotate: 15deg; } 35% { rotate: -15deg; } 55% { rotate: 15deg; } 75% { rotate: -15deg; } }', '.ds-spinner { animation: ds-spin 900ms ease-in-out infinite; }']) {
      expect(css).toContain(animation);
    }
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '').match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? []).toEqual([]);
  });
});
