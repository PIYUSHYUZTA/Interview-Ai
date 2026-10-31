# Interview AI: reference-mapped redesign specification

Status: proposal for review; nothing here is implemented.

This replaces the visual concept in `application-redesign-spec.md` ("one building, six rooms"), which was
written before the references arrived. Where the two disagree, this document wins. The engineering
decisions carry over unchanged:
- strict six colours;
- Vite + React 19;
- R3F/drei/GSAP/Lenis;
- the Phase 1 foundation in `frontend/src/experience/`;
- no changes to functionality.

## 0. The references

Saved in `docs/references/` so every phase can be checked against them.

| # | File | Source | Page |
|---|---|---|---|
| 1 | `01-landing-mindhyve.webp` | Awwwards, mindhyve.ai: "Where Intelligence Meets Sustainability" | Landing |
| 2 | `02-dashboard-synexis.png` | Dribbble: Synexis SaaS analytics dashboard | Candidate dashboard |
| 3 | `03-setup-scale.png` | nicelydone.club: Scale GenAI platform demo form | Interview setup |
| 4 | `04-room-hologram.png` | digen.ai: holographic personal video message scene | Live interview room |
| 5 | `05-report-assessment.png` | msagsi.com: generative AI assessment dashboard | Intelligence report |
| — | Two reference videos | **Not received yet** | Motion and transition language (section 4 is partly provisional) |

**Ordering note.** Your brief refers to images by position ("fourth", "second-last", "last", "sixth"), and
those positions don't line up with the five images received. The mapping above is by content: each
image's subject plainly matches one page. Please confirm it.

### 0.1 The one systematic change: colour

Every reference uses colours outside your strict six:
- violet and lavender (2, 4);
- royal blue and magenta (1);
- rainbow iridescence (3);
- orange, purple and green chart fills (2, 5).

Fidelity here means keeping each reference's **composition, hierarchy, typography, spacing, lighting
character and interaction**, and re-mapping its hues one-to-one onto the six:

| Reference hue | Its job in the reference | Becomes |
|---|---|---|
| Violet / lavender glow (2, 4) | Primary accent, active state, glow | **Electric Teal** #00AEBB |
| Royal blue night (1) | Environment, ambient light | **Ink Black** #031211 with teal moonlight |
| Magenta / pink sparks (1, 4) | Secondary sparkle | **Burnt Amber** #B99D73 |
| Mint green bars / deltas (2) | Positive change | Teal (positive) and Amber (comparison) |
| Orange / purple / green chart fills (5) | Categorical data | Teal, Amber, Earth, Ivory in a fixed order |
| Rainbow iridescent rims (3) | Material sheen | Thin-film shader limited to Teal → Ivory → Amber |
| Near-black panels (all) | Surfaces | Charcoal #090907 on Ink |
| White type (all) | Text | Warm Ivory #E8E4D3 |
| Grid and divider lines | Structure | Earth Brown #6C5636 hairlines |

Errors and warnings have no colour of their own under the strict six. They use Amber **plus** an icon,
a text label ("Error", "Warning") and a heavier left rule, so they are never signalled by colour alone.

## 1. Visual design system (extracted from the references)

What all five share, and therefore what makes them one product:

