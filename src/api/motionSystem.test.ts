import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { motionTokens } from '../../frontend/src/design-system/motion';
import { landingMotion } from '../../frontend/src/components/landing-motion';

// Guards the motion system: one set of timing tokens shared by CSS and JavaScript, the specified
// timings, reduced motion that really stops motion, and no second animation library.
const SOURCE = 'frontend/src';
const read = (file: string) => readFileSync(`${SOURCE}/${file}`, 'utf8').replace(/\r\n/g, '\n');
const tokens = read('design-system/tokens.css');
const css = read('design-system/motion.css');
const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
const reducedBlock = (text: string) => text.slice(text.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
const ms = (token: string) => {
  const match = new RegExp(`${token}: (\\d+)ms;`).exec(tokens);
  if (!match) throw new Error(`missing ${token}`);
  return Number(match[1]) / 1000;
};

describe('motion system', () => {
  it('defines the specified timings once, in tokens.css, mirrored exactly for JavaScript', () => {
    const expected: Record<string, number> = {
      '--duration-press': motionTokens.duration.press, '--duration-dropdown': motionTokens.duration.dropdown,
      '--duration-modal-in': motionTokens.duration.modalIn, '--duration-modal-out': motionTokens.duration.modalOut,
      '--duration-page-in': motionTokens.duration.pageIn, '--duration-page-out': motionTokens.duration.pageOut,
      '--duration-nav': motionTokens.duration.nav, '--duration-media': motionTokens.duration.media,
      '--duration-reveal': motionTokens.duration.reveal, '--duration-shake': motionTokens.duration.shake,
      '--duration-count': motionTokens.duration.count, '--duration-shimmer': motionTokens.duration.shimmer,
      '--stagger-word': motionTokens.stagger.word, '--stagger-item': motionTokens.stagger.item,
      '--toast-lifetime': motionTokens.toastLifetime,
    };
    for (const [token, seconds] of Object.entries(expected)) expect([token, ms(token)]).toEqual([token, seconds]);
    // The values the brief specifies.
    expect([ms('--duration-page-out'), ms('--duration-page-in'), ms('--duration-modal-in'), ms('--duration-modal-out')]).toEqual([0.15, 0.2, 0.2, 0.15]);
    expect([ms('--duration-reveal'), ms('--stagger-item'), ms('--stagger-word'), ms('--duration-nav'), ms('--duration-dropdown'), ms('--duration-shake'), ms('--duration-shimmer')]).toEqual([0.4, 0.08, 0.06, 0.25, 0.18, 0.4, 1.5]);
    expect(tokens).toContain('--distance-reveal: 20px;');
    expect(tokens).toContain('--distance-lift: -4px;');
    expect(tokens).toContain('--distance-shake: 8px;');
    expect(tokens).toContain(`--ease-out: cubic-bezier(${motionTokens.ease.out.join(', ')});`);
  });

  it('reduced motion zeroes every motion duration, stagger and distance, but not the toast reading time', () => {
    const reduced = reducedBlock(tokens);
    const motionTokenNames = [...tokens.matchAll(/(--(?:duration|stagger|distance)-[a-z-]+):/g)].map((m) => m[1]);
    for (const name of new Set(motionTokenNames)) expect(reduced).toMatch(new RegExp(`${name}: 0(ms|px);`));
    expect(reduced).not.toContain('--toast-lifetime');
    const reducedCss = reducedBlock(css);
    for (const looping of ['.ds-skeleton', '.ds-typewriter-caret', '.ds-gradient-text', '.ds-spotlight']) expect(reducedCss).toContain(looping);
  });

  it('the landing hero follows the specified entrance order and timing', () => {
    const e = landingMotion.entrance;
    expect(landingMotion.wordStagger).toBe(0.06);
    expect(landingMotion.stagger).toBe(0.08);
    expect(landingMotion.duration.reveal).toBe(0.4);
    expect(landingMotion.distance.reveal).toBe(20);
    expect(landingMotion.parallax).toBe(0.3);
    const lastWord = e.headline + 4 * landingMotion.wordStagger; // five headline words
    expect(e.copy - lastWord).toBeCloseTo(0.2, 6);
    expect(e.action - e.copy).toBeCloseTo(0.3, 6);
    expect(e.background).toBe(0.4);
    expect(e.headline < e.copy && e.copy < e.action && e.action < e.descriptor).toBe(true);
    const landing = read('components/LandingPage.tsx');
    expect(landing).toContain('<WordReveal text="Interview practice" delay={timing.entrance.headline} />');
    expect(landing).toContain('<WordReveal text="that feels real." delay={timing.entrance.headline} startIndex={2} />');
    expect(landing).toMatch(/initial=\{reduced \? false : \{ opacity: \.72, scale: \.95 \}\}/); // CTA never starts invisible
    expect(landing).toContain('window.scrollY > 80');
    for (const advanced of ['{...magnetic(!!reduced)}', 'className="ds-spotlight"', '<Typewriter', 'variants={bento} custom={index}', 'timing.parallax', 'className="ds-gradient-text"']) expect(landing).toContain(advanced);
    expect(landing.match(/from="left"/g)?.length).toBe(5); // section headings slide in from the left
  });

  it('the landing navigation arrives once and condenses past 80px', () => {
    const landingCss = read('components/LandingPage.css');
    expect(landingCss).toContain('@keyframes c-nav-arrive { from { transform: translateY(-100%); } }');
    expect(landingCss).toMatch(/\.cinema > \.c-nav \{[^}]*animation: c-nav-arrive[^}]*backwards;[^}]*transition: height var\(--duration-nav\)/);
    expect(landingCss).toMatch(/\.cinema > \.c-nav\.is-scrolled \{ height: 64px;[^}]*backdrop-filter: blur\(12px\);/);
    expect(landingCss).toContain('transform-origin: center; transition: transform var(--duration-normal) var(--ease-out); }');
  });

  it('interaction and feedback motion use tokens only and match the brief', () => {
    const plain = withoutComments(css);
    expect(plain.match(/#[0-9a-f]{3,8}\b|rgba?\(/gi) ?? []).toEqual([]);
    expect(plain.match(/\b\d+ms\b/g) ?? []).toEqual([]); // every duration is a token
    expect(plain).toContain('.ds-lift:hover { translate: 0 var(--distance-lift); box-shadow: var(--shadow-lg); }');
    expect(plain).toMatch(/\.btn:hover:not\(:disabled\) \{ scale: 1\.02; \}/);
    expect(plain).toMatch(/btn-ghost::before \{[^}]*transform: scaleX\(0\);[^}]*transform-origin: left center;/);
    expect(plain).toMatch(/::before \{[^}]*clip-path: circle\(0% at 50% 50%\);/);
    expect(plain).toContain('.ds-media-zoom:hover img { scale: 1.04; }');
    expect(plain).toContain('@keyframes ds-shake {\n  0%, 100% { translate: 0; }\n  10%, 40%, 70% { translate: calc(var(--distance-shake) * -1) 0; }\n  25%, 55%, 85% { translate: var(--distance-shake) 0; }\n}');
    expect(plain).toContain('@keyframes ds-modal-in { from { opacity: 0; scale: 0.96; } }');
    expect(plain).toContain('dialog.ds-modal[data-closing] { animation: ds-modal-out var(--duration-modal-out) var(--ease-in) forwards; }');
    expect(plain).toContain('animation: ds-toast-timer var(--toast-lifetime) linear forwards;');
    expect(plain).toContain('animation: ds-shimmer var(--duration-shimmer) ease-in-out infinite;');
    expect(plain).toContain('transition: block-size var(--duration-dropdown) var(--ease-out)');
  });

  it('the product uses the shared components: page transitions, toasts, submit states, skeletons, count-up', () => {
    const app = read('App.tsx');
    expect(app).not.toContain('BlurFade');
    expect(app).toContain('<AnimatePresence mode="wait" initial={false}><PageTransition key={screenKey} onEnter={entered}>');
    expect(app).toContain('<ToastProvider>');
    expect(app).toContain("notify(`Signed in as ${result.candidate.name}.`, 'success', { silent: true });");
    const auth = read('components/AuthScreen.tsx');
    for (const used of ['<ActionButton type="submit"', '<TextField label="Email address"', '<PasswordField ', 'useShake<HTMLFormElement>()', 'await holdSuccess();']) expect(auth).toContain(used);
    expect(read('components/ui.tsx')).toContain('className="modal ds-modal"');
    expect(read('components/Dashboard.tsx')).toContain('<CountUp value={completed.length} />');
    expect(read('components/Dashboard.tsx')).toContain('<SkeletonScreen label="Loading your workspace…"');
    expect(read('components/ResultsScreen.tsx')).toContain('<SkeletonScreen label="Bringing your assessment together…"');
  });

  it('adds no animation library: Motion and GSAP were already installed', () => {
    const pkg = JSON.parse(readFileSync('frontend/package.json', 'utf8'));
    const animation = Object.keys(pkg.dependencies).filter((d) => /motion|gsap|anime|spring|framer|lottie|aos|velocity/.test(d));
    expect(animation.sort()).toEqual(['gsap', 'motion']);
  });
});
