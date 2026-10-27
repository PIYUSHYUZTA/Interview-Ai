# Cinematic landing page

Implemented inside the existing React application. The existing account, dashboard, resume setup and interview callbacks remain the entry paths.

## Current Blender integration

The active hero now loads the original Blender-authored intelligence-core GLB
through `BlenderAssetScene` and Three.js. The live interview room loads the
prepared CC0 human studio figure (Part 3; see `INTERVIEW_STUDIO.md`). Sources, reproducible generation, asset budgets,
runtime cleanup, commands and verification limits are documented in
[`BLENDER_WORKFLOW.md`](BLENDER_WORKFLOW.md). The earlier shader implementation
remains in the repository as prior work; it is no longer the active hero.

## Part 11 — nine-colour identity, cinematic film, shader particles and GSAP

### Palette hierarchy
All nine brand colours are CSS tokens on `.cinema` (`--ink`, `--ivory`, `--teal`,
`--charcoal`, `--earth`, `--amber`, `--jet`, `--cerulean`, `--rose`). Each colour's
role is set by measured contrast:

| Role | Colours | Notes |
| --- | --- | --- |
| Grounds | Jet Black (page, hero), Ink Black (how it works, film, method, closing), Charcoal Black (features, footer) | Full-bleed bands behind centred containers |
| Typography | Warm Ivory; muted Ivory at ≥ 62% | ≈16:1 |
| Interactive | Electric Teal (eyebrows, links, primary button fill with Ink Black text, ≈7:1); Cerulean (rings, lines, glows, rails, 3D rim light) | Cerulean is 4.1:1, so never small text |
| Warm detail | Burnt Amber (step numbers, labels, film note, ≈7.3:1); Earth Brown (hairlines, card borders, footer rule, halo core metal) | Earth Brown is 2.5:1, so never text |
| Highlight | Neon Rose: the current step, the speaking state, the caption mic glyph, one halo lip, the 3D kicker light | — |

The earlier non-palette tint `#248DB3` is gone: Electric Teal meets AA on its own.

### 3D hero
- The bust and halo were regenerated in the full palette (see `BLENDER_WORKFLOW.md`).
- The live scene adds a Warm Ivory key and a Burnt Amber bounce light.
- 520 shader particles (Three.js `Points` + `ShaderMaterial`, additive, palette-
  weighted Teal/Cerulean/Amber/Rose) drift behind the bust. Motion runs in the vertex
  shader; time only advances while motion is allowed.

### Cinematic film interlude (`LandingFilm.tsx`, `#the-interviewer`)
- A 10 s seamless loop rendered in Blender Cycles on the GPU (`render_hero_film.py`).
- The video is requested only within 600 px of the section, plays only while ≥ 25%
  visible with the tab visible, and never autoplays under reduced motion or data
  saver.
- There is always a real Pause/Play film control. The visitor's choice persists
  while scrolling.
- If the film fails, the poster frame remains with the note *Film unavailable ·
  showing a still frame*.
- On phones the film is a framed shot above the copy.
- The copy states the film is pre-rendered and that the room draws the character
  live.

### GSAP (3.15.0, the one new dependency, explicitly requested)
- Loaded through `landing-gsap.ts` as separate lazy chunks (gsap 27 KB and
  ScrollTrigger 17.5 KB gzipped), only when a scroll scene is near and motion is
  allowed. Under reduced motion it is never downloaded.
- **Film:** the clip-path opens from an inset rounded frame to full bleed (scrubbed),
  the footage moves with scrubbed parallax, and the headline lines rise in.
- **How it works:** a scroll-drawn Teal→Cerulean→Amber rail on wide screens, plus a
  current-step state (Amber border, Rose numeral).
- Everything else keeps using the existing `motion/react` system.

### Verification (26 October 2026)
- **Film:** 1.76 MB H.264, 240 frames at 24 fps, 1280×720, Cycles on the RTX 4060
  (about 4.7 s per frame). `--seam-check` shows frame 241 vs frame 1 differ by
  0.02/255 on average, so the loop is seamless. `validate-3d-assets.py` checks the MP4
  container, SHA-256 receipt, a 6 MB budget and the WebP poster.