| Property | Taken from | Specification |
|---|---|---|
| **Surfaces** | 2, 3, 5 | Ink page; Charcoal panels with a 1px hairline border at 8–12% ivory; 12–16px panel radius (2 and 3 both use soft-rounded panels, so the earlier "sharp corners" idea is dropped) |
| **Glow** | 1, 2, 3, 4 | One glow per screen, always teal, always behind the hero object: the tree (1), the orb (2), the rings (3), the hologram (4). Never on text or panels |
| **Pills** | 1, 2 | Primary action is a filled teal pill with a dark circular arrow chip on its right edge (1: "Ready to Connect ➜"). Secondary is an outline pill. The active nav item is a filled pill (2) |
| **Typography** | 1, 2, 3 | A geometric grotesk throughout. Large titles in light/regular weight with tight tracking (1: hero, 3: form title). Small uppercase eyebrows with wide tracking (2: "ACTIVE MODELS"). Large numerals for KPIs (2, 5). **Geist** already matches this; no display serif |
| **Type scale** | 1, 2 | Hero 64–88px light (1); page title 28–32px semibold (2); KPI numeral 28–36px (2); body 13–15px; eyebrow 10px uppercase +0.14em |
| **Data** | 2, 5 | Mini bar sparklines inside KPI tiles. A smooth area chart with a dashed comparison line. Circular gauges with a centred numeral. A donut. A bubble grid. Thin-bar histograms |
| **3D hero object per page** | 1, 3, 4, 5 | Each page has one luminous object that carries the AI: tree, rings, hologram, neural network. In the dashboard it's the glowing orb |
| **Atmosphere** | 1, 4 | Floating light particles (fireflies 1, sparks 4) in Amber and Ivory, sparse |
| **Iconography** | 2 | Small line icons in nav and list rows; Lucide (already the icon system) |
| **Layout** | 2, 5 | Fixed left sidebar plus top bar, content on a 12-column grid. Dense but evenly gutted (16–20px) |

### 1.1 Tokens

The colour tokens are re-derived from the six only (the contrast check is already done):

| Role | Dark | Light |
|---|---|---|
| Page | Ink #031211 | Ivory 86% + Amber 14% (#E1DAC6) |
| Panel | Charcoal #090907 / Ink + 3.5–10.5% Ivory | Ivory #E8E4D3 |
| Primary text | Ivory (15:1) | Ink (13.7:1) |
| Muted text | Ivory 60% (5.9:1) | Ink 66% (5.2:1) |
| Teal as text | Teal (7.1:1) | Teal 45% + Ink 55% (5.9:1) |
| Amber as text | Amber (7.4:1) | Earth (5.0:1) |
| Success / info | Teal | Teal-on-light mix |
| Warning / error | Amber + icon + label | Earth 80% + icon + label |

Cerulean, Rose, Snow, Jet, white, black and the green, gold and sky semantic hues are removed from the
palette. The landing films and Blender stills that contain cerulean and rose are re-rendered.

The light theme stays, and every page keeps working in it. The references are all dark, so dark is the
designed default; light is the mirror.

## 2. Page-by-page architecture

### Page 01: Landing (reference 1, mindhyve)

**What the reference does:**
- A full-bleed, real-time 3D night scene: a single luminous tree made of glowing particles stands on a
  small island, mirrored in still water, under a canopy.
- Fireflies drift through the scene.
- A floating **logo pill** sits top-left, and a **glass pill navigation** top-right, ending in a filled
  "Contact ●➜" pill and a round **sound toggle**.
- The hero copy sits **bottom-left**: brand line in teal, a three-line light-weight headline, a two-line
  subhead with one teal word, then a filled pill and an outline pill.
- **"Scroll to Discover ⌄"** sits bottom-right.

**Translation:**
- **Hero object: the "Tree of Thought."** A luminous particle tree on a dark island in a reflective
  pool. Its branches are the follow-up questions that grow from one answer; the trunk is the
  conversation. This is the reference's own image, given a meaning in your product. It is built in
  Blender (trunk and branch curves, canopy volume) and rendered in R3F as instanced glowing points on
  the canopy, a teal-emissive trunk, planar water reflection and amber fireflies.
- **Layout, one-to-one with the reference:**
  - Logo pill top-left.
  - Pill nav top-right (How it works, Features, About, Sign in), ending with a "Start practising ●➜"
    pill and the existing **sound toggle** (we already have one).
  - Bottom-left hero: "interview ai" in teal; the headline **"Where Intelligence Meets Your Story."**
    (three lines, light weight). The phrase "Where Intelligence Meets" is the reference's philosophy;
    the ending is ours. The subhead is "Beyond practice questions: a real conversation with an AI
    interviewer that *listens*" (one teal word).
  - "Start practising ●➜" plus "See how it works"; "Scroll to discover ⌄" bottom-right.
