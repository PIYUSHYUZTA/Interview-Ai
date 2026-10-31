import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Guards the landing (docs/reference-redesign-spec.md, page 01): one lazy WebGL layer behind accessible DOM
// chapters, quality tiers with a no-WebGL fallback, reduced motion honoured, the film playing only on screen,
// and calls to action wired into the real account flow.
const read = (file: string) => readFileSync(`frontend/src/${file}`, 'utf8').replace(/\r\n/g, '\n');
const landing = read('experience/Landing.tsx');

describe('landing', () => {
  it('is the public landing screen, loaded lazily with its own styles', () => {
    expect(read('App.tsx')).toMatch(/const LandingPage = lazy\(\(\) => import\('\.\/components\/LandingPage'\)/);
    const page = read('components/LandingPage.tsx');
    expect(page).toContain("import '../experience/landing.css';");
    expect(page).toContain('<Landing onStart={onStart} onWorkspace={onWorkspace} signedIn={signedIn} />');
  });

  it('keeps all meaning in accessible DOM chapters over one decorative, lazy canvas', () => {
    expect(landing).toContain("const ExperienceCanvas = lazy(() => import('./ExperienceCanvas'));");
    expect(landing).toContain('{live ? <Suspense fallback={null}><ExperienceCanvas tier={tier} still={reduced} /></Suspense> : <div className="lx-fallback" aria-hidden="true" />}');
    expect(read('experience/ExperienceCanvas.tsx')).toContain('className="xp-canvas" aria-hidden="true"');
    expect(landing.match(/<Chapter id="/g)?.length).toBe(8);
    expect(landing).toContain('<Lines as="h1" id="lx-hero-title"');
    expect(landing.match(/as="h1"/g)?.length).toBe(1);
    expect(landing).toContain('<a className="lx-skip" href="#lx-main">Skip to content</a>');
  });

  it('honours reduced motion: no smooth scroll, no choreography, a still camera and on-demand rendering', () => {
    expect(landing).toContain('useExperienceScroll({ smooth: !reduced, onChapter });');
    expect(landing).toMatch(/\/\/ Choreography:[^\n]*\n  useEffect\(\(\) => \{\n    if \(reduced\) return;/);
    const canvas = read('experience/ExperienceCanvas.tsx');
    expect(canvas).toContain("frameloop={still ? 'demand' : 'always'}");
    expect(canvas).toContain('const key = still ? index * 2 + .5');
    expect(read('experience/landing.css')).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.lx-nav \{ animation: none; \}/);
  });

  it('falls back without WebGL and caps resolution per tier', () => {
    expect(read('experience/quality.ts')).toMatch(/!hasWebGL\(\)\) return 'still';/);
    const tiers = read('experience/quality.ts');
    expect(tiers).toContain('high: { dpr: [1, 1.75]');
    expect(tiers).toContain('medium: { dpr: [1, 1.25]');
    expect(read('experience/ExperienceCanvas.tsx')).toContain('<PerformanceMonitor onDecline={() => { setEffects(false); setDpr(1); }}');
  });

  it('plays the interviewer film only on screen and never under reduced motion', () => {
    expect(landing).toContain('<video ref={film} src="/media/hero-film.mp4" poster="/media/hero-film-poster.webp" width={1280} height={720} muted loop playsInline preload="none" aria-hidden="true" />');
    expect(landing).toMatch(/const video = film\.current; if \(!video \|\| reduced\) return;/);
  });

  it('wires every call to action into the real account flow', () => {
    expect(landing.match(/onClick=\{onStart\}/g)?.length).toBeGreaterThanOrEqual(3);
    expect(landing).toContain("{signedIn ? 'Workspace' : 'Sign in'}");
    expect(landing).toContain('Illustrative example');
    expect(landing).toContain('Example figures');
  });
});
