# Proctoring acceptance tests

Scope: anonymous face presence/readiness and approximate landmark tracking.
Identity enrollment and face matching are **not implemented**. Readiness success
always returns `identityVerified: false`. Gaze is an uncalibrated geometric
estimate, not proof of cheating.

## Latest executed results

- Application suite: **234 passed, 0 failed**. Machine-readable report:
  `.browser-verification/proctoring-acceptance-tests.json`.
- Python suite: **38 passed** (synthetic/mocked unit cases plus real-model fixture cases).
- Backend build, frontend build, deterministic demo: passed.
- Frontend lint: exit 0; existing unrelated warnings remain.
- Browser proctoring with face, hand and freshness flags: passed real Python
  inference/delivery, tracking recovery, warning 1/final/termination, resource
  cleanup, API restart, workspace page reload and rejection of restarting the
  terminated session. Camera video and visibility/focus/clock inputs were controlled.
- Production-built voice-room browser test: passed native TTS, actual API adaptive
  progression and completed assessment, fullscreen, stopped media and cleanup.
  Test-device media and injected speech-recognition callbacks were used.
- Physical-camera validation: **not performed**. No live gaze accuracy, biometric
  recognition or live speech-transcription claim follows from these results.

### Definition-of-done audit

The final focused rerun passed 13 API/Python integration tests across five files.
`pip check` found no broken requirements; the model installer verified all three
installed model digests without downloading replacements.
The final full rerun again passed 234 application tests and both builds; its JSON
report is `.browser-verification/proctoring-final-tests.json`. Python was rerun
with 38 passing tests.

The documented stalled-request/portrait-camera browser regression initially failed
an outdated harness assertion: it required Active even when the real analyzer
returned no face for the tall fixture. The UI correctly withheld Active. The
harness now verifies the encoded frame's longest edge is at most 640, respects
unavailable/lost status, restores the ordinary portrait, and requires real backend
face-present recovery before expecting Active. The rerun passed, including request
timeout/retry, zero visual penalties, policy warnings/termination, cleanup, API
restart, workspace reload and rejection of a terminated restart.

This audit changed the browser harness and documentation; no additional production
rewrite was needed. The root causes and implementation repairs are recorded under
“Diagnosis and fixes” in README.md. Full automated verification does not close the
physical-camera acceptance gap or add biometric identity verification.

## Evidence categories

| Category | Real components | Controlled inputs | What it proves |
| --- | --- | --- | --- |
| Unit | Application rules, geometry, smoothing, events | Synthetic landmarks/observations/clocks; mocked factories/processes for cleanup/failure | Deterministic rules and lifecycle |
| Python fixture integration | Installed MediaPipe/OpenCV models and JPEG inference | Portrait, blank, hand and composed/translated images | Model loading and tracking on these fixtures |
| HTTP integration | API, session engine, auth, persistence | Deterministic interview provider; explicitly mocked fault/race cases | Delivery, isolation, enforcement |
| Browser integration | React, API, Python, media lifecycle, native fullscreen | Test devices, canvas fixture video, injected visibility/focus/clocks | Transport, UI, policy and cleanup |
| Physical-camera validation | Actual person/camera/browser/lighting | Manual scenarios | Not performed by this automated run |

Python is a JSON-lines child process of Node, not a separate HTTP service. Tests
use no external interview LLM. No fixture test proves physical camera accuracy.

## Requirement-to-test map

Paths are relative to the project root.

