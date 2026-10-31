# Immersive 3D experience: architecture and roadmap

Status: proposal for review. Nothing in this document is implemented yet.

## 0. Starting point and open inputs

**What exists today (keep it):**
- The Node/TypeScript API, authentication, interview engine, database, voice room, face tracking and Python vision worker. None of these are touched. The landing only links into the existing `onStart` and `onWorkspace` flows.
- A Vite 8 + React 19 single-page app. Screens are lazy-loaded, and a design-token system (`tokens.css`, paint roles, motion and sound tokens) is enforced by 329 contract tests.
- A cinematic landing, already on `main`: the opening title, the Blender hero film, the live 3D hero bust, "The Instrument" chapter scene, the product sections and the closing loop.
- A Blender 5.2 pipeline (`scripts/blender/*`) that renders on the RTX 4060 with OptiX. The GLBs already built are `hero-bust`, `human-interview-studio`, `intelligence-core`, `interview-studio` and `landing-instrument`.
- Libraries already installed: three 0.186, GSAP 3.15, Motion 14.

**Missing:** the two reference videos were not attached. This plan uses the vocabulary that architectural showcase sites usually share:
- slow dolly and crane moves through built space;
- light sweeping across materials;
- plan-to-elevation extrusions and cross-section cutaways;
- full-bleed image and video wipes;
- large, quiet typography.

Section 2 should be re-tuned once the videos (or frames from them) are available.

## 1. Decisions to confirm before building

| Topic | Recommendation | Why |
|---|---|---|
| Framework | **Keep Vite + React 19**, don't migrate to Next.js. Pre-render the landing's HTML at build time for first paint and SEO. | The app is a client-side SPA with auth, media devices and WebGL. Next.js would mean rewriting routing, env handling, the build and dev scripts, and the source paths the tests read. The visual result is the same, because the 3D work runs in the browser either way. |
| 3D layer | **Add React Three Fiber + drei** for the new scenes; keep the existing raw three.js components until they are replaced. | R3F makes one persistent canvas, scene composition and asset suspense manageable. drei adds GLTF/KTX2 loaders, `PerformanceMonitor` and `AdaptiveDpr`. |
| Scrolling | **Add Lenis**, driving GSAP ScrollTrigger (already installed). | A smooth, inertial scroll is what makes scroll-scrubbed cameras feel filmed. It is switched off under reduced motion and for keyboard and assistive-tech scrolling. |
| Styling | **Don't add Tailwind**; keep the token CSS. | A second styling system would duplicate the tokens. Tests forbid raw colours outside `tokens.css`. If you want Tailwind anyway, its theme can be generated from the tokens. |
| Post-processing | Add `postprocessing` (via `@react-three/postprocessing`), desktop high tier only. | Selective bloom on emissive parts, subtle depth of field, film grain and vignette. |
| Existing cinematic landing | **Evolve it** into the new structure. Reuse the film, Instrument, hero bust and studio assets instead of discarding them. | Those assets are already art-directed in the palette and verified. |

## 2. Visual design specification

**Concept: "The Building of a Conversation."** The references present buildings; we present an interview as an architecture you walk through. The product's AI is the building, the candidate's answer is the light moving through it, and the report is the drawing set you leave with.

**Palette** (unchanged, assigned by role):
- **Space:** Jet #0A0A0A, Charcoal #090907, Ink #031211.
- **Structure:** obsidian surfaces, Earth #6C5636, brass #B99D73.
- **Light:** Teal #00AEBB is the AI. Cerulean #007BA7 is the candidate's voice.
- **Type:** Ivory #E8E4D3.
- **Accent:** Rose #FF2D95 marks only the single moment that matters, such as a key insight or the final call to action. At most one rose element is visible at a time.

**Materials:**
- polished obsidian;
- honed ink concrete;
- brushed brass;
- frosted glass with teal transmission;
- ivory paper.

All are physically based and authored in Blender. Lighting and soft shadows are baked into the textures.

**Typography:**
- A display serif for monumental, architectural headlines. Candidates are an open-licence one (Fraunces or Instrument Serif) or a licensed one.
- The existing sans for UI and body text.
- Headlines are masked line reveals, never letter-by-letter gimmicks.
- Scale: display headlines of 96–160px on desktop and 44–56px on mobile. Body text stays at 15–17px.

**Composition:**
- Every section is full-bleed with one subject and one statement.
- Copy keeps to a 12-column grid and a fixed left margin.
- Generous negative space; no cards, no repeated feature grids.
- Product facts appear as annotations in the scene, like dimension lines on a drawing.

**Motion character:**
- Slow, weighted and filmed. The camera moves along authored splines and never orbits at random.
- Easing is `power3`/`expo` for transitions and linear for scrubbed cameras.
- Nothing loops unless it is ambient light or particles.

## 3. Landing page architecture (chapters)

There is one persistent fixed WebGL canvas behind the page. The DOM sections scroll over it, and each chapter owns a stretch of the scroll timeline.

