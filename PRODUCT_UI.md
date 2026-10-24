# Phase 8 — Candidate product UI

## Scope
Candidate workspace styling is in `frontend/src/candidate-product.css`, loaded after the existing product styles. It extends existing React components and the installed UI/motion components. No dependency, backend, scoring, storage or landing-page redesign was added.

- Deep navy surfaces, blue/cyan accents, quiet gradients, consistent card/control radii and spacing.
- More legible form, question, report and evidence typography; larger controls and clearer disabled/error/loading states.
- Resume upload/drop-target and processing-state styling, clearer session progress and camera controls.
- Accessible overall/per-skill progress measure selector backed exclusively by saved assessed scores. The chart has scale/grid/date labels; exact values remain in dated report rows and report links. Missing skill evidence is omitted, not plotted as zero. Fewer than two observations show an honest empty state.
- First-warning and final-warning styling uses backend warning state; termination remains backend-authoritative.
- Visible keyboard focus, main-content skip link, native form controls/disclosures, reduced-motion rules and forced-colors borders. This is not a claim of a complete WCAG audit.
- Responsive candidate layouts with desktop/mobile browser coverage.
- Corrected the current question's difficulty denominator to the public API's 1–10 scale. Reports retain the engine's separate 1–5 question-history scale.

## Changed files
- `frontend/src/candidate-product.css`: workspace visual system, responsive layout and accessibility styles.
- `frontend/src/main.tsx`: load candidate styles.
- `frontend/src/App.tsx`: main landmark target and skip link.
- `frontend/src/components/ProgressHistory.tsx`: saved-result chart presentation and overall/skill measure control.
- `frontend/src/components/InterviewRoom.tsx`: warning hierarchy and accurate difficulty scale label.
- `scripts/verify-product-ui.ts`: real browser candidate journey, responsive/keyboard/reduced-motion/chart checks and screenshots.
- `scripts/verify-proctoring.ts`: capture/assert actual warning UI and explicitly enable browser test-media permission.

## Verification
- `npm test`: 185 tests across 29 files passed.
- `npm run build`: passed.
- `npm run build:frontend`: passed; existing bundle-size warning remains (~506 KB JavaScript before gzip).
- `npx tsx scripts/verify-product-ui.ts`: passed two completed deterministic-provider browser interviews, saved-profile reuse, chart measure controls, desktop/mobile setup/room/dashboard/report checks, skip-link activation, reduced motion, report reopening after API restart and no page errors.
- `npx tsx scripts/verify-proctoring.ts`: passed browser test-camera capture and real Python inference, simulated tab/time signals through backend warning 1/final warning/termination, capture cleanup and rejection of further progression. This is not physical-camera testing or proof of desktop-wide monitoring.

Screenshots are in `.browser-verification/phase8-*.png`. No results or functionality are fabricated for presentation. Live external LLM and real microphone transcription were not tested in this phase.

## Run
From `D:\AI Mock Interview Platform`, run `$env:INTERVIEW_PROVIDER='deterministic'; npm run start:api` in PowerShell, and `npm run dev:frontend` in another terminal. Open `http://localhost:5173`, sign in and enter Workspace. The existing Vite server reflects these frontend changes through hot reload.

Follow-up: the bundle warning noted above was subsequently resolved with screen-level code splitting (largest production JavaScript asset about 389 KB). Optional physical-device checks, startup-timeout recovery and production-asset browser verification were added. See `ACCEPTANCE.md` for current results and remaining physical/live-service acceptance limits.