- **Below the hero:**
  - The scroll story from the Phase 1 foundation continues in the same night world. The camera
    descends from the canopy along the branches.
  - Chapters: How it listens, How it follows up, What you receive.
  - Each chapter is anchored to a part of the tree (roots for the résumé, trunk for the conversation,
    branches for follow-ups, blossoms for the report).
  - The existing interviewer film becomes the "Meet your interviewer" chapter.
  - Exact camera moves and transitions wait for the videos.

### Page 02: Candidate dashboard (reference 2, Synexis)

**What the reference does:**
- A **left sidebar** with: logo and product name, nav items with icons (the active one a filled
  gradient pill), a "New Project" pill, Support and Account links, and a promo card at the bottom.
- A **top bar** with search, text links, notification and theme icons, and the user's name and avatar.
- A **title** "Systems Overview", plus a one-line subtitle with one highlighted figure.
- A **row of three KPI tiles**. Each has an uppercase label, a big number, a small sub-label, a delta
  badge, a faint icon and a mini bar chart.
- A **large area chart** "Intelligence Growth": a smooth filled curve and a dashed comparison line,
  with time-range toggles.
- A **right column "Neural Activity"**: an event feed (icon, title, description, time) and a glowing
  orb button above "View system logs".
- A **bottom strip** "Instant Model Launch": icon, text, a few chips and a filled CTA.

**Translation (every element backed by real data):**