| Requirement | Coverage and evidence source |
| --- | --- |
| Face detection/transitions | `proctoring/test_worker.py::RealModelTests`: actual models on JPEG fixtures; `test_events.py`: synthetic transitions |
| Readiness success/failure | `src/api/FaceReadiness.test.ts`: synthetic observations; `faceReadiness.integration.test.ts`: real face/blank inference, expiry, forged-start rejection, ownership; consent-race case mocks inference |
| Face loss/recovery | Real fixture inference in `test_worker.py`; browser `VERIFY_FIXTURE_FACE=true` switches portrait/blank video |
| Multiple faces | Real composed two-face JPEG inference; `test_events.py` checks synthetic event/recovery/repeated incident IDs |
| Gaze/head thresholds/smoothing | `test_direction.py`: synthetic geometry, boundary values, four directions, blinks, quality failures, spikes, track changes and gaps |
| Hand/pose failures/recovery | `test_movement.py`: synthetic invalid/low-visibility landmarks; `test_worker.py`: actual missing optional assets and disabled-module allocation |
| Confidence boundaries | `VisionEvent.test.ts`: null, .6999, .7, 1 and freshness edges; `test_movement.py`: low pose visibility; no invented detector probability |
| Debounce/duplicates/cooldowns | `test_events.py`, `visionEvents.integration.test.ts`, `server.test.ts`, integrity state-machine tests: controlled clocks/incidents |
| Warning 1/final/termination | `fairIntegrity.integration.test.ts`: actual state transitions, save rollback, concurrent third event; browser checks warning UI |
| Technical failure neutrality | `acceptance.integration.test.ts`, `visionEvents.integration.test.ts`, `proctoring.integration.test.ts`: invalid frames and injected failures; browser camera/connection context events |
| Delivery/ownership | `visionLifecycle.integration.test.ts`, `visionEvents.integration.test.ts`, `faceReadiness.integration.test.ts`: HTTP auth/token/session checks, real Python fixtures and separately mocked races |
| Persistence across restart/refresh | `scripts/verify-proctoring.ts`: restart file-backed API, reject late answers/results, return to workspace, reload page, reject starting terminated session |
| Completion/termination cleanup | `visionLifecycle.integration.test.ts`: actual completion with pending mocked inference; `ProctoringWorker.test.ts`: mocked process cleanup/idle; `test_worker.py::MockModelLifecycleTests`: context cleanup/partial startup failure; browser scripts: stopped tracks/no more frames |

`RealModelTests` also allocates actual models for frame validation/initialization
cases. `MockModelLifecycleTests` is separate and proves no detection claim. Mixed
HTTP files name and implement their fault/race mocks separately from real fixtures.

## Repeat checks in Windows PowerShell

Run from `D:\AI Mock Interview Platform`, with dependencies/models installed as
described in README.md. Run heavy browser checks sequentially.

```powershell
.\.venv-proctoring\Scripts\python.exe -m unittest discover -s proctoring -p 'test_*.py'
npx vitest run --maxWorkers=1 --minWorkers=1 --reporter=json --outputFile=.browser-verification/proctoring-acceptance-tests.json
npm run build
npm run build:frontend

$env:VERIFY_FIXTURE_FACE='true'
$env:VERIFY_FIXTURE_HANDS='true'
$env:VERIFY_TRACKING_FRESHNESS='true'
npx tsx scripts/verify-proctoring.ts

$env:VERIFY_PRODUCTION='true'
npx tsx scripts/verify-voice-room.ts
```

Browser scripts start isolated API/frontend instances and test accounts. They use
the bundled Playwright runtime and installed Edge; override `PLAYWRIGHT_MODULE_PATH`
or `BROWSER_EXECUTABLE` when paths differ. The voice-room check uses native TTS but
injected recognition callbacks; it does not validate live speech transcription.

## Physical-camera acceptance still required

Start `npm run start:api` and `npm run dev:frontend` in separate terminals. Use the
candidate account/resume flow, consent to monitoring and enable the actual camera.

1. Check a well-lit single face, poor lighting/distance, brief loss/recovery and two
   visible people. Compare backend-confirmed status with the actual scene.
2. Check gentle head/gaze direction changes, glasses where applicable, hand entry/
   exit and posture changes. Ordinary motion must not add misconduct warnings.
3. Disconnect the camera; confirm unavailability, not a cheating accusation.
4. After the 30-second grace period, hide the interview tab for at least five
   seconds. Restore stable visibility and allow the 15-second cooldown before a new
   distinct incident. Verify warning 1, final warning, then termination. One
   continuous hidden incident must count once.
5. Check device indicators turn off after completion/termination. Refresh and
   confirm the terminated session cannot accept more answers.

Record browser/device/lighting, expected/observed outcomes and diagnostic event IDs.
Do not store raw face images, audio, biometric templates or secrets in test logs.
