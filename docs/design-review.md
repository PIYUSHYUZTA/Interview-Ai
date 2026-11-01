# Independent design review: implementation against the references

Reviewed: branch `design-system-steps-2-5` at `3fdee1c`. Evidence: fresh browser captures from the verifiers in
`.browser-verification/` (1440 and 390 wide, dark and light), the references in `docs/references/`, and a
production build.

Severity:
- **P1** breaks reference fidelity or reads as cheap;
- **P2** a visible mismatch;
- **P3** polish.

## 0. Two limits on this review

1. **No reference videos exist.** You confirmed on 31 October that there are none. Camera movement, scroll
   interaction and transitions are therefore judged against the written brief and the image references only, not
   against a motion reference.
2. **The ordinal mapping contradicts itself.** Your mapping says dashboard = "second-last", room = "last" and
   report = "sixth". With six images (`1.webp` is a screenshot of your old landing; 2–6 are references), "last"
   and "sixth" are the same image, and "second-last" is the hologram scene, not the dashboard. I reviewed by
   content, as you confirmed during implementation:
   - mindhyve → landing;
   - Synexis → dashboard;
   - Scale → setup;
   - hologram scene → room;
   - assessment dashboard → report.

## 1. Landing (reference 01, mindhyve)

**Verdict.** The composition matches: logo pill, pill navigation, copy bottom left, scroll cue bottom right, a
luminous tree on water. The 3D craft does not: the tree, forest and island read as procedural primitives, which
the brief explicitly forbids ("cheap-looking models").

