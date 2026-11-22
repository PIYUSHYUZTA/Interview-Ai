# Camera vision service — delivery report (26 October 2026)

Python face, eye, hand and phone analysis for the interview room, the event engine and the three-warning
policy. Details of each part are in [proctoring/README.md](proctoring/README.md); this page is the summary.

## 1. Root cause of the original failure ("face detection is not working")

Four faults together meant no face results reached the interview room:

1. **Monitoring consent was off by default and not explained.** With the consent box unticked the browser
   (correctly) sends no frames, so Python never ran and no face, eye or hand data existed. The room now says
   plainly that tracking runs only with consent; consent is still never ticked for the candidate.
2. **The API found the Python worker and models relative to its working directory.** Started from any other
   folder, every frame failed with `WORKER_STOPPED`. Paths are now resolved from the project.
3. **It silently used the wrong Python.** With no project environment it fell back to the system Python 3.14,
   which cannot install the pinned NumPy/MediaPipe, and the worker's error output was thrown away, so the
   failure was invisible. A dedicated `.venv-proctoring` (Python 3.13) is now set up by one command, the
   interpreter choice is explicit, and failures are logged with the fix.
4. **Frames were sampled once every two seconds**, too slow to look like live tracking. Now about 1.8 analysed
   frames per second.

Later testing found and fixed further real defects, e.g. head **pitch had the wrong sign** (looking down was
labelled "head tilted up"), the monitoring panel flickered to "Unavailable" during live sampling, one bad frame
could stop the interview, two interviews at once failed each other's frames, and an **API restart** cut off
every running interview's monitoring.

## 2. Python and environment

- **Python:** CPython **3.13.17** (64-bit, Windows), managed by uv. Supported range 3.10–3.13; 3.14 is not
  supported (the pinned NumPy 2.2.6 has no 3.14 wheel).
- **Virtual environment:** `.venv-proctoring` in the project root. The API uses it automatically
  (`PROCTORING_PYTHON` overrides; the system Python is only a logged last resort).
- **GPU:** the RTX 4060 is not used: MediaPipe's official Windows build has no GPU support. Everything runs on
  the CPU; `PROCTORING_ACCELERATION=auto` would use a GPU on a MediaPipe build that has one.

## 3. Pinned requirements

- `requirements-proctoring.txt` — top level: `mediapipe==0.10.35`, `opencv-contrib-python==4.12.0.88`,
  `numpy==2.2.6` (exactly one OpenCV distribution).
- `requirements-proctoring.lock.txt` — **all 20 runtime packages pinned** (this is what gets installed).
- `requirements-proctoring-dev.txt` — the lock plus pytest for the Python tests.
- Models (official Google MediaPipe storage, SHA-256 pinned in `scripts/install-proctoring-models.ps1`):
  `face_landmarker.task`, `pose_landmarker_lite.task`, `hand_landmarker.task`, `efficientdet_lite0.tflite`.

## 4. Installation commands (Windows PowerShell, in the project folder)

```powershell
npm install
npm --prefix frontend install
npm run setup:vision            # creates/repairs .venv-proctoring, installs the lock, verifies models, self-check
```

For the Python tests as well: `powershell -NoProfile -File scripts/setup-vision.ps1 -Dev`.
To rebuild the environment from scratch: add `-Recreate`. If `uv` is not installed:
`python -m pip install --user uv` first (or install Python 3.13 so `py -3.13` works).

## 5. Starting the services

The Python vision service is not started by hand: the API starts it on the first consented camera frame and
restarts it if it stops.

```powershell
npm run start:api               # API on http://localhost:3000 (starts the Python worker on demand)
npm run dev:frontend            # app on http://localhost:5173
npm run check:vision            # optional: confirms Python, libraries, models and inference
```

Then open http://localhost:5173, sign in, create an interview, and in the room tick *Allow sampled Python
visual monitoring with my camera* before starting.

## 6. Test results (this machine, 26 October 2026)

| Suite | Result |
|---|---|
| Node unit + integration (`npx vitest run`) | **269 / 269 passed** (50 files) |
| Python (`npm run test:vision`) | **74 passed**, 15 subtests passed |
| Backend and frontend builds | pass |
| `npm run check:vision` / `setup:vision` | pass (also with output redirected to a log) |
| Browser, fixture camera: `verify-vision-pipeline`, `verify-face-tracking`, `verify-hand-tracking`, `verify-phone-detection`, `verify-three-warnings`, `verify-proctoring` | **all pass** |
| Rest of the app: `verify-voice-room`, `verify-avatar-turns`, `verify-avatar-levels`, `verify-cinematic-landing` | pass |

**Older scripts that do not pass, and why** (none is caused by the vision work; all were already stale or need
setup that is not present):
- `verify-full-journey`, `verify-live` — call the API without signing in; sign-in has been required since the
  first commit (401).
