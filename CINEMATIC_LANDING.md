# Cinematic landing page

Implemented inside the existing React application. The existing account, dashboard, resume setup and interview callbacks remain the entry paths.

## Current Blender integration

The active hero now loads the original Blender-authored intelligence-core GLB
through `BlenderAssetScene` and Three.js. The live interview room loads the
prepared CC0 human studio figure (Part 3; see `INTERVIEW_STUDIO.md`). Sources, reproducible generation, asset budgets,
runtime cleanup, commands and verification limits are documented in
[`BLENDER_WORKFLOW.md`](BLENDER_WORKFLOW.md). The earlier shader implementation
remains in the repository as prior work; it is no longer the active hero.

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

Sound is off on every fresh page load and has a visible, keyboard-accessible toggle at the lower right. Opting in plays a short activation accent. Deliberately changing a journey step or example answer path can play a soft transition accent; selecting the same item, hovering and scrolling never play sounds. Accents are rate-limited to avoid rapid repetition. There is no background soundtrack or audio download.

`useLandingSound.ts` synthesizes a sine tone with a smooth envelope (peak normalized gain 0.025, duration 220 ms). A context is created only for an explicit opted-in interaction and closes at the end of that cue. Muting, hiding the page or leaving the landing page closes active audio. Browser resume failures or missing Web Audio return the toggle to off and show a neutral message; product navigation remains usable. Sound preferences are intentionally not restored across reloads.

Files changed: `useLandingSound.ts` (new), `LandingPage.tsx`, `LandingProductPreviews.tsx`, `LandingPage.css`, `scripts/verify-cinematic-landing.ts`, and this document. No added libraries or assets.

Verification: frontend TypeScript/build passed; lint exits 0 with existing warnings. Production browser acceptance observed no audio context before opt-in, real nonzero synthesized waveform samples below 0.04 amplitude, closure after playback/mute/navigation, off after reload, and usable previews when Web Audio is missing or blocked. Existing landing navigation, keyboard, responsive, motion and WebGL checks passed with no runtime errors. Automated waveform verification does not verify physical speaker/headphone audibility or subjective sound quality.

## Six-color brand system

The landing page and candidate product screens share these roles: Ink Black `#031211` for the environment, Warm Ivory `#E8E4D3` for readable type, Electric Teal `#00AEBB` for active intelligence and primary actions, Charcoal `#090907` for inset surfaces, Earth Brown `#6C5636` for restrained material borders, and Burnt Amber `#B99D73` for secondary highlights and review states. Dashboard, resume, interview-room, warning, report and shared controls use these same tokens; no extra blue or violet brand accent was added.

The existing real WebGL scene remains the hero centerpiece. Its faceted core and particle light are teal, with ivory studio reflections and subtle brown/amber material highlights. Product behavior, APIs, authentication and interview progression are unchanged. Optional landing sound remains synthesized, opt-in and muted by default.

Updated verification: `npm test` passed 234 tests across 43 files; `npm run build` and `npm run build:frontend` passed. `scripts/verify-cinematic-landing.ts` passed real software-WebGL rendering, navigation, reduced-motion, responsive and sound-toggle checks. An isolated authenticated browser check also rendered the candidate dashboard and opened a saved deterministic report with shared palette tokens and no page errors; screenshots are `.browser-verification/brand-dashboard.png` and `.browser-verification/brand-report.png`. The older `scripts/verify-product-ui.ts` browser journey stops at an obsolete “Read each question aloud” selector that no longer exists in the current voice room; it does not indicate a product runtime failure. Headless software rendering does not establish physical GPU performance.
