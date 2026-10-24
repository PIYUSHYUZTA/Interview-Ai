# Phase 10 — Acceptance results (2026-10-16)

## Acceptance outcome

**Automated application acceptance passes, with speech/hardware acceptance explicitly outstanding.** This is not a claim that every live AI, physical-device or spoken-transcription criterion has been verified.

- `npm test`: **193 tests across 31 files passed** (baseline 191 + 2 new API acceptance tests).
- `npm run build`: passed (backend TypeScript).
- `npm run build:frontend`: passed (frontend TypeScript and Vite); the follow-up screen-splitting change reduced the largest JavaScript asset to about 389 KB; the bundle-size warning is resolved.
- `npm run demo`: passed; deterministic strong/partial/weak adaptive paths remain covered by the suite and demo.
- Python virtual environment: **4 real-model tests passed**, importing OpenCV, MediaPipe and NumPy and running face/pose/hand inference. MediaPipe printed runtime warnings; inference tests still passed.
- `scripts/verify-acceptance.ts`: passed actual UI registration/login, wrong-password handling, file-picker PDF/DOCX parsing, ambiguous-role clarification, optional role correction, a two-question interview, exact transcript/report correspondence, saved reports after API restart and dashboard refresh. Test-device camera/audio and simulated recognition contracts are distinguished below.
- `scripts/verify-report.ts`: passed actual report/coaching display, mobile width check, persistence and reopening from the dashboard.
- `scripts/verify-proctoring.ts`: passed actual Python sampling with a browser test camera, simulated visibility/time signals through backend warnings, duplicate/continuous incident suppression, termination, capture cleanup and answer rejection after restart.
- `scripts/verify-product-ui.ts` with `INTERVIEW_STORAGE=sqlite`: passed two interviews, saved resume reuse, overall/skill chart controls, mobile layouts, keyboard skip-link activation, reduced motion, persisted reports and reopening after restart.
- Running services: frontend http://localhost:5173 returned 200; its `/interviews/options` proxy returned deterministic mode; backend `/health` reported file persistence, deterministic evaluation and browser-dependent speech. Existing candidate data was not migrated or replaced.

## Acceptance matrix