- **`verify-cinematic-landing.ts`:**
  - All nine tokens are present and used by role.
  - 520 particles.
  - A fresh page does not request the film.
  - The film plays on screen, GSAP opens the frame fully, and Pause holds when
    scrolling back.
  - Reduced motion: no autoplay, GSAP never downloaded, Play/Pause work.
  - A missing film falls back to the still frame with an honest note.
  - First contentful paint 392 ms with the 3D after it; CLS 0.0027; 210 text
    elements meet WCAG AA.
- **Real GPU (browser pane, RTX 4060):** the hero holds the 30 fps cap with particles,
  and the film plays.
- **Regression:** 245 tests and `verify-avatar-turns.ts` pass; the room is untouched.
- **Fixed during testing:**
  - The phone film sat behind its text, so it is now stacked above the copy.
  - The film headline wrapped mid-phrase.
  - The first headline line inherited the muted subtitle colour.
  - `vite preview` had packaged the placeholder MP4 from before the render finished;
    a rebuild picked up the real film.

## Part 10 — implementation-rules audit

- **Controls:** an automated crawl found 27 real controls on the landing page, and
  every in-page link resolves to an existing section. The one fake affordance (step 1
  drew radio options with a selected state, plus role chips, that did nothing) is now
  a read-only list labelled *Options on the setup screen*. The landing page cannot
  preselect those choices without changing the setup screen, which is out of scope.
- **Maintainability:** removed 145 dead rules (177 selectors, 44 unused classes) from
  `LandingPage.css` (67 KB → 52 KB) with a PostCSS pass that keeps any selector whose
  `c-*` classes appear in source. Deterministic full-page captures at 1440, 390 and
  820 px were pixel-identical before and after.

## Part 9 — responsiveness, performance and accessibility (measured)

Measured in headless Edge (software WebGL) before and after this pass:

| Measure | Before | After |
| --- | --- | --- |
| First contentful paint | 876 ms | 372–436 ms |
| Largest contentful paint | 3,732 ms | 1,012–1,052 ms |
| Cumulative layout shift | 0.006 (0.014 after the sticky nav) | 0.0025–0.0028 (font swap only) |
| Text groups failing WCAG AA contrast | 21 | 0 (204 visible text elements checked) |
| Tap targets under 24 px | 9–11 per viewport | 0 at all 8 sizes |
| Horizontal overflow (320–1920 px) | none | none |

Changes:
- **Render path:** fonts load from `<link>` tags with preconnect in `index.html`
  instead of a CSS `@import` chain. The hero waits for browser idle (≤1.2 s) before
  starting Three.js and fetching the GLB. The Cycles poster is the loading state, and
  the 3D region is `aria-busy` while loading. Three.js, the GLTF loader and the model
  stay in separate lazy chunks.
- **Layout stability:** the sticky nav condenses visually (background and border),
  not by height, which had shifted the page.
- **Contrast:** Cerulean `#007BA7` is 4.14:1 on Jet Black, below AA for text. Text
  and button fills now use the 14% tint `#248DB3` (5.2:1 on Jet Black, 4.6:1 on
  panels, 5.2:1 for Jet Black text on it). Pure Cerulean remains for rings, lines,
  borders and glows. Faint neutral labels were raised to at least 62% opacity, and the
  disabled motion control is no longer dimmed below AA.
- **Readability:** the minimum text size is 9 px (previously 5–8 px in places).
- **Tap targets:** navigation, footer and standalone links are at least 32 px tall
  (44 px for text CTAs).
- **Dependencies:** removed the unused `@radix-ui/react-switch` and the vendored switch.
- **Shared button:** `vendor.css` moved onto the palette (it still had the old teal
  border and ivory focus ring).
- **Bottom edge of the hero art:** the disclosure and the motion control no longer
  overlap at any size, and on ≤380 px the caption lifts so the note stays clear.

