# Interview AI: full application redesign specification

Status: proposal for review; nothing here is implemented. This document extends
`docs/immersive-experience-plan.md`, whose landing chapters and Phase 1 foundation (commit `81858cf`)
become one part of a single identity across all six pages.

## 0. What exists, and what this must not break

| Page | Today | Data it already has | Notes |
|---|---|---|---|
| Landing | Cinematic landing on `main` + immersive preview (`experience.html`) | — | Phase 1 foundation is committed locally |
| Candidate dashboard | `Dashboard.tsx` + `ProgressHistory.tsx`: card grid (readiness, recent assessment, progress chart, history, next step) | `getCandidateProgress`, `getRecentInterviews`, `getSessions` | |
| Interview setup | `ResumeUploadView.tsx`: 3 stages (profile from résumé → direction → plan) | `uploadResumeFileWithProgress`, `getSetupOptions`, `createInterview` | |
| Live interview room | `InterviewRoom.tsx` (763 lines), `DeviceCheck`, `BlenderAssetScene` (3D human, visemes), vision overlay, integrity warnings | voice, transcription, speech, vision frames, integrity events | Highest risk: guarded by the voice-room, face-tracking, proctoring and three-warning verifiers |
| Intelligence report | `ResultsScreen.tsx` + `DetailedReportSections`, `SkillDevelopment`, `IntegrityReview` | `getInterviewResults`, `getInterviewDiagnostics` | |
| Profile and history | **No page yet.** History lives inside the dashboard | `getCurrentCandidate` (account + résumés), `getCandidateProgress` (all reports, skills, repeated weaknesses) | New view, **read-only**, built on existing endpoints; no backend change |

Guardrails for every phase:
- Presentation only. Hooks and logic files (`useInterviewMedia`, `useVisionMonitoring`,
  `useInterviewIntegrity`, `avatar-*`, `api.ts`) are not rewritten. Screens get new markup and styles
  around the same state and handlers.
- Tracking consent stays opt-in.
- Every existing verifier and all 332 contract tests stay green. Tests change only where they assert the
  old *look* (for example a class name), never where they assert behaviour.

**The references.** The message says references were provided, but no images or videos reached this
session. This specification uses the same reading as the landing plan: architectural showcase sites,
slow filmed camera moves, light on materials, drawings becoming space. Section 1 should be re-tuned once
I can see the references (file paths, or screenshots pasted into the chat).

## 1. Design system

### 1.1 Concept: one building, six rooms

The product is a building you move through. Each page is a room with its own purpose, built from the same
materials, light and drawing language:

| Page | Room | Character |
|---|---|---|
| Landing | **The approach** | Exterior, night, cinematic; the only page where scrolling is the experience |
| Dashboard | **The atrium** | Calm, overhead light, everything at a glance, one clear next step |
| Setup | **The drafting table** | Your résumé is drawn up into a plan; precise, step by step |
| Interview room | **The room** | Dim and quiet, all light on the conversation; nothing else competes |
| Report | **The drawing set** | Ivory sheets, annotations, evidence; the most "printed" page |
| Profile and history | **The archive** | Ordered, chronological, a record you can walk back through |

Shared drawing language, replacing cards: **plates** (bordered areas with a title block, like sheets in
a drawing set), **hairline rules** in Earth Brown, **dimension lines and annotations** for numbers, and
**index numbers** (01, 02, …) in Burnt Amber. Depth comes from light and real 3D, not stacked shadows
or glass.

### 1.2 Colour

The six brand colours are the identity. Each has one job:

| Colour | Role |
|---|---|
| Ink Black #031211 | The base: page background in every app screen, deep scene fog |
| Charcoal #090907 | Raised surfaces: plates, panels, the interview stage |
| Warm Ivory #E8E4D3 | Type, report sheets, primary line work |
| Electric Teal #00AEBB | The AI: the interviewer's light, primary actions, focus, live states, data highlight |
| Burnt Amber #B99D73 | The candidate's progress: index numbers, labels, the second data series, metal |
| Earth Brown #6C5636 | Structure: hairline rules, grid lines, axes, borders; never text |

Derived values (tints, `color-mix` steps, darker teals for teal text on light surfaces) stay in
`tokens.css` as they are now; component CSS keeps using only paint tokens.