| # | Sev | Mismatch | Where | Correction |
|---|---|---|---|---|
| L1 | P1 | **Tree is built from straight instanced cylinders.** The trunk visibly kinks segment to segment, and the branches are uniform tubes. The reference tree is organic, gnarled and tapered, with a root flare into the water. | `frontend/src/experience/TreeWorld.tsx:20` (`growTree`), `:66–77` (instanced cylinders) | Author the tree in Blender: a geometry-nodes trunk with continuous taper and bark, roots flowing into the water, exported as one GLB (≤ 1.5 MB, meshopt). Sample canopy points from a leaf-volume mesh in the same script and export them as a binary buffer, instead of the ellipsoid clusters at `:96–102`. |
| L2 | P1 | **The forest is flat cones.** It reads as low-poly paper triangles. The reference has layered foliage silhouettes with depth, light shafts and colour variation. | `TreeWorld.tsx:170–183` (`Forest`, `coneGeometry`) | Replace it with 3–4 depth layers of Cycles-rendered forest silhouettes (alpha WebP planes) placed at 18/26/34 m. Each layer gets slight parallax in the camera rig. Keep a few instanced foliage clumps (Blender GLB) near the island for foreground depth. |
| L3 | P1 | **The island is a squashed sphere**, reading as a lily pad or plate. The reference has a rock islet with moss and roots. | `TreeWorld.tsx:199` | Model a low rock with a moss cap in the same Blender tree script. Bake its lighting. |
| L4 | P2 | **The water is a flat translucent plane.** The reflection is a mirrored copy with no ripples or Fresnel falloff, so the mirror image looks like a ghost rather than a reflection. | `TreeWorld.tsx:202` (mirrored tree), `:208` (water material) | Keep the mirrored tree (it's cheap and correct). Add a water shader with a scrolling normal map that distorts what's beneath, plus Fresnel: opacity rising toward grazing angles and fading the reflection with depth. |
| L5 | P2 | **No light shaft.** The reference's top-left moonbeam is a key element of its mood; ours is only a faint dome highlight. | `TreeWorld.tsx:186` (`Sky`) | Add a volumetric-looking cone (additive gradient shader, depth-faded) from the moon direction through the canopy. Bloom handles the rest. |
| L6 | P2 | **The hero headline is oversized and light** (104 px, weight 300) and dominates the frame. The reference headline is about 60–70 px, regular weight, about 40% of the width. | `frontend/src/experience/landing.css:46` (`.lx-display`) | `font-size: clamp(44px, 4.8vw, 76px); font-weight: 400; line-height: 1.02;` for the hero only. Keep the larger size for the closing "Walk in prepared." |
| L7 | P2 | **Chapters 01–06 share one layout pattern:** a text block with a radial scrim, alternating left and right over the 3D view. This is the "generic page with 3D behind it" pattern the brief warns against. The section-exit fade is identical everywhere. | `Landing.tsx:68` (one exit tween for all chapters), `landing.css:54` (`.lx-copy` scrim) | Give each chapter its own device: <ul><li>**How it works:** labels anchored to the tree in 3D (drei `Html`), with "Résumé" at the roots, "Conversation" on the trunk and "Report" in the canopy, replacing the side list.</li><li>**Questions:** the answer and follow-up typed along the lit branch.</li><li>**Performance:** a full-bleed number moment.</li><li>**Improvement:** horizontal steps riding the light path.</li></ul> Vary the exit transitions: mask wipe, blur-out and scale-through. |
| L8 | P2 | **Every chapter has the same camera rhythm:** linear progress, hold 70%, travel 30%, constant field of view. Nothing feels "cinematic" in the camera itself. | `frontend/src/experience/ExperienceCanvas.tsx:35` | Give each shot its own ease and field-of-view key (for example a dolly-zoom from 40° to 28° on "live"), and a slight roll on travel. Ease the travel segment with `power2.inOut` instead of linear. |
| L9 | P2 | **The performance shot frames the canopy oddly** from above. The evidence colours (teal and amber) barely read at this distance. | `frontend/src/experience/chapters.ts:23`, `TreeWorld.tsx` (`evidence` uniform) | Move closer and lower (about 4 m from the canopy, eye level with the crown). Raise the point size when `evidence > 0` so the two colours separate clearly. |
| L10 | P3 | **The sound toggle is a text pill** ("Sound off"). The reference uses a round icon button next to the nav. | `Landing.tsx:99`, `landing.css` (`.lx-nav-end`) | Hide `.ds-sound-text` at every width on the landing. Make the button a 44 px circle. |
| L11 | P3 | **Portrait framing is a generic pull-back.** On phones the tree sits small, behind the copy. | `ExperienceCanvas.tsx:41` | Author portrait camera keys per shot (a second `keys` set in `chapters.ts`) instead of scaling the landscape ones. |
| L12 | P2 perf | **Per-frame work while off-screen:** <ul><li>The branch colour loop runs every frame for both the tree and its mirror, even when chapter 3 isn't visible.</li><li>The canopy is about 12,000 points, drawn twice (tree and mirror).</li></ul> | `TreeWorld.tsx:59–66` (`useFrame` in `Tree`), `:96` (12,000 points) | Skip the colour loop when `near(3) === 0` (and skip it for the mirror entirely, sharing one colour buffer). Use about 8,000 points on desktop. |

## 2. Dashboard (reference 02, Synexis)

**Verdict.** This is the closest of the five pages: the sidebar, three stat tiles, chart beside activity, orb and
quick-start strip are all in reference order. The mismatches are proportion and density.

| # | Sev | Mismatch | Where | Correction |
|---|---|---|---|---|
| D1 | P2 | **The candidate profile is a card in the title row.** The reference shows name, role and avatar compactly in the top bar, top right. The card pushes the stat tiles down. | `frontend/src/components/Dashboard.tsx:77`, `workspace.css:44` | Move it into the top bar in `App.tsx` (beside Sign out) as avatar, name and target role. Remove the card. The title row becomes title plus subtitle only, as in the reference. |
| D2 | P2 | **The page title is 40 px light** (landing style). The reference title is compact (about 22 px semibold) so the data leads. | `workspace.css:43` | `font-size: 24px; font-weight: 600;` Keep the amber kicker. Landing-style display type belongs on the landing, not in the workspace. |
| D3 | P2 | **Stat-tile bars are sparse.** With three interviews there are three wide bars and empty space. The reference has 8–9 even bars across the tile. | `Dashboard.tsx:87–95` (`bars=`), `workspace.css:68` | Always render 8 slots: real values right-aligned, empty slots as faint stubs labelled "no data". This keeps the reference rhythm without inventing values. |
| D4 | P3 | **The growth chart is shorter than the reference's and has no time-range control.** The reference has 1D/7D/30D pills. | `ProgressHistory.tsx` (`H = 220`) | Increase `H` to 260. Add a "Last 5 / 10 / All" pill group filtering saved assessments (real data, no invented time ranges). |
| D5 | P3 | **The page continues well below the first screen.** The reference is one screen. | `Dashboard.tsx` (`ws-below`) | Keep the content, but move interview history behind a "View full history" link (it's already linked from the feed) so the dashboard ends after the insights row. |

## 3. Interview setup (reference 03, Scale)

**Verdict.** The anatomy is right: one dark panel, discs on the right, small light submit, teal glow top left.
The proportions are off, and stage 1 still behaves like a long form.

| # | Sev | Mismatch | Where | Correction |
|---|---|---|---|---|
| S1 | P1 | **The stage-1 panel is very long** (extracted profile, internships, evidence lists), so it reads as a form. The reference panel is short and fits one screen. | `frontend/src/components/ResumeUploadView.tsx` (stage 1 `profile-preview`) | After analysis, show the profile as chips (skills, roles, years) with a single "Review extracted details" disclosure holding the full lists. The panel then fits about 900 px. |
| S2 | P2 | **Discs intersect messily at stage 2.** The forward disc slices through its neighbours and leaves jagged occlusion edges. | `frontend/src/components/SetupDiscs.tsx:36` (z = .5), `:45` (vertical spacing .95) | Space the discs at 1.15 and move the current disc to z = .9 so it clears its neighbours. Add a soft teal haze sprite behind the stack to match the reference's glow. |
| S3 | P2 | **Inputs are 48 px tall with heavy weight.** The reference uses compact, quiet fields (about 36 px, 13 px text, light placeholder). | `candidate-product.css:45` (shared input), `setup.css` (`.su-panel :is(input…)`) | Within `.su-panel`: `min-height: 40px; font-size: 13px; font-weight: 400;` placeholder in `--text-muted`. Keep the 44 px touch target on phones. |
| S4 | P3 | **The workspace sidebar is present.** The reference is a focused page with no navigation. | `App.tsx` (setup is inside `app-shell`) | Optional: a focused mode that hides the sidebar on setup only, with a back link. I kept the sidebar for navigation consistency; this is your call. |

## 4. Live interview room (reference 04, hologram scene)

**Verdict.** The concept translated well: a floating glowing panel, a particle sphere with streams, a timeline row
and a warm room. But the page is dominated by application chrome, so it reads as an app screen with a backdrop
rather than an immersive scene.

| # | Sev | Mismatch | Where | Correction |
|---|---|---|---|---|
| R1 | P1 | **Status is shown three times:** the new state badge, the old status pill ("AI Speaking - Interviewer is speaking") and the connection line. That's visual noise right under the interviewer. | `InterviewRoom.tsx:710` (old `Status` pill and `avatar-connection` paragraph inside `.room-holo`) | Keep the new badge as the visible indicator. Make the old pill visually hidden (`ds-visually-hidden`) but keep it in the DOM, because it carries `role="status"` and the checks read it. Move the connection line into the "Technical details" disclosure. |
| R2 | P1 | **The right column is a full monitoring panel** (camera box, two buttons, status table, guides toggle) that competes with the interviewer. In the reference the candidate is implied and the scene is uncluttered. | `room.css:51` (`.voice-candidate`), `InterviewRoom.tsx` (aside) | Collapse the aside into a floating picture-in-picture camera (16:9, top right), with camera and microphone toggles as icon buttons on it. Move the monitoring table into a "Monitoring" disclosure. Keep every control and label, since the checks use them. |
| R3 | P2 | **The panel barely floats.** It's tilted only `rotateY(-3deg)`, while the reference panel is strongly angled with depth. | `room.css:25` | `transform: perspective(1400px) rotateY(-9deg) rotateX(2deg);` plus a soft drop shadow offset to the left. Remove the tilt on phones (already done). |
| R4 | P2 | **The voice sphere is small and sits low left.** The reference sphere is a prominent object beside the subject, with bright streams into the panel. | `room.css:38` (`.room-voice`), `RoomVoiceSphere.tsx` (`position={[-1.6…]}`, tube radius `.012`) | Enlarge the canvas to about 56% of the panel width, centre the sphere vertically on the panel's left edge, raise the stream radius to `.02` and boost brightness while someone is speaking. |
| R5 | P2 | **The backdrop is almost invisible**, covered by the panel, aside and console. The warm-room atmosphere, the reference's main contrast, is lost. | `room.css` (`.room-backdrop` scrim), layout | Once R2 frees the right side, lower the scrim from 62% to 45%, and let the room show above and to the right of the panel. |
| R6 | P3 | **The toolbar is a bordered box.** The reference has no chrome bar. | `room.css` (`.immersive-toolbar`) | Make it borderless and transparent, with smaller text. "Exit interview" stays visible. |

## 5. Intelligence report (reference 05, assessment dashboard)

**Verdict.** The data composition is faithful: metric column, central network, gauges, skill circles, histogram
and donuts. The reference is denser and tighter. Ours stretches vertically, and the brain doesn't read as a brain
at a glance.

| # | Sev | Mismatch | Where | Correction |
|---|---|---|---|---|
| P1 | P1 | **The map panel stretches to the full height of the left column** (about 1000 px), leaving empty space above the network. The reference grid is one compact band. | `report.css:20` (`.rp-grid`), `:48` (`.rp-map-stage`) | Set a fixed row height for the canvas band (`grid-template-rows: 560px`). Make the left column scroll-free by shrinking the metric tiles (P3), and move the component donut into the bottom row. |
| P2 | P2 | **The brain silhouette reads as an ellipse**, with no visible hemispheres, central fissure, cerebellum or stem emphasis. The reference's brain is immediately recognisable. | `ReportNeuralMap.tsx:33` (`brainCloud`), `:61` (1,400 / 700 points) | Sample points from a Blender brain mesh (CC0, or modelled) exported as a binary point buffer, about 3,000 points on desktop. Keep the data nodes as they are. |
| P3 | P2 | **Metric tiles are large** (28 px numerals, generous padding). The reference tiles are compact (about 20 px numerals, thin bars). | `report.css:23` (`.rp-metric strong`) | `font-size: 22px`, padding `12px 16px`, gap 8 px. |
| P4 | P2 | **Below the canvas, the old card styles return.** For example `.report-metadata` boxes render as mint-tinted blocks (visible in the print preview), out of keeping with the panels above. | `candidate-product.css:125–126` | Restyle `.rp-page .report-metadata > div` in `report.css` as hairline panels on `--bg-surface`. Check light theme and print. |
| P5 | P3 | **Skill circles show many dashed "Unverified" bubbles**, which outnumber the real ones in demo data. | `ReportAnalytics.tsx` (`rp-bubbles`) | Show assessed skills first, with unverified skills as a single "+N not assessed" chip that expands. |

## 6. Cross-cutting

| # | Sev | Finding | Where | Correction |
|---|---|---|---|---|
| X1 | P2 | **Page titles have no shared scale:** landing 104/300, dashboard 40/300, setup 32/400, report 28/650, room 28/500. | `landing.css:46`, `workspace.css:43`, `setup.css`, `report.css`, `room.css` | Add `--title-page` and `--title-display` tokens to `tokens.css` and use them on all five pages. |
| X2 | P2 perf | **All page styles ship in one 214 KB stylesheet (36 KB gzip), even on the landing**: workspace, report, setup and room CSS are imported in `main.tsx`. | `frontend/src/main.tsx:13–16` | Import each page's stylesheet from its lazy screen component (as `LandingPage.tsx` already does with `landing.css`). The landing then loads only its own CSS. |
| X3 | info perf | **3D runtime cost (production build, gzip):** <ul><li>three core 97 KB</li><li>three module 85 KB</li><li>React Three Fiber 54 KB</li><li>landing scene 26 KB</li></ul> That's about 262 KB, right at the 260 KB budget. The app entry is 119 KB, within its 170 KB budget. | build | No action needed. Avoid adding drei helpers to the landing chunk (they pull in large modules). |
| X4 | info | **Frame rate was measured only in headless Edge**, which isn't representative. | — | Check on a real mid-range laptop and phone before calling the landing finished. |

## 7. Recommended order

1. **Room R1–R2:** they remove clutter, need no new assets, and carry low risk because labels stay.
2. **Report P1, P3, P4:** CSS only.
3. **Dashboard D1–D3.**
4. **Setup S1–S3.**
5. **Landing L6, L7, L8, L10, L12:** code only.
6. **Landing L1–L5 and Report P2:** the Blender asset work (tree, rock, forest layers, brain mesh). This is the biggest step and the one that moves the landing from "procedural" to "award-quality".
7. **Cross-cutting X1 and X2.**