`scripts/verify-cinematic-landing.ts` now asserts: Three.js chunks and the model start
after first contentful paint, CLS < 0.05, zero AA contrast failures
(`scripts/contrast-audit.js`), the real sign-up form (short password rejected, a valid
account created and signed in), and 768×1024 and 1024×768 tablets (no overflow in any
section, CTA in the first viewport, navigation visible).

## Part 8 — page structure (navigation → hero → how it works → features → CTA → footer)

- **A. Navigation:** logo; *How it works*, *Features*, *About*; *Sign in* (or
  *Workspace* when the app already has a session, via the new `signedIn` prop from
  `App.tsx`); *Start practicing*. Phones get a real menu: a toggle with
  `aria-expanded`, an opaque panel with the three links and both actions, Escape to
  close with focus returned, and it closes on navigation. Previously the links were
  simply hidden on phones.
- **B. Hero:** unchanged; *Explore the Platform* now leads to *How it works*.
- **C. How it works (`#how-it-works`):** three visually distinct step cards with
  alternating layouts, each marked *Available now*, replacing the five-tab chapter
  widget and the separate resume section:
  1. *Choose an interview type* shows the real types from `/interviews/options`
     (Complete interview, Technical deep dive, Behavioral & communication) and the
     role presets.
  2. *Practice with the AI interviewer* shows the interviewer portrait and the three
     real room states.
  3. *Review feedback and improve* shows skill bars labelled **EXAMPLE DATA** and a
     next-practice item.
- **D. Features (`#capabilities`):** four implemented capabilities only: voice-based
  practice, technical and behavioral preparation, feedback and performance analysis,
  and history and progress tracking (dashboard history, progress chart, skill
  profile, repeated weaknesses). An *Availability* note separates what depends on
  configuration: an AI provider (otherwise the labeled deterministic demo mode) and
  Windows speech for lip sync (otherwise the browser voice without it). No planned
  features are presented as available.
- **About:** the adaptive-question demo section (`#approach`), followed by the room
  preview and the report preview, which show the implemented product in more depth.
- **E. Final CTA:** unchanged.
- **F. Footer:** Product / About / Account groups and a product information line.
  The app has no legal or support pages, so none are linked.

`scripts/verify-cinematic-landing.ts` now checks the three steps and their real
interview types, the four feature titles and the availability note, *Sign in* →
account screen, and the phone menu (open, links, Escape with focus return,
navigate).

## Part 7 — visual identity pass

Audited the full page against the brief (premium, cinematic, no floating cards,
excess neon or template look) and changed the parts that failed:
- **Hero:** removed the "Candidate context" glass card, the connector lines (one
  dot landed on the face), the in-art "THE AI INTERVIEWER · 01/03" caption and the
  duplicated UNDERSTAND/ADAPT/DEVELOP row. The bust and halo are the subject. The
  conversation is one centred caption beneath it, styled like live subtitles, with
  the waveform and a single Neon Rose mic glyph. The camera was eased back so the
  halo stays fully framed down to 1366×768.
- **Interviewer portrait:** the generic magenta "AI orb" in the room preview and the
  "Meet your AI interviewer" chapter is replaced with a circular crop of the
  Cycles-rendered interviewer (`.c-portrait`), so the page shows one consistent,
  realistic interviewer.
- **Closing section:** the outlined ellipse is replaced with soft Cerulean light.
- **Room and hero fabric:** the suit normal map is softened at runtime because it
  read as blotches under the rim light. This was confirmed on an RTX 4060, not only
  in software rendering.

Neon Rose remains limited to the halo arc, the caption's mic glyph, hover and
active states, and a few labels.

## Part 4 — human hero and three-color identity

The palette is now Jet Black `#0A0A0A` (dominant), Cerulean Blue `#007BA7`
(structure, light and interaction) and Neon Rose `#FF2D95` (selective emphasis).
Text uses neutral `#EDEDED`; borders and raised surfaces are tints of the two
darker colors. All Blender assets were regenerated with this palette.