**Decision needed: the colours not in this brief.** Today's tokens also use Cerulean #007BA7, Neon Rose
#FF2D95, Jet #0A0A0A and Snow #EDEDED, and the landing's Blender renders contain cerulean and rose.

Recommendation:
- Make **Ink Black** the base instead of Jet.
- Drop **Cerulean** and **Snow** from the identity.
- Keep **Rose only as a functional state colour**: errors, integrity warnings, destructive actions,
  and the one "attention" moment. Amber and Teal can't signal an error safely: amber already means
  progress, and a page with no distinct error colour fails people who rely on colour plus text.
- Re-render the Blender media in the six-colour palette (Phase 8).

**Light theme.** The app has a working light theme today (Step 7). It stays: Ivory becomes the
surface, Ink becomes the type, and Teal, Amber and Earth keep their roles at AA contrast. The landing
and the interview room stay dark in both themes, as now.

### 1.3 Typography

| Use | Face | Notes |
|---|---|---|
| Display: landing, page titles, report headline | A high-contrast serif: Instrument Serif or Fraunces (open licence) | Self-hosted WOFF2, Latin subset, about 40 KB |
| UI and body | Geist (already self-hosted) | 15–17px body text, 13px dense UI |
| Data: scores, times, indices | Geist Mono (already self-hosted) | Tabular figures; numbers look measured, not decorative |

Scale: the existing fluid tokens, with a new display step from 56 to 128px for the landing and 40 to
72px for page titles. Labels are 10–11px, uppercase, +0.2em tracking, Burnt Amber.

### 1.4 Space, grid, shape

- The existing 4pt grid, `--space-*` tokens and the 12-column grid with 24px gutters.
- **Corners become architectural:** 2–4px radii on plates and inputs, 1000px only on pill buttons.
  This replaces today's 12–16px card corners and is the biggest single visual change.
- **Elevation is three surface steps** (Ink → Charcoal → Charcoal plus an ivory hairline), plus one
  soft teal light "spill" for the active or live element. No glassmorphism: there is one sanctioned blur,
  the sticky navigation.

### 1.5 Components (design-system level)

New primitives in `components/library/` (the existing library is restyled, not replaced):

| Primitive | Replaces | What it is |
|---|---|---|
| `Plate` | `Card` | A sheet with a title block (index, label, title, optional action), hairline frame and optional corner registration marks |
| `TitleBlock` | page headings | Page index, eyebrow, display title, one line of context, primary action |
| `Annotation` / `DimensionLine` | inline stats | A number with a leader line pointing at what it measures |
| `Metric` | score rings | A large mono numeral, unit, a delta against the last session, and a source note |
| `Ledger` | lists and tables | A ruled table with sortable columns; history, evidence, answers |
| `Stage` | 3D containers | A 3D viewport with a poster fallback, quality tier, pause control, `aria-hidden` canvas and a text equivalent |
| `RailNav` | sidebar | A slim vertical rail: rooms as indexed entries, the current room lit in teal |
| `StatusLight` | status pills | A small light plus text: live, listening, thinking, warning |
| `Sheet` | report sections | An ivory "paper" surface for the report and printing |

Buttons, inputs, select, tabs, toasts and modal stay as they are and are restyled to the new shape and
type. All five states (default, hover, active, focus, disabled), 44px touch targets and the focus ring
are unchanged.

### 1.6 Data visualisation language

- Teal is the current value and the AI's reading. Amber is your history and comparison. Earth is
  axes and baselines. Rose is used only for a flagged gap.
- Charts are drawn like drawings: hairline axes, dimension-line labels, no fills heavier than 12%.
- Every chart has a text equivalent (a table or a sentence) and keyboard-reachable points.
- 3D is used for data only where depth adds meaning (the skill landscape). Trends stay 2D
  (SVG line and area).

## 2. Page architecture

### 2.1 Application shell (every signed-in page)

```
┌ RailNav ┬─────────────────────────────────────────────────┐
│ ◇ mark  │ TopBar: breadcrumb · StatusLight · theme · sound │
│ 01 Atrium│────────────────────────────────────────────────│
│ 02 New  │ TitleBlock                                       │
│ 03 Archive│ page content on the 12-column grid             │
│ ─────── │                                                  │
│ account │                                                  │
└─────────┴─────────────────────────────────────────────────┘
```