- `verify-report`, `verify-progress`, `verify-product-ui`, `verify-media.cjs` — wait for a "Read each question
  aloud" switch that does not exist in any commit of the frontend.
- `verify-acceptance` — three stale steps were fixed (sign-in label, speech-service choice); it now runs through
  sign-up, sign-in, résumé, plan, room and device checks, then stops in a section written for the old
  browser `speechSynthesis` question playback, which the voice room replaced (covered by `verify-voice-room`).
- `verify-native-speech` (documented as optional) — its spoken-answer WAV was missing; regenerated with the
  documented SAPI recipe. Microphone capture now works; Windows dictation returns no confident transcript for
  the synthetic voice (HTTP 422). Voice-answer recognition, not vision.
- `verify-dashboard/frontend/landing/ui-libraries.cjs` — need Playwright's own Chromium, which is not installed.

### The 14 required checks

**A** = automated test (synthetic landmarks, recorded/rendered frames, real photographs, or controlled
observations at the API level) · **B** = browser end-to-end through the real pipeline with a **fixture camera
stream** (real images, real Python, but not a webcam) · **C** = physical webcam with a person.

| # | Requirement | A | B | C |
|---|---|---|---|---|
| 1 | Correct interpreter and environment | `visionEnvironment.integration.test.ts`: the API's interpreter is `.venv-proctoring`, a venv, Python 3.13 | — | not run |
| 2 | Libraries import | same test: MediaPipe 0.10.35, OpenCV 4.12.0.88, NumPy 2.2.6 import at the locked versions; one OpenCV only | — | not run |
| 3 | Vision service starts | same test starts the real worker: 4 models ready, a frame analysed; `check:vision` | every B run | not run |
| 4 | Camera frames reach Python | queue/worker tests | `verify-vision-pipeline`: every JPEG's header size = size and bytes Python decoded; 1.8 results/s | not run |
| 5 | Face detection and landmarks | real-photo tests (portrait, two faces, dark, distant, partial, blur) | `verify-face-tracking` | not run |
| 6 | Gaze updates with head/eye movement | `test_rendered_motion.py`: 65 rendered frames with ground truth — yaw within 4°, pitch sign/trend, eye offset follows the pupils with the head still; `test_direction.py` | — (a still image cannot move) | not run |
| 7 | Hand landmarks update | real photos; `test_movement.py` scenarios | `verify-hand-tracking` | not run |
| 8 | Multiple faces | two-face photo test | `verify-face-tracking`, `verify-vision-pipeline` | not run |
| 9 | Tracking loss and recovery | worker tests | face leaves/returns (0.6 s), Python killed mid-frame (recovers ~2.6 s), camera unplug (reconnects 3 s) | not run |
| 10 | Warnings deduplicated | `VisionIntegrityEngine.test.ts`: 10-minute event → one record; replays, simultaneous signals, cooldown | `verify-three-warnings` | not run |
| 11 | Three warnings end the interview | state-machine and API tests | `verify-three-warnings`: warning 1, final warning 2, termination card with recorded reason, capture stopped, results 410 | not run |
| 12 | Camera failures never count | engine/API tests (disconnects, unusable frames, pipeline errors) | blank image → technical `camera_obstructed`; unplug → 0 warnings | not run |
| 13 | Frontend shows real backend events | presentation tests | panel text = server message verbatim; badge/overlay match Python's result | not run |
| 14 | Existing functionality intact | 269 Node tests | voice room, avatar, landing verifiers | — |

## 7. What works with a live camera

Three guided runs on this laptop's **Integrated Camera** with the user present (26 October 2026,
`scripts/live-camera-check.ts`; numbers only, no images, in `.browser-verification/live-camera-report.json`).
In the third run the actions and the step prompts drifted apart (for example the camera was covered during
the eye step), so the evidence below is what the camera data shows, not the per-step PASS/FAIL labels.

**Verified live:**
| Feature | Evidence |
|---|---|
| Frames reach Python continuously | run 3: 266 frames, all accepted; run 2: 194, all accepted; ~1.6/s, ~125–170 ms each in Python; window visible and camera live throughout (runs 2–3) |
| Face detection and landmarks | one face in every sample while seated, all quality checks passing (all runs) |
| Hand landmarks | two hands with 21 landmarks each plus both pose wrists (runs 2 and 3) |
| Head turns measured | yaw from −22° to +26° (run 3) and up to +35° (run 2) |
| Looking down measured | pitch from about −7° at rest to −34°; looking further down loses the face (tracking-lost), then recovers |
| Face absence and recovery | tracking-lost and face-not-detected while the image was usable, then tracked again on the first sample back (runs 1 and 3) |
| Covered camera is technical | image brightness fell from ~170 to 5–17 for 8 s; all 7 frames marked unusable; no face-absence incident, no warning |
| Event engine with real frames | review notes for position changes and "4 hand-to-face movements in about 120 s"; 0 warnings in every run |