The hero now shows `hero-bust.glb`: the CC0 interviewer cropped and capped as a
portrait bust inside an original orbital halo (alloy orbits, Cerulean inlays, one
Neon Rose lip). Blender authors the crop in the relaxed pose, removes the unseen
mouth interior and keeps only blink and smile shapes. The browser frames the
camera from the rig's `Head` joint and lights it with a soft neutral key, a strong
Cerulean rim and a restrained Neon Rose kicker (AgX tone mapping). Pointer
movement turns the bust slightly; the halo's exported animation, idle blinks,
camera drift and pause/reduced-motion rules match the earlier core.

Low-power fallback: devices reporting data saver, ≤2 GB memory or ≤2 CPU cores
show the Cycles-rendered poster (`hero-bust-poster.webp`, ~94 KB) and never
create WebGL or download the GLB. If a device that does load the scene renders
slower than roughly 12 fps after warm-up, the scene releases its GPU resources
and settles on the same poster. Missing WebGL and failed downloads use it too.

Copy changes: headline "Interview practice that feels real.", a voice-first
supporting line, and a three-card feature section (`#capabilities`) for realistic
voice interaction, adaptive questions and actionable feedback. No testimonials,
user counts or performance claims were added.

Regenerate the bust and poster:

```powershell
.\scripts\generate-3d-assets.ps1 -HeroBust -Render
```

Verification (25 October 2026, Blender 5.2.3 LTS): `scripts/verify-cinematic-landing.ts`
passed, including a new low-power check that asserts the poster renders with no
canvas and no GLB request. Screenshots use software WebGL (SwiftShader); a physical
GPU renders hair and skin with more detail.

## Part 2 — six-color product experience

The hero uses the requested headline and supporting copy, with working candidate
entry and experience links. The Blender core has dark titanium orbits, a faceted
ceramic center, a fine alloy exoskeleton, teal light inlays, amber details and
three transmissive optical blades. Real perspective-camera entrance and drift
complement the existing pointer response, scroll depth and section reveals.
The resume-intelligence section connects resume evidence, confirmed direction
and the interview plan. Existing adaptive examples, room preview, report preview,
closing CTA and footer remain integrated. Previews are explicitly illustrative.
Native anchor navigation is smooth, with instant navigation under reduced motion.
The six base colors are Ink Black, Warm Ivory, Electric Teal, Charcoal, Earth
Brown and Burnt Amber; transparency and lighting create their tonal variations.
No new dependencies or backend logic were introduced for Part 2.

Part 2 verification (22 October 2026): Blender generation and GLB validation
passed, including actual transmission materials, required geometry, embedded
resources and hashes. Frontend/backend builds passed; frontend lint exited zero
with existing unrelated warnings. The full regression confirmation passed
234/234 tests across 43 files (`.browser-verification/part2-tests.json`). The
first restricted run could not connect to localhost (EACCES); an unrestricted
run then had one intermittent auth test failure. That test passed in isolation
and the complete confirmation run passed. No authentication code was changed.

The production browser harness tests real GLBs in software WebGL, camera movement,
pointer response, pause, context recovery, offscreen suspension, reduced-motion
changes, GPU cleanup, all internal anchor targets, candidate entry callbacks,
resume workflow content, preview palette, and desktop/1366px/390px/320px layouts.
It also tests missing-model/no-WebGL and unavailable-audio fallbacks. Screenshots
and results are written to `.browser-verification/cinematic-*`. Software rendering
is not a physical-GPU performance benchmark. No live LLM or physical media-device
verification is claimed by this landing-page milestone.

Changed implementation: `LandingPage.tsx`, `LandingPage.css`,
`LandingProductPreviews.tsx`, `BlenderAssetScene.tsx`,
`scripts/blender/generate_assets.py`, `scripts/validate-3d-assets.py` and
`scripts/verify-cinematic-landing.ts`. Regeneration updates both named Blender
sources, previews, GLBs and the model manifest. `BLENDER_WORKFLOW.md` and
`LANDING_MOTION.md` document the asset and animation changes.