| Reference element | Becomes | Data source |
|---|---|---|
| Logo + product name | interview ai mark | — |
| Nav: Dashboard / Analytics / Models / Deployment / Settings | Dashboard · New interview · Reports · History (Settings has no backing feature, so it's omitted) | existing views |
| "New Project" pill | **"New interview" pill** | `openProtected({view:'setup'})` |
| Support / Account | Account (sign out, theme, sound) | existing |
| Promo card ("Upgrade to Premium") | **"Your next best step" card**, same position and shape, showing the top roadmap item + "Practise this" | latest report `learningPlan` (no premium tier exists, so no upsell) |
| Search field | **Omitted** unless you want a client-side filter of interview history (new but trivial; your call) | — |
| Notification bell | **Omitted**: there are no notifications to show | — |
| Name + avatar | Candidate name + initials avatar | `getCurrentCandidate` |
| "Systems Overview" + subtitle with highlighted % | **"Your Practice Overview"**, "Your overall score is **+6.2** since your first interview. 3 skills improving." | `getCandidateProgress` |
| KPI 1 "Active models 24" + bars | **Interviews completed**, mini bars = interviews per week | `getSessions` |
| KPI 2 "Token usage 12.8M" + bars | **Latest overall score**, mini bars = last 8 scores | progress reports |
| KPI 3 "Project cost $2,450" + green bars | **Role readiness %**, bars = skill coverage | `readiness` |
| Delta badges | Change vs previous interview | computed |
| "Intelligence Growth" area chart + dashed line + range toggles | **"Performance Growth"**: overall score (filled curve) and a selected skill (dashed); toggles for comparison group and metric (the existing `ProgressHistory` controls, restyled) | `getCandidateProgress` |
| "Neural Activity" feed | **"Recent activity"**: interviews completed, reports ready, résumé uploaded, each with a time and link | sessions + reports + résumés |
| Glowing orb button | **The voice orb**: the same teal orb as the interview room; clicking it starts a new interview | setup |
| "View system logs" | "View full history" | history page |
| "Instant Model Launch" strip with chips | **"Quick start"**: the existing sample interview presets as chips + "Start interview" | `onStartNewInterview(sample)` |

**3D on this page:** only the orb (a small R3F sphere with a teal shader, or a pre-rendered loop on the
low tier). The reference is a flat UI with one glowing object, so the dashboard stays flat.

### Page 03: Interview setup (reference 3, Scale)

**What the reference does:**
- A dark page with a soft violet glow top-left.
- **Left: a single rounded dark panel** containing a light title, a 3-line description, two half-width
  inputs, one full-width input, a consent checkbox with fine print and a small light "Submit →" button.
- Inputs are dark fields with faint borders and placeholder labels.
- **Right: three stacked, tilted discs** with iridescent rims, floating in 3D.

**Translation:**
- **The panel holds the existing three setup stages, one at a time**, with the reference's exact
  anatomy: light title, short description, inputs in the same half and full-width rhythm, the consent
  checkbox, and a small light submit pill.

  | Stage | Title | Inputs | Submit |
  |---|---|---|---|
  | 1 | "Your profile" | Résumé drop (full width); name / target role (half + half); job description (full width) | "Continue →" |
  | 2 | "Your direction" | Level / interview type (half + half); duration and focus (full width) | "Continue →" |
  | 3 | "Your plan" | The generated rounds as rows; the **proctoring consent checkbox** (stays opt-in, unchecked by default), worded like the reference's consent line | "Enter the room →" |

- **Right: the three discs are the three stages.** They stack as in the reference. The current stage's
  disc is in front and lit with a teal-to-amber thin-film rim. Completed discs settle and glow steadily;
  upcoming ones are dim.
  - On Continue, the stack rotates the next disc forward (about 0.9s, ease-in-out).
  - The discs are real 3D (R3F, a custom thin-film shader in palette colours), with a rendered still on
    the low tier and under reduced motion.
- **Glow:** a teal glow top-left, replacing the violet one.
- **The device check** (camera and microphone test) appears inside the same panel before entering, as
  stage 3's final step.

### Page 04: Live interview room (reference 4, hologram scene)

**What the reference does:**
- A photographic, warmly lit living room at dusk. The viewer sits behind the person on a sofa.
- In front floats a **glowing holographic panel** with a person on a video call. Below it is a **row of
  smaller glowing thumbnail panels**.
- Beside the person's hand is a **particle sphere**, with **light streams** flowing from it into the
  panels.
- The palette is warm amber lamplight against cool lavender holographic light.

**Translation:**
- **Environment:**
  - A warm, dim room plate behind everything: a Blender-rendered interior with lamp light in Burnt Amber
    and soft depth of field. It is a still or a slow-parallax image (a full photoreal room in real time
    is beyond the web budget).
  - When you have opted into the camera, an option uses **your own camera feed, heavily blurred**, as
    the backdrop instead. That makes the room literally your room, as in the reference.
- **The holographic panel = the AI interviewer.**
  - The existing live 3D interviewer (`BlenderAssetScene`, with real lip sync) is rendered inside a
    floating, slightly perspective-tilted glass panel with a teal holographic rim, scanline sheen and
    bloom.
  - Lavender becomes teal.
  - The question text appears on the panel's lower edge.
- **The particle sphere = the voice visualisation**, both voices, real data:
  - While **you** speak, the sphere's particles swell and stream with the microphone level
    (`media.inputLevel`, already measured).
  - While the **interviewer** speaks, it pulses with the speech loudness envelope (already used for
    lip sync).
  - Idle, it breathes slowly.
- **The light streams:**
  - While you answer, streams flow from the sphere into the interviewer panel (your words going to the
    interviewer).
  - While it speaks, they reverse.
  - They stop when nobody is speaking.
- **The thumbnail row = the interview timeline:** one small glowing panel per question in the plan.
  Answered ones show a check and duration, the current one is lit, upcoming ones are dim. This is real
  agenda data.
- **Candidate camera preview:** a small glass panel at the top right (the reference shows the person
  from behind; we can't render you from behind, so your real preview sits where your presence is
  implied), with face-tracking status.
- **Live transcript:** under the main panel, in Ivory, typed as you speak.
- **Controls:** a bottom-centre pill bar (mic, end answer, pause, end interview), and an integrity
  warning panel (Amber, icon, label, `role="alert"`) that always sits above everything.
- **Logic is untouched:** voice, transcription, speech, vision, integrity and timing hooks stay as they
  are. The voice-room, face-tracking, proctoring and three-warning verifiers must pass unchanged.

### Page 05: Intelligence report (reference 5, assessment dashboard)

**What the reference does:**
- A dense dark analytics canvas: a thin top nav, then a title and filter row.
- **Left column:** stacked metric tiles (label, progress bar, big numeral) and a pie chart.
- **Centre:** a large **wireframe neural network in the shape of a brain**, with teal and amber nodes,
  inside a faint circular frame with an axis scale on its right edge.
- **Top right:** three **circular gauges** with numerals.
- **Right:** a **grid of coloured circles** (categories) with labels.
- **Bottom row:** a thin-bar histogram, a donut with legend, small circle stats and a text block.

**Translation (every number from `getInterviewResults` / `getInterviewDiagnostics`):**

| Reference element | Becomes |
|---|---|
| Title + filter row | "Intelligence Report · {role} · {date}" + Download/Print + "Practise again" |
| Left metric tiles with bars + big numerals | **Overall score**, **Role readiness** (score + coverage bar), **Answers assessed**, **Performance band** |
| Pie chart | **Component scores** donut (the `componentScores` dimensions) in Teal / Amber / Earth / Ivory |
| Centre wireframe brain network | **"Your thinking, mapped"**: a real-time 3D neural network in the brain silhouette (Blender-made point cloud and edges) |
| Circular gauges (130 / 613 / 163) | **Overall /100**, **Readiness %**, **Duration** (or questions answered) |
| Grid of coloured circles | **Skill bubbles**: one circle per assessed skill, filled to its score, Teal when it meets the bar, Amber for a gap, with label and verdict |
| Bottom thin-bar histogram | **Score per question**, in interview order; click a bar to open its evidence |
| Bottom donut + legend | **Strengths vs gaps** split |
| Bottom circle stats + text block | **Integrity summary** (if proctored) and the **roadmap**'s first step with "Practise this" |
| (below the fold) | Evidence ledger (question, your answer, feedback), strengths, gaps, full roadmap: the existing detailed sections, restyled |

How the centre network maps the data:
- **Nodes are your answers** (`evidence`), clustered by skill.
- Teal nodes met the bar; amber nodes fell short.
- Node size is the score.
- Edges link answers that informed the same skill.
- Hovering or focusing a node shows its question and score.

The axis scale on the right of the circle becomes the 0–100 score scale.

## 3. Component hierarchy

```
App (views unchanged: landing · auth · dashboard · setup · room · results [+ history, existing data])
├─ Landing (experience/)
│  ├─ ExperienceCanvas → TreeOfThought, Water, Fireflies, CameraRig, Effects
│  ├─ LogoPill · PillNav(→ SoundToggle) · HeroCopy · ScrollCue
│  └─ Chapter × n (roots / trunk / branches / blossoms) · InterviewerFilm chapter · FinalCTA
├─ AppShell (dashboard, results, history)
│  ├─ Sidebar: Brand · NavPill × 4 · NewInterviewPill · AccountLinks · NextStepCard
│  └─ TopBar: CandidateBadge · ThemeToggle · SoundToggle
├─ DashboardPage
│  ├─ PageTitle(highlight) · KpiTile × 3 (MiniBars, DeltaBadge)
│  ├─ GrowthChart(area + dashed, toggles) · ActivityFeed(→ VoiceOrb)
│  └─ QuickStartStrip(PresetChip…)
├─ SetupPage (full-bleed, no sidebar, as in reference 3)
│  ├─ GlowField · FormPanel(StageTitle, Field half|full, ResumeDrop, ConsentCheckbox, SubmitPill)
│  └─ StageDiscs (R3F, 3 discs, thin-film shader) · DeviceCheck (inside the panel)
├─ InterviewRoom (full-bleed, logic unchanged)
│  ├─ RoomBackdrop (render plate | blurred camera) · HoloPanel(BlenderAssetScene, QuestionCaption)
│  ├─ VoiceSphere(inputLevel, speech envelope) · LightStreams · TimelineStrip(QuestionChip…)
│  └─ CameraPreview(face status) · LiveTranscript · ControlBar · IntegrityAlert
└─ ReportPage
   ├─ ReportHeader · MetricTile × 4 · ComponentDonut
   ├─ NeuralMap (R3F) + accessible table · Gauge × 3 · SkillBubbleGrid
   ├─ QuestionHistogram · StrengthGapDonut · IntegritySummary · NextStepCard
   └─ EvidenceLedger · Strengths · Gaps · Roadmap
shared: Panel, PillButton(arrow chip), Eyebrow, KpiNumber, MiniBars, Gauge, Donut, Glow, Stage(3D + poster)
```

## 4. Animation specification

**From the references (certain):**
- **Landing:**
  - Fireflies drift with slow random walks.
  - The canopy particles shimmer (per-point sine on brightness).
  - The water ripples (a normal-map scroll) with a reflection.
  - The hero copy fades and rises on load: 600ms, 80ms stagger.
- **Dashboard:**
  - KPI numbers count up and mini bars grow on first view (existing tokens).
  - The area chart draws left to right over 900ms.
  - The orb breathes (a 3s scale and glow loop, paused when offscreen).
- **Setup:**
  - The disc stack rotates on stage change (900ms ease-in-out).
  - The panel content cross-fades (240ms).
  - Fields focus with a teal ring.
- **Room:**
  - The sphere reacts to real audio.
  - Streams flow only while someone speaks.
  - The hologram rim has a slow sheen sweep (6s).
  - Timeline chips light in sequence.
- **Report:**
  - The network assembles on load (nodes fly in by cluster, then edges draw, about 1.6s).
  - Gauges sweep to their value.
  - Histogram bars rise in order.
  - Hovering a node highlights its edges.

**From the videos (waiting):** camera paths, scroll pacing, section transitions, image reveals and
cinematic zooms for the landing's scroll story, and any page-transition style that should carry into
the app. Section 4 is finished once I've studied frames from both videos.

**Rules:**
- One motion system: the existing motion tokens, Motion for UI, GSAP for timelines and scroll, R3F
  for 3D.
- Nothing animates while you're answering except the voice visualisation.
- Under reduced motion, every loop stops, 3D becomes posters and counters show their final values
  (already enforced by tests).

## 5. 3D scene requirements

| Scene | Page | Technique | Interactivity | Fallback |
|---|---|---|---|---|
| Tree of Thought (tree, island, water, canopy, fireflies) | Landing | R3F; Blender-authored trunk/branch mesh + canopy point set; `MeshReflectorMaterial` water; instanced points with additive glow; bloom on high tier | Pointer parallax; scroll camera | Cycles-rendered hero still + short loop |
| Voice orb | Dashboard (+ Room sphere variant) | R3F sphere of points with a noise shader | Hover brightens; click starts an interview | CSS radial-gradient still |
| Stage discs | Setup | R3F: 3 cylinders, thin-film rim shader in Teal→Ivory→Amber | Rotate on stage change; slight pointer tilt | Rendered still per stage |
| Holo panel + interviewer | Room | Existing `BlenderAssetScene` inside a perspective glass frame (rim shader, scanlines) | Live lip sync (existing) | Existing poster |
| Voice sphere + light streams | Room | R3F points + tube curves with a flowing dash shader | Driven by `inputLevel` and the speech envelope | A 2D level meter (the existing `<meter>` stays for accessibility) |
| Room backdrop | Room | Cycles-rendered interior plate, or the blurred camera feed | Slow parallax | Same still |
| Neural map | Report | R3F points + line segments inside a brain-shaped point cloud (Blender); clusters from data | Hover/focus nodes; drag to orbit (bounded) | A table of the same data + rendered still |

One WebGL context per page, lazy-loaded after first paint, rendering only while visible, resolution
capped per tier, disposed on leaving. These are the shared `experience/quality.ts` tiers.

## 6. Asset requirements

| Asset | Made with | Budget |
|---|---|---|
| Tree of Thought: trunk and branches mesh, canopy point positions (about 60k), island rock | Blender (geometry nodes), exported GLB + a binary point buffer | ≤ 2.5 MB |
| Landing hero still + 6–8s loop (fallback, poster) | Cycles | ≤ 1.5 MB |
| Brain silhouette point cloud (about 20k points) | Blender (volume scatter in a brain mesh, CC0 or modelled) | ≤ 0.6 MB |
| Interview room backdrop plate (warm interior) | Blender + Cycles, 2560×1440 WebP | ≤ 0.4 MB |
| Stage disc stills (3) and neural map still | Cycles | ≤ 0.3 MB |
| Re-renders of the existing film and Instrument media in the six colours | Existing scripts | ≈ 3 MB |
| Fonts | Geist / Geist Mono (already self-hosted) | 0 |

No stock photography. The reference 4 interior is replaced by our own render or the candidate's own
camera feed.

## 7. Responsive behaviour

| Page | ≥ 1280 | 768–1279 | < 768 |
|---|---|---|---|
| Landing | As reference: copy bottom-left, nav pills top-right | Nav collapses into one pill + menu | Tree centred upper half; copy below; full-width CTAs; fewer particles |
| Dashboard | Sidebar + 3 KPIs + chart/feed side by side + strip | Sidebar becomes icons; feed drops below the chart | Bottom tab bar; KPIs swipe horizontally; chart full width; feed list; strip stacks |
| Setup | Panel left, discs right (as reference) | Panel wider; discs smaller | Discs become a small header above the panel; half-width fields stack |
| Room | Panel centre, sphere left-front, timeline below, camera top-right | Same, scaled | Interviewer panel full width; sphere becomes a ring around the mic button; timeline swipes; transcript in a sheet |
| Report | Three columns around the network (as reference) | Network on top; tiles in two columns | Network as a square; everything stacks; histogram scrolls horizontally |

Existing guarantees stay:
- 44px targets;
- the breakpoint scale;
- no horizontal page scroll;
- safe-area insets;
- an accessible text/table equivalent for every chart and 3D view.

## 8. Performance strategy

| Budget | Target |
|---|---|
| LCP | ≤ 2.0 s on every page (the landing poster or the page title is the LCP element) |
| CLS | ≤ 0.02 |
| JavaScript before 3D (per page) | ≤ 170 KB gzip |
| 3D runtime chunk (shared) | ≤ 260 KB gzip, lazy |
| 3D assets per page | Landing ≤ 4 MB; Report ≤ 1 MB; Setup and Dashboard ≤ 0.3 MB; Room unchanged plus ≤ 0.5 MB |
| Frame rate | 60 fps desktop high tier; ≥ 30 fps phone; automatic step-down |
| Room priority | Voice capture and lip sync never compete: the room's decorative 3D drops to the low tier whenever the main thread or GPU is busy |

Techniques:
- Instanced points.
- Meshopt/KTX2.
- Baked lighting.
- Render on demand where static.
- Pause offscreen and in hidden tabs.
- Shared three runtime chunk.
- Posters first.

## 9. Implementation sequence

Each step ends with screenshots compared side by side with its reference, both themes, phone and
desktop, all 332 tests and the verifiers green, and a commit you approve.

1. **Tokens: strict six colours** and the shared primitives (Panel, PillButton with arrow chip, KpiTile,
   MiniBars, Gauge, Donut, Glow, Stage). Showcase page updated.
2. **Dashboard** (reference 2) with the AppShell sidebar and top bar.
3. **Report** (reference 5): tiles, gauges, bubbles, histogram, donuts, then the neural map.
4. **Setup** (reference 3): the panel with the three stages and the stage discs.
5. **Interview room** (reference 4): backdrop, holo panel, voice sphere, streams, timeline. Logic
   untouched, all room verifiers.
6. **Landing** (reference 1 + videos): Tree of Thought hero, then the scroll story on the Phase 1
   foundation.
7. **Media re-renders** in the six colours, performance budgets, audits, real-device check.

**What I still need:**
1. The **two videos** (file paths), to finish section 4 and the landing's scroll story.
2. **Confirmation of the page mapping** in section 0.
3. Your call on the **search field** on the dashboard: omit, or a client-side history filter.