| # | Chapter | Scene (WebGL) | Content (DOM) | Interaction |
|---|---|---|---|---|
| 0 | **Arrival** | A thin teal line draws the floor plan of the pavilion, then the plan extrudes into 3D walls. This is the loader and the opening shot in one. | Wordmark, one line of copy. | Skip on any input; once per session. |
| 1 | **The Pavilion** (AI intelligence) | Exterior crane shot of an obsidian-and-brass pavilion at night, then a dolly through the entrance as the interior light rises. The Instrument becomes the pavilion's core. | "An interviewer that thinks with you." | The scroll drives the camera along a spline. |
| 2 | **The Room** (interview experience) | Inside: the existing human interviewer at a table, under a skylight. The camera settles opposite, at the candidate's eye level. | Three short beats: it asks, it listens, it follows up. | Click one of three sample questions: the interviewer turns, and the caption and a pre-rendered voice line play. Clearly labelled as a preview; no microphone. |
| 3 | **The Thinking** (intelligence visualization) | Cutaway section: the candidate's answer travels as cerulean light into the core, which branches into teal follow-up paths, shown like a building section drawing. | Annotations explain how follow-ups come from what you said. | Hover a branch to read the follow-up it produced. |
| 4 | **The Landscape** (performance visualization) | Skill scores extruded from a floor plan into a terrain of columns, using the labelled example report. The camera cranes over it. | Skill names as dimension labels; strengths and gaps. | Scroll scrubs the extrusion; hovering or focusing a column shows its evidence. |
| 5 | **The Drawing Set** (intelligence report) | The report as a set of ivory sheets in space. The camera pulls in and each sheet wipes to the real DOM report preview. | The existing `ReportPreview` content. | Page through the three sheets. |
| 6 | **Daylight** (call to action) | The camera exits through a doorway into teal dawn light; the Cycles loop is the reduced-motion and mobile version. | "Walk into your next interview prepared." with Start practising and Sign in. | The primary call to action. |

The existing facts from "how it works", "capabilities" and "method" are folded into chapters 2–4 as annotations rather than separate card sections. The footer stays as it is.

## 4. 3D scene architecture

```
<App>
  <LandingExperience>                lazy route chunk
    <ScrollProvider>                 Lenis + ScrollTrigger; one master timeline; progress in a ref (no React re-render per frame)
    <ExperienceCanvas>               single fixed R3F <Canvas>, frameloop "demand" while idle
      <QualityTier>                  detect-gpu + PerformanceMonitor → high | medium | low (low = stills/video, no canvas)
      <CameraRig>                    CatmullRom spline per chapter, keyed to master progress; damped; slight pointer parallax
      <ChapterScene id=…>            mounted within ±1 chapter of the viewport, disposed when far away
         useGLTF (meshopt + KTX2)    baked lightmap materials; instanced repeats
      <Atmosphere>                   GPU particles, fog, volumetric light cards (sprites, not ray-marched)
      <Effects tier=high>            selective bloom, depth of field, grain, vignette
    <ChapterDOM>…</ChapterDOM>       real headings and text, scrolling over the canvas, fully accessible
```

- **One WebGL context** for the whole landing; the current hero, Instrument and closing scenes merge into it. This avoids context limits and makes scene-to-scene transitions continuous.
- **Transitions:** camera flights between chapters on a shared spline. A fullscreen shader pass handles cuts: a dissolve driven by depth, or a wipe that follows architectural lines.
- **State:** scroll progress and quality tier live in a small store (zustand or a ref store). React state changes only when the chapter changes.
- **Asset loading:** chapter 0–1 assets load first. Each later chapter prefetches when the visitor is one chapter away. Everything sits behind Suspense, with Blender poster stills as fallbacks.

## 5. Animation and transition specification

| Element | Technique | Timing |
|---|---|---|
| Camera moves | Spline position and target scrubbed by ScrollTrigger (`scrub: 1`), damped in `useFrame`. | Each chapter takes 150–250 vh of scroll. |
| Chapter cuts | Shader dissolve or wipe, 0.8–1.2 s, `expo.inOut`. Plays when crossing a boundary, reversible. | |
| Headline reveal | Masked lines rise 100% to 0, 80 ms stagger, 0.9 s, `power3.out`. | Triggered at 60% of the viewport. |
| Annotations | Dimension lines draw in by stroke-dashoffset, then the labels fade. | 0.6 s. |
| Data extrusion | Instanced column heights tween from 0 to the value as the scroll scrubs. | Tied to progress. |
| Interviewer preview | Existing viseme and idle system; pre-rendered audio for three sample lines. | Played on click. |
| Ambient | Particle drift, a slow light sweep across materials. | Paused off-screen. |
| Reduced motion | No Lenis, no scrubbing, no transitions. Each chapter shows its Cycles still or loop poster, and the text appears at once. | |

## 6. Asset requirements