The interview room hides the rail and top bar entirely (full-bleed), exactly as `immersive-host` does
today. On phones the rail becomes a bottom bar with three entries.

### 2.2 Pages

**Landing.** As planned: seven chapters (Arrival, Pavilion, Room, Thinking, Landscape, Drawing Set,
Daylight) on one persistent 3D canvas. The interview-room and report chapters show the redesigned app
screens, so the landing previews the real product.

**Dashboard: the atrium.**
1. TitleBlock: "Good evening, {name}." A one-line readiness summary and **one** primary action, Start a
   new interview.
2. **Readiness stage.** A small 3D skill landscape of your latest assessment (6–8 columns), slowly lit.
   Beside it, three `Metric`s: overall, change since last time, strongest skill.
3. **Next best step.** A single plate from the latest roadmap item, with Practise this.
4. **Progress.** The existing trend chart, redrawn in the drawing language, with the comparison-group
   selector.
5. **Recent interviews.** A `Ledger` of the last five, linking to reports and to the archive.

**Setup: the drafting table.** It keeps the three stages, presented as one sheet being drawn.
1. **Profile:** drop the résumé, see the upload progress, then the extracted profile appears as
   annotated lines on the sheet (name, roles, skills, career path, clarification prompt).
2. **Direction:** role, level, interview type and duration as large choice tiles (not cards: hairline
   cells on a grid), with a live summary on the right.
3. **Plan:** the generated plan appears as a short "construction" animation: rounds drawn in order,
   each with its focus and duration. Then the device check, then Enter the room.

There is no 3D on this page beyond a small `Stage` of the room being prepared, shown in stage 3 and
skippable.

**Live interview room: the room.** Visual-only redesign, same logic.
- **Centre:** the 3D interviewer in a re-lit room (Blender set with a skylight and table edge, baked
  light), filling the stage.
- **Lower third:** the current question in display type, then the live transcript beneath it,
  typed as you speak.
- **Right edge:** a slim column with the round agenda, time, StatusLight (listening, thinking,
  speaking) and the camera preview (when proctoring is on).
- Integrity warnings stay `role="alert"` panels, styled in Rose, never hidden by the visuals.
- Device check gets the same room styling.
- Nothing decorative animates while you speak. Motion here is limited to the interviewer, the
  listening light and the transcript.

**Intelligence report: the drawing set.**
1. **Cover sheet:** role, date, overall `Metric` with change, a one-paragraph summary and the integrity
   note (if any).
2. **The skill landscape:** an interactive 3D view of every assessed skill. Hover or focus a column to
   see its evidence. Next to it is a ruled `Ledger` with the same data, the accessible equivalent.
3. **Strengths and gaps:** two facing sheets; gaps are tagged in Rose with the evidence quote.
4. **Evidence:** question by question, your answer and the assessment, with expandable rows.
5. **Roadmap:** the practice plan as a sequence of three plates, ending in Practise this next.
6. **Print / save:** a print stylesheet renders the report as ivory sheets.

**Profile and history: the archive (new).**
1. **Profile plate:** name, email, member since, résumés on file (`getCurrentCandidate`). Read-only;
   editing needs a backend endpoint that doesn't exist (a separate decision).
2. **Skill record:** current skills with confidence and repeated weaknesses (`getCandidateProgress`).
3. **Timeline:** every interview, newest first, grouped by month. Filter by role or comparison group;
   each entry links to its report.
4. **Progress over time:** the same trend component as the dashboard, full width, with every metric.

## 3. Component hierarchy