| Area / criterion | Result and direct evidence |
| --- | --- |
| Register/login/logout | **Passed in browser UI.** Actual account form submission, logout, wrong-password rejection and successful login in `verify-acceptance.ts`. No mock auth responses. |
| Account association / protected routes | **Passed.** Auth and reliability integration suites verify cookie protection, owner-only resume/history/report access and cross-account event rejection. Browser anonymous `/interviews` returned 401. |
| Actual dashboard and refresh persistence | **Passed.** Browser returned to the dashboard, refreshed, reopened the assessment and compared saved reports after an API restart. SQLite verifier also passed. |
| PDF and DOCX upload | **Passed with real files.** Both fixtures were selected through the actual file input and extracted by the backend; PostgreSQL text and parsed skill evidence appeared in UI. Existing tests cover invalid/oversize documents. |
| Resume evidence and role detection | **Passed in deterministic/local analysis.** Existing career tests cover ML and full-stack evidence. API acceptance verifies uploaded skills/projects reach the planned session. This is local resume intelligence, not a tested external LLM analysis service. |
| Ambiguous resume | **Passed in browser.** An ambiguous summary produced a disabled continue button until a role was selected. |
| Candidate corrects direction | **Passed in browser.** Candidate selected Frontend during clarification, then optionally changed target to Data & ML; the real created plan used Data & ML Engineer. |
| Real question/session path | **Passed.** Browser questions came from `/start` and `/next-question`; answers went to `/answer`. API tests verify current-round skills, uploaded profile/project information and actual question history. No final question mocks or fixed frontend arrays. |
| Answer-driven adaptation | **Passed in engine/integration suites and deterministic demo.** Strong, partial and weak responses take different decisions; round difficulty bounds and history constraints still apply. This is deterministic-provider behavior, not verified live LLM behavior. |
| Spoken question playback | **Browser API start verified.** Native Edge speech synthesis reported five voices and emitted a playback-start event for the actual question. Physical speaker output/audibility was not tested. |
| Microphone capture | **Browser test-device capture verified.** `getUserMedia` produced audio tracks and MediaRecorder captured 728 encoded bytes in the recorded run. Input was Chromium's synthetic test device, not the user's physical microphone. |
| Actual spoken transcription | **Not verified / acceptance remains open.** No actual spoken utterance was transcribed by the browser service in this run. No server-side Whisper/STT service was configured or tested. API presence or a listening indicator alone does not count as working transcription. |
| Transcript synchronization | **Contract test passed with explicitly simulated recognition events.** Final text populated the real editable transcript, the exact submitted text appeared in the backend report, stale events from a previous question were ignored and a simulated network error preserved text fallback. This does not prove live speech recognition accuracy. |
| Text fallback | **Passed in browser.** Typed fallback answer submitted after the recognition error, progressed and appeared verbatim in the saved report. |
| Camera permission / preview | **Test-browser permission and preview verified.** Chromium granted permission to a test device; the actual video element had a live stream and nonzero video dimensions. Physical webcam hardware was not tested. |
| Visibility monitoring / thresholds | **Passed with simulated signals and clocks.** Browser visibility listeners produced actual API requests; backend policy unit/integration tests cover grace periods, duration thresholds and stale events. No desktop-wide AI-tool detection is claimed. |
| Duplicate warnings | **Passed.** Same-ID replay was marked duplicate; a new-ID continuous incident was suppressed; warning count stayed at one. |
| Warning 1 / warning 2 | **Passed in browser.** Actual backend state produced the first notice and final-warning screen. |
| Third distinct violation | **Passed.** Backend permanently marked the interview terminated; browser stopped capture, displayed termination and returned to the dashboard. |
| Answers after termination / refresh | **Passed.** Answer/progression requests returned 410; answer and results requests remained rejected after restarting the backend. No completed report was invented. |
| Camera/model failures | **Passed.** Missing Python executable and invalid JPEG input returned 503 without adding warnings. A subsequent real model inference request recovered with warning count zero. |
| Normal movement | **No automatic policy penalty.** Real model hand/pose fixtures and repeated frames run in Python tests; API hand observations kept warning count zero. Current policy does not turn gaze/gestures/ordinary movement into automatic violations. This is not a comprehensive real-world motion validation study. |
| Real report data | **Passed.** New API acceptance test compares report question/answer arrays directly to session history. |
| Deterministic scoring | **Passed.** Overall score equals `ScoringEngine.calculate(actual evaluations).overallScore * 10`; every component matches the engine. |
| Evidence-backed findings | **Passed for structured evidence links.** Strength/weakness question IDs resolve to real evaluated answers. Unassessed skills remain distinguished from demonstrated gaps. Heuristic judgments are not independently expert-validated. |
| Example answers | **Structured relevance checks pass.** Existing detailed report tests and the browser verify question-linked coaching and role-specific examples/scaffolds, explicitly labeled generated example wording. No claim of expert validation for every possible domain. |
| Actionable roadmap | **Passed for implemented contract.** Actual learning plans contain topic outcomes, ordered learning sequences, exercises and success criteria, linked to relevant answer evidence where available. |
| Persist/revisit reports | **Passed.** File and SQLite restart tests plus real browser report/history flows. |
| Console/errors | **No uncaught application page errors in passing browser runs.** Acceptance console captured the expected 401 from the intentional wrong-password test and no unexpected console errors. Reduced-motion informational warnings appeared in development. |
| Honest service states | **Passed within tested scope.** Deterministic mode is visible. Missing/invalid provider results return retryable errors without false zero scores. Speech failure leaves text fallback available. Camera-off state is real, and late camera acquisition is now canceled after completion. |

## Bug found and fixed