**Not verified live:**
- *Eye-only movement:* no clean sample. When the eyes were moved the head also turned (32°) and the face was
  briefly lost; the iris offset changed by 0.087 eye widths but cannot be separated from the head movement.
  (Verified on rendered frames with ground truth instead.)
- *Large head turns beyond ~35°*: not observed, so the "head turned" threshold (30° held) was not reached live.
- *Second person and phone*: not shown to the camera (phone: 8 unconfirmed scans, never confirmed).
- *Three warnings ending a live interview*: verified with the fixture camera only.
- Run 1 stopped sampling once from the cover step on (one `WORKER_STOPPED`); it did not recur in runs 2 and 3
  and its cause is not known.

## 8. Remaining limitations

- **Live-webcam verification is partial** (section 7). Thresholds are not tuned on real candidates.
- **GPU unused on this laptop** (MediaPipe Windows build is CPU-only). Python takes ~100–165 ms per frame.
- **Gaze is approximate and uncalibrated.** It cannot say what someone is looking at; ~11° eye movements are
  visible in `gazeOffset` but below the "eyes off-centre" threshold by design; gaze is withheld when the head
  is turned far.
- **Pitch has a resting offset** that depends on camera height (about −11° in the rendered test).
- **Phone detection is weak:** 3 of 5 real photos found, 0 false positives in 4 phone-free images; phones
  edge-on, flat or partly hidden are often missed. Never proof of use.
- **Camera warnings can end an interview** (your three-warning policy). Safeguards: sustained incidents only,
  a recovery prompt first, a 60 s cooldown, technical problems never count — but false positives (e.g. a
  person passing behind) remain possible.
- **Several older verification scripts are stale** (section 6).
- **Clean-up needed:** a render mistake wrote 65 test images to `C:\proctoring\fixtures\rendered-head\`
  outside the project; the copies the project uses are in `proctoring/fixtures/rendered-head/`. Please delete
  `C:\proctoring` (the automatic removal was blocked by a safety check).

## 9. Files created and modified (vision work)

**Created** — Python: `proctoring/acceleration.py`, `proctoring/phone.py`, `proctoring/test_acceleration.py`,
`proctoring/test_phone.py`, `proctoring/test_rendered_motion.py`; fixtures `proctoring/fixtures/phones/`,
`proctoring/fixtures/rendered-head/` (frames, labels, READMEs); model `proctoring/models/efficientdet_lite0.tflite`.
Backend: `src/core/session/VisionIntegrityEngine.ts` (+ test), `src/api/handPatterns.integration.test.ts`,
`src/api/serviceRestart.integration.test.ts`, `src/api/visionEnvironment.integration.test.ts`.
Frontend: `frontend/src/components/IntegrityReview.tsx`. Setup and tests: `requirements-proctoring.lock.txt`,
`requirements-proctoring-dev.txt`, `scripts/setup-vision.ps1`, `scripts/check-vision.ts`, `scripts/test-vision.ts`,
`scripts/measure-phone-detection.py`, `scripts/live-camera-check.ts`, `scripts/verify-vision-pipeline.ts`,
`scripts/verify-face-tracking.ts`, `scripts/verify-hand-tracking.ts`, `scripts/verify-phone-detection.ts`,
`scripts/verify-three-warnings.ts`, `scripts/blender/render_head_sequence.py`, this file.

**Modified** — Python: `proctoring/worker.py`, `direction.py`, `movement.py`, `test_worker.py`,
`test_direction.py`, `test_movement.py`, `proctoring/README.md`. Backend: `src/api/server.ts`,
`ProctoringWorker.ts`, `ServiceConfig.ts`, `schemas.ts`, `MovementObservation.ts`,
`src/core/session/IntegrityPolicy.ts`, `InterviewStateMachine.ts`, `src/index.ts`, and the tests
`ProctoringWorker.test.ts`, `directionReview`, `fairIntegrity`, `proctoring`, `monitoringPresentation`,
`visionCapture`. Frontend: `InterviewRoom.tsx`, `MonitoringStatus.tsx`, `VisionOverlay.tsx`, `ResultsScreen.tsx`,
`monitoringPresentation.ts`, `useVisionMonitoring.ts`, `useInterviewIntegrity.ts`, `useInterviewMedia.ts`,
`visionCapture.ts`, `types.ts`, `candidate-product.css`. Config and scripts: `requirements-proctoring.txt`,
`package.json`, `.env.example`, `frontend/.env.example`, `scripts/install-proctoring-models.ps1`,
`scripts/browser-face-fixture.ts`, `scripts/verify-proctoring.ts`, `scripts/verify-acceptance.ts`.
