# Landing motion system

The existing `motion/react` library coordinates the landing page. No animation dependency was added.

## Section motion (current)

| Element | Motion | Reduced motion |
| --- | --- | --- |
| Navigation | Sticky; condenses from 88 to 68 px after 12 px of scroll. The current section (*How it works / Features / About*) is marked with `aria-current="location"` and a Cerulean underline. Hover draws a half underline. | No transitions; marking still updates |
| Phone menu | 240 ms fade and 8 px slide in and out | Appears and disappears instantly |
| How-it-works cards | Once-only reveal. Interview types stagger in at 80 ms. Hover brightens the border and visual, and the step number turns Neon Rose (no layout movement). | Content shown immediately; hover colour only |
| Practice step | Illustrative turn-taking cycle (speaking → listening → evaluating) every 2.2 s, only while ≥40% visible | Static on *Interviewer speaking* |
| Review step | Example skill bars fill once over 900 ms using `scaleX`. The track is observed because a zero-width bar is ignored by viewport observers. | Bars full immediately |
| Anchor navigation | Smooth scroll with `scroll-margin-top: 84px` under the sticky nav | Instant |

All new motion uses `transform`, `opacity` and colour, never layout properties.
`scripts/verify-cinematic-landing.ts` checks: sticky and condensed position, the
current-section marker, the cycle advancing while visible, the bars reaching full
scale, and in a reduced-motion context the cycle and bars staying still.

## Blender camera movement

The core's perspective camera settles from 6.35 to 5.8 scene units, with an
exponential entrance and restrained slow lateral drift. Pointer movement adjusts
camera position and model rotation with the existing smoothing. Elapsed time
advances only while visible and motion is allowed; reduced motion uses neutral
framing. The interview-studio camera remains fixed. Anchor navigation is smooth
only when reduced motion is not requested.

## Shared language

`frontend/src/components/landing-motion.ts` is the source for JavaScript transitions, CSS custom properties, reveal variants, stagger spacing and pointer response. It also owns a `useSyncExternalStore` subscription to the browser reduced-motion preference: the installed Motion hook reads only the initial value, so a reactive subscription is needed for live preference changes.

| Motion | Duration / behavior |
| --- | --- |
| Press feedback | 100 ms |
| Hover and focus feedback | 160 ms |
| Content swap | 240 ms |
| Section reveal | 640 ms, 18px travel |
| Atmospheric-light entrance | 1200 ms, once |
| 3D entrance | 1300 ms, 0.92 → 1 scale, −4° → 0°, opacity |
| Group stagger | 80 ms |
| Hero scroll depth | Up to 48px drift and 3.5% scale change |

Entrance easing is `(0.22, 1, 0.36, 1)`. Interaction easing is `(0.2, 0.8, 0.2, 1)`. Pointer layers use a damped spring; WebGL pointer following uses elapsed-time exponential damping, so its response is independent of rendering cadence. The existing 30fps drawing cap, resolution cap and offscreen/background suspension remain.

## Coordinated sequences

- The headline, supporting text, descriptor, core and glass panels follow one entrance schedule. The CTA is stationary and visible at 72% opacity on its first render; its short fade never disables pointer or keyboard access. Navigation is available immediately.
- Hero lighting fades in gradually. Method-section atmosphere and closing light enter once, without continuous glow pulsing.
- `LandingReveal.tsx` owns once-only intersection reveals. Principles, method steps and evidence rows use shared stagger variants. Keyboard focus immediately exposes a reveal group through both Motion controls and synchronous `:focus-within` styling.
- Existing tabs use the shared swap duration/easing. Button, link and chapter-card hover feedback use shared CSS timing variables; active feedback is shorter.
- Hero scroll movement is bounded. Scrolling remains native, with no pinned sequence or scroll lock.

## Accessibility and lifecycle

Reduced motion removes reveal travel, staggers, scene entrance transforms, pointer movement and continuous waveform/geometry animation. Below-fold content is immediately visible in that mode. A preference change exposes pending reveal groups and freezes/restarts the existing WebGL loop without recompiling shaders or reallocating buffers. Hover transforms are disabled for reduced motion.

Pausing the scene stops drawing and the waveform, ends any pending core entrance and stops pointer springs. Unmounting cancels rendering and removes observers/listeners/GPU resources. Existing context-loss restoration and the static no-WebGL fallback remain in place.

## Changed files

- `frontend/src/components/landing-motion.ts`: canonical timing, easing, response, CSS variables and reveal/stagger variants.
- `frontend/src/components/LandingReveal.tsx`: accessible once-only reveal/group behavior.
- `frontend/src/components/LandingPage.tsx`: coordinated entrances, staggered groups, lighting, scroll depth and interaction policy.
- `frontend/src/components/LandingPage.css`: shared transition variables, hover/press feedback, atmosphere and synchronous keyboard visibility.
- `frontend/src/components/IntelligenceScene.tsx`: frame-independent pointer damping and shared frame budget.
- `scripts/verify-cinematic-landing.ts`: real DOM/rendering checks for the motion system.

## Verification

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run build:frontend
npx tsx scripts/verify-cinematic-landing.ts
npm --prefix frontend run lint
```

Passed: TypeScript/production build; real first-render CTA visibility; CSS/JavaScript token agreement; below-fold intersection gating; observed staggered row opacities; no reveal replay; immediate keyboard-focus visibility; actual shader pointer response; pause/offscreen suspension; WebGL loss/restoration; GPU disposal on navigation; existing account/dashboard/setup paths; desktop/laptop/mobile layouts; reduced motion and no-WebGL fallback. No browser runtime errors were observed. Browser tests use headless Edge with software WebGL, not a hardware performance benchmark.

Lint exits successfully with the previously documented React warnings in existing product/GPU lifecycle code. There are no new lint errors. No backend behavior or interview logic was changed.

Final browser rerun also passed live reduced-motion toggling: drawing stops and resumes without deleting/recreating the WebGL program. No runtime browser errors were observed.