The new browser acceptance test reproduced a camera-cleanup race **before** the fix: if a `getUserMedia` camera request resolved after the interview completed, its tracks remained live. The verifier waited for ended tracks and failed.

`frontend/src/components/useInterviewMedia.ts` now gives camera requests a generation token. Stopping capture invalidates pending acquisition/playback; a stale returned stream is immediately stopped, stale `onended` events cannot stop a newer stream, and pending status is cleared on stop. The same regression check now passes using a real browser test-device stream delayed by the test harness.

## Test execution notes

The first proctoring browser attempt in this phase timed out waiting for its test camera. A serial rerun with reduced motion passed the camera, Python and policy checks. The harness now prints camera diagnostics and captures a screenshot on failure. This intermittent test-device startup failure is recorded rather than hidden by a success mock. The full application acceptance verifier independently passed its test-camera/audio checks.

Speech recognition events used for transcript contract tests are injected **only in the isolated test browser**, never in application code. Test-generated accounts, resumes, interview answers and reports live in `.browser-verification/*-data`, not in the candidate's production history.

## Exact Windows PowerShell commands

Start application (two terminals):

```powershell
Set-Location 'D:\AI Mock Interview Platform'
$env:INTERVIEW_PROVIDER = 'deterministic'
$env:INTERVIEW_STORAGE = 'file'
npm run start:api
```

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run dev:frontend
```

Open http://localhost:5173. Sign in, enter Workspace, review/upload a resume, confirm the role, build the plan and enter the interview room.

Run acceptance checks:

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm test
npm run build
npm run build:frontend
npm run demo
.\.venv-proctoring\Scripts\python.exe -m unittest discover -s proctoring -p test_worker.py -v
npx tsx scripts/verify-acceptance.ts
npx tsx scripts/verify-report.ts
npx tsx scripts/verify-proctoring.ts
$env:INTERVIEW_STORAGE = 'sqlite'
$env:VERIFICATION_DATA_DIR = '.browser-verification/sqlite-ui-data'
npx tsx scripts/verify-product-ui.ts
# Restore file mode before starting the normal application, if desired:
$env:INTERVIEW_STORAGE = 'file'
Remove-Item Env:VERIFICATION_DATA_DIR -ErrorAction SilentlyContinue
```

Browser scripts use installed Edge and bundled Playwright. `BROWSER_EXECUTABLE` / `PLAYWRIGHT_MODULE_PATH` can override those machine-specific paths. Run media verifiers serially. SQLite needs the compatible Node runtime documented in `ARCHITECTURE_RELIABILITY.md`; real CV tests require the configured Python environment and bundled model files.

## Outstanding manual acceptance

1. On the intended submission machine, explicitly allow its physical webcam/microphone. Verify real preview, real microphone input, mute/unmute, denial handling, disconnect behavior and cleanup after completion/termination.
2. Use a browser with an available recognition service. Speak an actual answer, verify the resulting transcript, correct it and submit. Confirm the report contains those exact words and the next question is synchronized. If recognition is unavailable, text fallback is verified, but the voice criterion stays unaccepted.
3. Confirm spoken questions are audible on physical speakers/headphones. Automated native TTS start is verified; audibility is not.
4. If presenting external LLM-powered functionality, configure a real provider explicitly and run a separate live evaluation acceptance test. Current acceptance is deterministic heuristic mode.

The bundle-size warning was resolved in the follow-up. The inability to resume unfinished interviews remains a documented limitation. Neither prevents the verified text interview/report journey.

## Files changed in this phase

- `frontend/src/components/useInterviewMedia.ts`: focused camera acquisition/cleanup race fix.
- `src/api/acceptance.integration.test.ts`: actual report/scoring/evidence consistency and neutral treatment/recovery of vision failures.
- `scripts/verify-acceptance.ts`: actual auth/file upload/role/interview/report browser acceptance; native speech probes; clearly labeled simulated recognition and delayed-media regression tests.
- `scripts/verify-proctoring.ts`: duplicate/continuous suppression, terminated-answer rejection after restart, reduced-motion stability and camera-failure diagnostics.
- `ACCEPTANCE.md`: verified acceptance matrix, limitations and reproducible commands.


