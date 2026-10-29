import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';

// Guards the cinematic landing: the opening title, the scroll-driven instrument scene and the closing film
// stay optional, lazy, accessible and backed by real Blender output.
const read = (file: string) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const components = 'frontend/src/components';

describe('cinematic landing', () => {
  it('plays the opening title once per session, never under reduced motion, without blocking the page', () => {
    const opening = read(`${components}/LandingOpening.tsx`);
    expect(opening).toContain("if (reduced || seen()) return 'done';");
    expect(opening).toContain("window.sessionStorage.setItem(SEEN_KEY, '1')");
    expect(opening).toContain('<div className="c-opening" data-phase={phase} aria-hidden="true">');
    for (const event of ["'keydown'", "'pointerdown'", "'wheel'", "'touchmove'"]) expect(opening).toContain(`window.addEventListener(${event}, skip`);
    expect(read(`${components}/LandingPage.css`)).toMatch(/\.c-opening \{[^}]*pointer-events: none;/);
    expect(read(`${components}/LandingFilm.tsx`)).toContain('delay: openingDelay(reduced)');
  });

  it('drives the instrument scene from scroll, loads it lazily and falls back to Cycles stills', () => {
    const movements = read(`${components}/LandingMovements.tsx`);
    expect(movements).toContain("rootMargin: '900px 0px'"); // WebGL starts only as the section approaches
    expect(movements).toContain("fetch('/models/landing-instrument.glb'");
    expect(movements).toContain('if (!frame && visible && !document.hidden && renderer)'); // renders only while on screen
    expect(movements).toContain('renderer?.dispose(); renderer?.forceContextLoss();');
    expect(movements).toContain('Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.75)');
    expect(movements).toMatch(/!element \|\| !stage \|\| reduced \|\| stillOnly/); // reduced motion and low power: stills only
    for (const chapter of ['listen', 'adapt', 'develop']) expect(existsSync(`frontend/public/media/instrument-${chapter}.webp`)).toBe(true);
    expect(movements).toContain('aria-current={index === chapter ? \'step\' : undefined}');
    // Chapters swap in place with opacity and transform only, so scrolling never shifts the layout.
    expect(read(`${components}/LandingPage.css`)).toMatch(/\.c-movements-list li \{ grid-area: 1 \/ 1; opacity: 0; translate: 0 24px;/);
  });

  it('keeps the closing film decorative, lazy and paused off screen', () => {
    const close = read(`${components}/LandingCloseFilm.tsx`);
    expect(close).toContain('<div className="c-close-film" ref={box} aria-hidden="true">');
    expect(close).toContain("rootMargin: '700px 0px'");
    expect(close).toContain('const play = near && motion && !reduced;');
    expect(read(`${components}/LandingPage.tsx`)).toContain('<Button className="c-primary" onClick={onStart}>Start Practicing');
  });

  it('ships Blender output that matches its manifest and stays small', () => {
    const manifest = JSON.parse(read('frontend/public/media/instrument-manifest.json'));
    expect(manifest.generator).toBe('scripts/blender/build_landing_artifact.py');
    expect(statSync('frontend/public/models/landing-instrument.glb').size).toBe(manifest.model.bytes);
    expect(manifest.model.bytes).toBeLessThan(600_000);
    expect(manifest.model.objects).toEqual(expect.arrayContaining(['Monolith', 'RingOuter', 'RingInner', 'Orbit', 'Signal', 'ListeningLine']));
    expect(statSync('frontend/public/media/instrument-loop.mp4').size).toBe(manifest.loop.bytes);
    expect(manifest.loop.bytes).toBeLessThan(3_000_000);
  });
});