Start the existing application in two PowerShell terminals:

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run start:api
```

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run dev:frontend
```

Open `http://localhost:5173/`. The Python vision service is not required for the
landing page; its existing interview configuration is unchanged.


## Earlier shader refinement (historical)

The landing-only refresh updates `LandingPage.tsx`, `LandingPage.css` and
`IntelligenceScene.tsx`. The hero uses a custom faceted sapphire core, finer
metallic orbital geometry, restrained cyan/violet studio reflections, soft
atmospheric light, frosted context panels, geometric heading treatment and an
editorial three-part index. The matching SVG fallback and closing sculpture also
use the faceted visual language. Product previews, navigation, opt-in sound,
reduced-motion handling and the actual interview application are preserved.
No frontend dependencies or backend modules were added or changed.

Higgsfield was first discovered as uninstalled, then became accessible during this
session. Account/workspace inspection succeeded. Its account reported free plan,
zero credits and no free-generation grants. A one-image preflight returned .25
credits; an actual image-generation request was rejected with **Requires basic
plan or higher**. No job ID or generated asset was returned. No Higgsfield image
or video is embedded or claimed. The functional alternative is the custom WebGL
scene, implemented in the existing renderer; it needs no external media service.

Latest frontend/backend builds and lint passed (existing unrelated warnings remain).
The full application regression suite passed 234 tests, zero failures; report:
`.browser-verification/landing-refresh-tests.json`. Browser checks use the built
application, real software WebGL, real API routing and native Web Audio. They verify
shader rendering/pointer uniforms, pause/offscreen suspension, runtime reduced
motion, actual context loss/restoration, GPU cleanup, labelled product previews,
CTA/account/setup navigation, responsive desktop/laptop/390px/320px layouts and
no-WebGL fallback. No browser runtime errors were observed. Physical GPU/speaker
performance is not established by headless software rendering. Older counts and
bundle values in historical sections below describe earlier milestones.


## Files

- `frontend/src/components/LandingPage.tsx`: new product narrative, hero, accessible chapter tabs, method section, evidence/development section and working candidate CTAs. Uses existing Motion and shared button components.
- `frontend/src/components/LandingPage.css`: six-color brand system, existing Manrope/DM Sans typography, responsive spacing, focus states and reduced-motion styling. The `cinema` namespace avoids older landing/dashboard style collisions.
- `frontend/src/components/IntelligenceScene.tsx`: genuine WebGL geometry rendered with signed-distance ray marching. Metallic toroidal rings, an illuminated core, studio reflection lighting, depth/occlusion, gentle rotation and pointer response. No external rendering library, image assets, videos or additional packages.
- `scripts/verify-cinematic-landing.ts`: production-browser rendering, navigation, responsive, motion, context-loss and fallback checks.

## Motion and reliability

The 3D scene caps drawing to approximately 30 frames/second and drawing-buffer density to 1.25x, with a 900px maximum side. Rendering suspends when offscreen or the document is hidden. Pause/resume is a real rendering control. Reduced-motion preferences produce a still frame. Missing/failed WebGL uses static SVG artwork and labels the visual as static; product navigation stays available. Context loss shows the fallback, and restoration rebuilds GPU resources. Event listeners, animation frames, observers, buffers, programs and shaders are cleaned up.

Entrance motion is brief and section reveals happen once. Scrolling stays native. Interactive chapter tabs support arrows, Home and End, expose selected states and control a labelled tab panel. Marketing previews are labelled illustrative and contain no invented candidate scores, customer statistics or testimonials. Voice-service availability remains disclosed.