## Follow-up: device readiness and bundle repair

Implemented after the candidate asked to resolve the remaining verification gaps:

- `App.tsx` now loads candidate screens on demand using React lazy/Suspense. The largest production JavaScript asset decreased from about 506.5 KB to about 389 KB. The warning threshold was not raised. `ScreenBoundary.tsx` shows recovery controls if a screen module fails to load.
- `DeviceCheck.tsx` adds an **optional** pre-interview camera/microphone/sound check in the existing interview room. It requests real browser permissions only after a click, displays local microphone signal level, offers native spoken playback with a separate candidate confirmation, and allows an actual spoken transcription attempt. No simulated transcript or automatic audibility confirmation is shipped in the product.
- Microphone-level testing does not require the browser recognition service to work. The level meter does not record or upload audio. The candidate is told that recognition may use the browser vendor’s service.
- Test audio and pending requests are stopped on closing the check or starting the interview. Camera preview uses the existing room camera controls. Late permission completions are canceled safely.
- `useInterviewMedia.ts` now handles a recognition service that never starts (12-second startup timeout) and playback that never starts (10-second startup timeout), preserving the editable transcript and text fallback.
- Vision UI explicitly distinguishes face/hand observations from facial identity login, emotional inference and determining who a candidate is talking to. No unsupported feature is presented as implemented.

**New verification:** `verify-acceptance.ts` passes against built production assets, not just Vite development source. It checks optional microphone capture/stop, simulated permission denial, delayed preflight-permission cleanup, recognition/playback startup timeouts and recovery from an intentionally blocked screen chunk. Native browser TTS still emitted a playback-start event. The proctoring verifier passes with real Python inference and browser test-device video.

**Read-only physical-device probe:** `npx tsx scripts/probe-device-capabilities.ts` found one visible camera input and one microphone input, secure-context media capture and browser recognition/playback APIs. It did not grant permissions, capture the user's media, expose device names/IDs, verify audible output or produce an actual spoken transcript. Physical confirmation is available through the device check; a human response is still required to verify the user's voice and speaker output.

**Other checks:** 193 tests across 31 files, four Python model tests, backend build and deterministic demo passed again. The frontend build passed with no bundle-size warning. Frontend lint exits 0 with 32 advisory React/compiler/hook warnings; no warnings were reported for the new DeviceCheck or ScreenBoundary files. These lint advisories are not represented as a zero-warning lint result.

Production browser verification command:

```powershell
npm run build:frontend
$env:VERIFY_PRODUCTION = 'true'
npx tsx scripts/verify-acceptance.ts
Remove-Item Env:VERIFY_PRODUCTION -ErrorAction SilentlyContinue
```

To use the physical checks: sign in, prepare an interview, enter the room, expand **Optional camera, microphone and sound check**, allow the requested permissions, check the camera preview and microphone level, play the sentence and confirm whether you heard it, then speak during **Test spoken transcription**. A live microphone indicator alone is not a recognition pass. Close the check or start the interview to stop its test audio stream.

Changed/added follow-up files: `frontend/src/App.tsx`, `frontend/src/components/ScreenBoundary.tsx`, `DeviceCheck.tsx`, `InterviewRoom.tsx`, `useInterviewMedia.ts`, `frontend/src/candidate-product.css`, `scripts/verify-acceptance.ts`, `scripts/probe-device-capabilities.ts`, and this acceptance record.

Latest follow-up verification: the production device check also passed its 390px mobile-width check and emitted a native test-sentence playback event. The candidate audibility checkbox stayed unchecked in automation. Final actual local frontend/API smoke checks returned HTTP 200/healthy deterministic mode. See `.browser-verification/acceptance-media-observations.json` for the most recent detailed probe results.