**New Blender work** (scripts in `scripts/blender/`, reproducible like the current ones):
1. **Pavilion environment.** Exterior and interior, modular kit, under 150k triangles, baked lightmaps on 2K KTX2 atlases. Budget: about 3.5 MB compressed.
2. **Interview room set.** A refinement of `human-interview-studio` with a skylight, a table and baked shadows. Budget: about 2.5 MB plus the existing character.
3. **Intelligence core and branching section geometry.** Curves and instancing. Budget: about 0.4 MB.
4. **Report sheets and dimension-line kit.** Budget: about 0.2 MB.
5. **Custom HDRI** baked from the pavilion for reflections. 1K, about 0.3 MB.

**Pre-rendered Cycles media:**
- one still per chapter (fallback and poster);
- the arrival flythrough as a 6–8 s film;
- the daylight loop.

Each is H.264 plus AV1/WebM, 1280×720, with 1920 wide for desktop where justified.

**Audio:** three short interviewer preview lines, generated with the existing speech pipeline or recorded.

**Type:** one display serif, self-hosted WOFF2, subset to Latin.

## 7. Responsive strategy

- **Desktop (≥1280):** full chapters with the high tier, post-processing and pointer parallax.
- **Laptop and tablet (768–1279):** the medium tier with no post-processing, DPR capped at 1.5 and shorter scroll lengths.
- **Phones (<768):** the camera paths are re-authored for portrait framing; the subject sits in the upper 60%, with copy below.
  - Interactions become taps.
  - DPR is capped at 1.25 with about 40% of the desktop particle count.
  - Chapters 3–4 use simplified geometry.
- **Low tier, data saver, no WebGL:** Cycles stills and loops with the same copy and links. The page stays complete.
- Touch targets stay at least 44 px, there is no horizontal scroll, and the existing 12-width responsive audit is extended to the new chapters.

## 8. Performance strategy and budgets

| Metric | Target |
|---|---|
| Largest contentful paint | ≤ 2.0 s on a mid-range laptop (the arrival poster is the LCP element). |
| First contentful paint | ≤ 1.0 s; landing HTML pre-rendered. |
| Cumulative layout shift | ≤ 0.02. |
| Initial landing JavaScript (before 3D) | ≤ 170 KB gzipped. |
| 3D runtime chunk (three + R3F + drei subset) | ≤ 260 KB gzipped, lazy. |
| 3D assets loaded at once | ≤ 4 MB; total ≤ 9 MB desktop and ≤ 3.5 MB phone. |
| Frame rate | 60 fps desktop high tier; ≥ 30 fps phone. The tier drops automatically on sustained frame drops. |
| GPU memory | Textures in KTX2; dispose chapters more than one chapter away. |

**Techniques:**
- Baked lighting instead of real-time shadows, plus meshopt geometry and KTX2 textures.
- Instancing for repeated parts.
- `frameloop="demand"` when nothing animates; rendering pauses off-screen and in background tabs.
- One context, prefetching by chapter, and preconnect and preload for the arrival assets only.

**Accessibility:**
- All meaning lives in the DOM. Canvases are `aria-hidden`.
- Keyboard focus moves the scroll to the focused chapter.
- Interactive 3D elements have DOM equivalents.
- Reduced motion is fully honoured.

**Verification:**
- Extend `verify-cinematic-landing`, the axe, contrast, responsive and reduced-motion audits, and the contract tests.
- Add a frame-time benchmark per tier and a bundle-size check.

## 9. Implementation roadmap

Each phase ends with the site running, screenshots inspected, tests passing and a commit.

| Phase | Scope | Exit check |
|---|---|---|
| **1. Foundation** | Add R3F, drei, Lenis and postprocessing. Build the persistent canvas, scroll provider, camera rig, quality tiers and chapter scaffold with placeholder blocks. Pre-render the landing HTML. | Scroll drives the camera through 7 placeholder chapters at 60 fps; reduced motion and low tier work; existing tests pass. |
| **2. Art direction lock** | Re-tune section 2 against the reference videos. Block out the pavilion in Blender; produce lighting and material look frames as Cycles stills. | You approve the look frames before the full asset build. |
| **3. Arrival and Pavilion** | Pavilion asset, baked lighting, plan-to-3D arrival, entrance flythrough, display typography. | Chapters 0–1 complete on desktop and phone. |
| **4. Room and Thinking** | Room set with the existing interviewer, sample question interaction, branching section visualization. | Chapters 2–3 complete; the interviewer preview works without a microphone. |
| **5. Landscape and Drawing Set** | Skill terrain from the labelled example data, report sheets wiping into the DOM report. | Chapters 4–5 complete. |
| **6. Daylight and integration** | Final call to action; retire the superseded landing components; fold product facts into chapters. | The full page replaces the current landing; all calls to action reach the existing auth and interview flows. |
| **7. Hardening** | Performance budgets, mobile camera paths, fallbacks, accessibility, audits, verifier updates. | Every budget in section 8 is met and measured. |

**Out of scope throughout:** the backend, authentication, interview engine, database, voice room, face tracking and vision worker.