## Verification

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run build:frontend
npx tsx scripts/verify-cinematic-landing.ts
npx vitest run --maxWorkers=1 --minWorkers=1
npm --prefix frontend run lint
```

The browser script uses the bundled Playwright runtime and installed Edge; override `PLAYWRIGHT_MODULE_PATH` and `BROWSER_EXECUTABLE` on other machines. It runs temporary local API/production-preview servers and isolated test accounts. The explicit SwiftShader flag enables real software WebGL in headless Edge; this is not a hardware performance benchmark.

Verified: production shader compilation/rendering, changing frame draws, pause stopping draws, actual context loss/restoration, chapter selection and keyboard navigation, anchors, logged-out authentication routing, signed-in dashboard and resume routing, 390px/320px overflow checks, reduced motion, and no-WebGL fallback. Browser runtime errors: none. Screenshots and structured results are in `.browser-verification/cinematic-*`.

Full existing regression suite: 193 tests across 31 files passed. Frontend TypeScript and production build passed. Largest JS entry remains approximately 387 KB; the lazy landing chunk is approximately 39 KB. Lint exits successfully with existing product warnings and a WebGL external-state synchronization warning; no lint errors.

For local development, use the existing two terminals: `npm run start:api` and `npm run dev:frontend`. Open `http://localhost:5173/`. No new service, asset download or API key is required for the landing page.

## Hero refinement

The first viewport now uses the requested headline, supporting copy, **Start Your Interview** / **Explore the Experience** actions, and the resume/adaptation/feedback descriptor. The desktop scene fits the available viewport height; mobile uses an intentional stacked composition.

The existing custom WebGL scene was extended with a larger illuminated core, fine orbital geometry and six analytic light particles. Particle ray tests have fixed cost and do not add per-particle ray-march geometry. Layered candidate-context and conversational glass panels respond gently to the pointer. The waveform is decorative, is explicitly labelled illustrative, and requests no microphone permission. No candidate scores, live transcripts or real assessment results are invented in the hero.

The geometry has a short scale/rotation/fade entrance. Reduced motion skips it and freezes continuous animation. Pause stops both WebGL draws and waveform animation; the waveform also pauses offscreen. Drawing remains capped at approximately 30 fps and 900px maximum buffer size. Pointer input is tested against the actual shader uniform, not a fake scene state. Navigating into the existing application deletes the scene's GPU resources.

Modified files: `LandingPage.tsx`, `LandingPage.css`, `IntelligenceScene.tsx`, the focused browser verification script and this document. No dependencies or backend modules changed.

Hero refinement verification: frontend build passed. Production browser checks passed actual shader pointer response, draw/pause behavior, waveform pause, offscreen suspension, context loss/restoration, GPU-resource disposal on navigation, existing CTA/account/setup routes, 1440px desktop, 1366×768 first-viewport fit, 390px/320px layouts, reduced motion and no-WebGL fallback. No browser runtime errors were observed. Lint exits 0 with the previously documented warnings. Tests close browser contexts sequentially to limit software-rendering memory use.

The page-wide motion system, shared timings and latest accessibility/rendering checks are documented in `LANDING_MOTION.md`.

## Complete landing story

The landing page now includes all six requested sections:

- Existing real WebGL hero with working account/setup and workspace entry points.
- Five-step, keyboard-accessible journey: resume upload, interviewer, voice response, intelligence, and further practice.
- Selectable strong/partial/weak response examples with different follow-up questions and explanatory progress paths. These are curated marketing illustrations, explicitly labelled; they never drive the real interview engine.
- Interview-room preview reusing the actual `InterviewerVisual` with a labelled candidate silhouette, decorative waveform, and non-interactive control representations. It does not mount the live room, request permissions, play audio, or submit answers.
- Clearly labelled example report with skill meters, evidence, strengths, gaps, improved-answer wording and a prioritized three-step practice roadmap. Reuses the product's `Meter` component. Values are illustrative, not visitor results.
- Closing “Walk into your next interview prepared.” / “Start Practicing” action, restrained CSS 3D sculpture, and footer links to actual sections/workspace. No legal routes exist in the application, so no invented legal links were added.

Files changed for this section milestone: `frontend/src/components/LandingPage.tsx`, `LandingPage.css`, new `LandingProductPreviews.tsx`, `scripts/verify-cinematic-landing.ts`, and this document. No dependencies or backend changes.