```
App
├─ LandingExperience (lazy)                      experience/ (Phase 1 done)
│  ├─ ExperienceCanvas → CameraRig, ChapterScenes, Atmosphere, Effects
│  └─ Chapter × 7 → TitleBlock(display), Annotation, CTA
├─ AuthScreen                                    restyled, with a small Stage of the pavilion
└─ AppShell (signed in)
   ├─ RailNav · TopBar(StatusLight, ThemeToggle, SoundToggle, account)
   ├─ DashboardPage
   │  ├─ TitleBlock · Stage(SkillLandscape, compact) · Metric × 3
   │  ├─ Plate(NextStep) · Plate(ProgressTrend) · Ledger(RecentInterviews)
   ├─ SetupPage
   │  ├─ TitleBlock · Stepper
   │  ├─ DraftingSheet → ResumeDrop, ExtractedProfile(Annotation…)
   │  ├─ DirectionGrid(ChoiceCell…) · PlanSummary
   │  └─ PlanConstruction(Round…) · DeviceCheck
   ├─ InterviewRoom (full-bleed, logic unchanged)
   │  ├─ RoomStage(BlenderAssetScene "room" variant) · QuestionTitle · LiveTranscript
   │  ├─ RoomColumn(Agenda, Timer, StatusLight, CameraPreview, VisionOverlay)
   │  └─ IntegrityAlert · RoomControls
   ├─ ReportPage
   │  ├─ CoverSheet(Metric, Summary, IntegrityNote)
   │  ├─ Stage(SkillLandscape, interactive) + Ledger(Skills)
   │  ├─ Sheet(Strengths) · Sheet(Gaps) · EvidenceLedger · Roadmap(Plate × 3)
   └─ ArchivePage (new)
      ├─ ProfilePlate · SkillRecord · Timeline(Entry…) · ProgressTrend(full)
shared/three: Stage, SkillLandscape, RoomSet, quality tiers (from experience/quality.ts)
```

`SkillLandscape` is built once and used in three places (the landing chapter, the dashboard and the
report), so the data visualisation is literally the same object across the product.

## 4. Animation strategy

**Principles.** Motion explains a change of state or place; it never decorates. One motion language
for the whole product, from the existing tokens: 150–400ms UI, a 0.8–1.2s cinematic tier for the
landing and page arrivals only.

| Layer | Where | Tool | Behaviour |
|---|---|---|---|
| Page arrival | Every app page | Motion (`motion/react`) | The TitleBlock rises 16px and fades (400ms), then plates stagger 60ms. The rail light glides to the new room. Shared-element transitions where a thing moves between pages: a history row opens into the report cover |
| UI feedback | Controls | CSS + existing tokens | Unchanged: hover, press, focus, toasts, success/error |
| Data | Charts, Metrics, landscape | Motion + R3F | Count-ups (existing), lines draw on first view, landscape columns rise from the plan. Once per view |
| Drawing reveals | Setup, report | GSAP (lazy) | Dimension lines and annotations draw by stroke offset; the plan "constructs" round by round |
| Cinematic | Landing only | GSAP ScrollTrigger + Lenis + R3F camera rig | Scroll-driven; already built (Phase 1) |
| Live states | Interview room | CSS + avatar system | Listening light breathes, the interviewer's visemes and idle motion (existing), the transcript types. Nothing else moves while you speak |
| Sound | Everywhere it exists today | `sound.ts` | Unchanged, opt-in |

**Reduced motion:** every layer collapses to instant state changes. The 3D stages show Blender
posters. Lenis is off. Count-ups show final values. This is the same rule the app already enforces
and tests.

## 5. 3D asset requirements

All made by reproducible scripts in `scripts/blender/`, rendered on the RTX 4060, palette-only
materials, with lighting baked where possible.

| Asset | Used on | Budget | Notes |
|---|---|---|---|
| Pavilion environment (modular kit) | Landing, auth | ≤ 3.5 MB (KTX2 + meshopt) | From the landing plan |
| **Interview room set**: table, skylight, wall panels, baked light | Room, landing chapter 2 | ≤ 2.5 MB + existing character | Reuses `human-interview-studio` |
| **SkillLandscape** | Landing, dashboard, report | Procedural in three.js (no file) | Instanced columns, a plan grid and labels. Driven by real report data in the app and example data on the landing |
| Report sheets and dimension-line kit | Landing, report header | ≤ 0.2 MB | |
| Drafting-table vignette | Setup stage 3 | ≤ 0.6 MB | Optional; a still is acceptable |
| Custom environment map from the pavilion | All 3D | ≤ 0.3 MB | Replaces generic RoomEnvironment reflections |
| Cycles stills and posters for every 3D view | Fallbacks, reduced motion, low tier | WebP, about 60–120 KB each | Required for every `Stage` |
| Re-renders of existing media in the six-colour palette | Landing film and loops | about 2 MB total | Only if cerulean and rose leave the identity |

