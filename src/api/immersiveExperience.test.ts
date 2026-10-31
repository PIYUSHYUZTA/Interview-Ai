import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Guards the immersive landing foundation (docs/immersive-experience-plan.md, Phase 1): one lazy WebGL
// layer, quality tiers with a no-WebGL still tier, accessible DOM chapters, and smooth scroll that
// yields to reduced motion.
const read = (file: string) => readFileSync(`frontend/src/experience/${file}`, 'utf8').replace(/\r\n/g, '\n');

describe('immersive experience foundation', () => {
  it('loads the 3D layer lazily and never creates it in the still tier', () => {
    const experience = read('Experience.tsx');
    expect(experience).toContain("const ExperienceCanvas = lazy(() => import('./ExperienceCanvas'));");
    expect(experience).toContain("{live && <Suspense fallback={null}><ExperienceCanvas tier={tier} /></Suspense>}");
    expect(read('quality.ts')).toMatch(/if \(reducedMotion \|\| device\.connection\?\.saveData .*!hasWebGL\(\)\) return 'still';/);
  });

  it('keeps all meaning in accessible DOM chapters over a decorative canvas', () => {
    const experience = read('Experience.tsx');
    expect(experience).toContain("const Heading = index === 0 ? 'h1' : 'h2';");
    expect(experience).toContain('aria-labelledby={`xp-${chapter.id}-title`}');
    expect(read('ExperienceCanvas.tsx')).toContain('className="xp-canvas" aria-hidden="true"');
    expect(read('chapters.ts').match(/id: '/g)?.length).toBe(7);
  });

  it('smooths scrolling only when motion is allowed, and caps resolution per tier', () => {
    expect(read('Experience.tsx')).toContain('useExperienceScroll({ smooth: !reduced, onChapter });');
    expect(read('scroll.ts')).toContain('lenis.on(\'scroll\', ScrollTrigger.update);');
    const tiers = read('quality.ts');
    expect(tiers).toContain('high: { dpr: [1, 1.75]');
    expect(tiers).toContain('medium: { dpr: [1, 1.25]');
    expect(read('ExperienceCanvas.tsx')).toContain('<PerformanceMonitor onDecline={() => { setEffects(false); setDpr(1); }}');
  });
});