Verification: frontend production build and TypeScript passed; browser acceptance passed the five-step keyboard flow, all three illustrative answer paths, new preview structure and disclosures, closing CTA, existing account/dashboard/resume navigation, responsive layouts, reduced motion, real WebGL behavior and cleanup. No browser runtime errors observed. Screenshots include `.browser-verification/landing-adaptive.png`, `landing-room.png` and `landing-report.png`. Full regression suite: 193/193 tests in 31 files passed with localhost access enabled (sandboxed API tests cannot connect). Frontend lint exits 0 with existing warnings.

## Optional landing sound

> **Superseded by the product sound system (design Step 5).** The landing toggle is now the shared
> `SoundToggle` ("Interface sounds"), backed by `frontend/src/components/sound/sound.ts` and the cue
> recipes in `frontend/src/design-system/sound.ts`; `useLandingSound.ts` was removed. Sound is still off
> by default and never plays on load, but the on/off choice is now remembered in localStorage, as the
> Step 5 brief asks. Cues are normalised to -22 LUFS or quieter (ceiling -18 LUFS), checked in
> `src/api/soundSystem.test.ts`. The text below describes the original landing-only implementation.

Sound is off on every fresh page load and has a visible, keyboard-accessible toggle at the lower right. Opting in plays a short activation accent. Deliberately changing a journey step or example answer path can play a soft transition accent; selecting the same item, hovering and scrolling never play sounds. Accents are rate-limited to avoid rapid repetition. There is no background soundtrack or audio download.

`useLandingSound.ts` synthesizes a sine tone with a smooth envelope (peak normalized gain 0.025, duration 220 ms). A context is created only for an explicit opted-in interaction and closes at the end of that cue. Muting, hiding the page or leaving the landing page closes active audio. Browser resume failures or missing Web Audio return the toggle to off and show a neutral message; product navigation remains usable. Sound preferences are intentionally not restored across reloads.

Files changed: `useLandingSound.ts` (new), `LandingPage.tsx`, `LandingProductPreviews.tsx`, `LandingPage.css`, `scripts/verify-cinematic-landing.ts`, and this document. No added libraries or assets.

Verification: frontend TypeScript/build passed; lint exits 0 with existing warnings. Production browser acceptance observed no audio context before opt-in, real nonzero synthesized waveform samples below 0.04 amplitude, closure after playback/mute/navigation, off after reload, and usable previews when Web Audio is missing or blocked. Existing landing navigation, keyboard, responsive, motion and WebGL checks passed with no runtime errors. Automated waveform verification does not verify physical speaker/headphone audibility or subjective sound quality.

## Six-color brand system

The landing page and candidate product screens share these roles: Ink Black `#031211` for the environment, Warm Ivory `#E8E4D3` for readable type, Electric Teal `#00AEBB` for active intelligence and primary actions, Charcoal `#090907` for inset surfaces, Earth Brown `#6C5636` for restrained material borders, and Burnt Amber `#B99D73` for secondary highlights and review states. Dashboard, resume, interview-room, warning, report and shared controls use these same tokens; no extra blue or violet brand accent was added.

The existing real WebGL scene remains the hero centerpiece. Its faceted core and particle light are teal, with ivory studio reflections and subtle brown/amber material highlights. Product behavior, APIs, authentication and interview progression are unchanged. Optional landing sound remains synthesized, opt-in and muted by default.

Updated verification: `npm test` passed 234 tests across 43 files; `npm run build` and `npm run build:frontend` passed. `scripts/verify-cinematic-landing.ts` passed real software-WebGL rendering, navigation, reduced-motion, responsive and sound-toggle checks. An isolated authenticated browser check also rendered the candidate dashboard and opened a saved deterministic report with shared palette tokens and no page errors; screenshots are `.browser-verification/brand-dashboard.png` and `.browser-verification/brand-report.png`. The older `scripts/verify-product-ui.ts` browser journey stops at an obsolete “Read each question aloud” selector that no longer exists in the current voice room; it does not indicate a product runtime failure. Headless software rendering does not establish physical GPU performance.