**3D runtime rules.** One WebGL context per screen. Lazy-loaded after first paint. Rendering only while
visible. Device pixel ratio capped by tier, with the shared `quality.ts` tiers. Disposed on leaving
the page. Never in the critical path of a form.

## 6. Responsive strategy

| Range | Shell | 3D | Layout |
|---|---|---|---|
| ≥ 1280 | Rail + top bar | Full stages, high tier | 12 columns; report sheets side by side |
| 1024–1279 | Rail collapses to icons + labels on hover/focus | High or medium | 12 columns, tighter |
| 768–1023 | Top bar with menu | Medium tier, stages shorter | 8 columns; sheets stack |
| < 768 | **Bottom bar** (Atrium, New, Archive) + top bar | Medium tier; dashboard landscape becomes a poster with a "View in 3D" tap; report landscape is interactive only on demand | Single column; Ledger rows become stacked entries; interview room puts the question and transcript under the interviewer, with the agenda in a drawer |

Rules carried over and tested today:
- The breakpoint scale (640/768/1024/1280/1536).
- 44px targets.
- No horizontal scroll at the 12 audited widths.
- Fluid type.
- Safe-area insets in the room.

## 7. Implementation roadmap

Each phase ends with the app running, every changed screen inspected in both themes and at phone and
desktop sizes, all tests and verifiers passing, and a commit you approve.

| Phase | Scope | Exit check |
|---|---|---|
| **0. Decisions** | Palette question (§1.2), display face, references if available, Next.js/Tailwind (see below) | Your answers |
| **1. System foundation** | Tokens for the six-colour roles (both themes), display and mono type, radius/elevation change, primitives (Plate, TitleBlock, Metric, Ledger, Annotation, StatusLight, Sheet, Stage), restyled library; component showcase updated | Showcase page complete; axe and contrast clean; existing screens still work |
| **2. App shell** | RailNav, TopBar, phone bottom bar, page-arrival motion | Navigation, focus order and skip link verified on every screen |
| **3. Dashboard** | New layout + compact SkillLandscape `Stage` | Real data from a seeded account; fallback poster works |
| **4. Report** | Cover, interactive landscape + Ledger, sheets, evidence, roadmap, print stylesheet | Report verifier paths pass; printed output checked |
| **5. Archive (new page)** | Profile, skill record, timeline, full trend; new `profile` view in `App.tsx` and rail entry | Read-only, existing endpoints only |
| **6. Setup** | Drafting-sheet presentation of the three stages, plan construction, device check | Résumé upload → plan → room path passes the acceptance verifier |
| **7. Interview room** | Room set asset, new stage and lower-third layout, restyled controls and alerts. **No logic changes** | Voice-room, face-tracking, proctoring and three-warning verifiers all pass unchanged |
| **8. Landing** | Immersive landing Phases 2–7 (pavilion, room, thinking, landscape, drawing set, daylight); replaces the current landing; re-render media if the palette changes | Landing verifier, performance budgets |
| **9. Hardening** | Bundle and performance budgets per page, full audits in both themes, reduced motion, real-device check | Every budget measured and met |

Why this order:
- The system and shell come first, because every page depends on them.
- The report and dashboard follow because they are lower-risk and show the identity fastest.
- The room comes late because it carries the most live behaviour.
- The landing comes last, so its product chapters can show the finished screens.

**Stack position** (same reasoning as the landing plan):
- **Keep Vite and React 19 rather than moving to Next.js.** The whole app is a client-side SPA around
  auth, media devices and WebGL. Next.js would mean rewriting routing and the build for no visual gain.
- **Keep the token CSS rather than Tailwind.** Tests forbid raw colours outside tokens, and two styling
  systems would drift.
- **Keep Motion (`motion/react`, the renamed Framer Motion) for UI**, GSAP + ScrollTrigger for
  drawing and scroll scenes, and R3F + drei for 3D. Lenis on the landing only: smooth scrolling inside
  forms and the interview room would hurt usability.
