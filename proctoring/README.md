# Interview integrity and local vision

Current final verification: **234 application tests and 38 Python tests passed**;
backend/frontend builds passed. The final JSON result is
`.browser-verification/proctoring-final-tests.json`. Real-model fixture and browser
integration checks passed; physical-camera accuracy remains unverified. Identity
matching is outside the agreed anonymous-tracking scope. [TESTING.md](TESTING.md)
contains the current evidence map; counts in older milestone sections below are
historical, not additional or current totals.

## Candidate monitoring interface

The interview room now uses a compact `MonitoringStatus` panel, retaining the
existing camera/microphone controls, warning notices and termination screen.
It shows camera permission/capture state, identity status, face readiness, tracking
availability and backend warning count. Detailed head/gaze/hand coordinates,
quality percentages and per-track movement dumps are removed from the candidate
display. Operational counters remain behind **Technical details**.

Identity stays **Not verified**: this backend implements anonymous presence and
readiness, not identity matching. A successful readiness check is labeled **Ready**,
not Verified. An in-progress request says **Check requested** until there is backend
evidence of readiness processing. No identity Verifying/Verified state is fabricated.

Tracking is **Active** only with a current-session backend observation, a usable
face/transformation, all image-quality checks passed, camera on, consent given,
and a sample timestamp less than six seconds old. The API returns `observedAt`
alongside frame/readiness responses; it is bounded by the backend receipt time.
Missing timestamps, future/stale samples, disabled camera/consent or failed requests
cannot produce Active. Backend `TRACKING_LOST` produces **Temporarily lost**;
missing/unusable observations produce **Unavailable**, with measured lighting,
framing or positioning guidance. Expiry removes old landmarks even if the next
request stalls. This expiry is conservative UI presentation, never a penalty.

**Show tracking guides** is off by default and changes rendering only. Guides draw
the actual returned geometry with the existing mirrored/cropped camera alignment;
they do not generate eye indicators or alter backend sampling, policy or consent.
The status component's clock timer and observation-expiry timer are cleaned up on
unmount. No animation is used to imply detection. Identity verification remains
unavailable until a real, separately consented implementation exists.

Files: `frontend/src/components/MonitoringStatus.tsx`,
`frontend/src/components/monitoringPresentation.ts`,
`frontend/src/components/InterviewRoom.tsx`,
`frontend/src/components/useVisionMonitoring.ts`, `frontend/src/candidate-product.css`,
`frontend/src/types.ts`, `src/api/server.ts`,
`src/api/monitoringPresentation.test.ts`, `scripts/verify-proctoring.ts`,
`scripts/verify-voice-room.ts`, and this README. No dependencies are added.

Tests: `npx vitest run --maxWorkers=1 --minWorkers=1` passes **229 tests**.
Backend/frontend builds and lint pass with existing lint warnings. The browser
fixture-video test verifies default-off/toggled guides, Active only after real
Python output, temporary loss, stale-result expiry during a held request, recovery,
warnings and termination. To repeat that variant:

```powershell
$env:VERIFY_FIXTURE_FACE = 'true'
$env:VERIFY_TRACKING_FRESHNESS = 'true'
npx tsx scripts/verify-proctoring.ts
```

These tests verify UI/data integration, not physical-webcam accuracy or identity.
The production voice-room browser check also passes desktop/mobile bounds, native
question playback, adaptive progression, report display and capture cleanup with
the new panel. Speech-recognition callbacks are injected in that harness; live
transcription accuracy is not claimed.

## Fair warning and termination rules

The existing policy remains: 30-second settling grace, five-second sustained
hidden-tab threshold, warning 1, final warning 2, termination on the third distinct
qualifying incident. These values live in the existing `IntegrityPolicy.ts` product
policy. Only the observed hidden-tab rule is a penalty signal. Window focus,
fullscreen, head/eye/hand/body observations, temporary face loss, lighting/quality
failures, additional-person estimates and camera/model/network failures remain
contextual or technical, regardless of an observation's numeric confidence.

**Distinct incidents now require measured recovery:** after an incident, the browser
must report at least two seconds continuously visible (`tab_visible`) before another
hidden period can qualify. The next hidden interval must begin at least 15 seconds
after the last confirmed warning. A hidden period that starts inside cooldown is
suppressed for that entire continuous period, even if it later lasts beyond cooldown.
Brief returns, overlapping/replayed timestamps, changed UUIDs and refresh alone
cannot rearm an open incident. A recovery interval must not overlap the last measured
hidden interval. Recovery itself never adds a warning or clears the warning counter.

The backend persists the open/closed incident and last confirmed-warning timestamp
alongside the counter and event log. This metadata is independent of the bounded
500-event history, so pruning old records cannot create another penalty for the
same continuous event. Old snapshots load conservatively without a migration;
unknown recovery is treated as unrecovered rather than inventing a new incident.
Legacy clients may still report hidden events, but must send a qualifying
`tab_visible` recovery to count another distinct violation. The current React hook
sends stable visible recovery and retries using the same event UUID.

Duration, grace, timestamp/freshness, ownership and capability checks precede the
policy transition. If a numeric confidence is supplied internally, it must be finite,
within 0–1 and at least .7 for a penalty. Browser visibility is a directly reported
boolean state, not a model probability; its confidence remains null. Vision events
cannot become violations by supplying a large confidence. A normal browser cannot
prove use of an external AI tool, user intent, or desktop-wide activity, and client
visibility reporting is not a tamper-resistant secure-exam environment.

Each saved event records a `policyDecision`: `confirmed_violation`, `same_incident`,
`cooldown`, `recovery` or `context_only`. The interview room explains the rules before
starting and diagnostics show the decision. The third confirmed event, count, terminal
state, removed current question and neutral termination reason are persisted together
under the existing session lock/atomic store save before responding to the browser.
Save failure returns an error without partially committing termination; retry remains
idempotent. Successful termination revokes the monitoring capability and releases
vision resources. Start/answer/next/complete/frame routes continue enforcing the
persisted terminal state, including after restart. No account or unrelated record
is deleted, and no vision signal has been promoted to an automatic penalty.

Verified: **224 application tests, 31 Python tests, both builds and frontend lint**
pass (existing lint/runtime warnings remain). New tests cover changed IDs and
refresh during a continuous incident, pruned/legacy snapshots, short recovery,
cooldown, uncertain/technical signals, save failure and concurrent third-event
retries. Browser fixture-video checks show warning 1, final warning, stable recovery,
third-incident termination, stopped media/frames, duplicate suppression and rejected
progression after API restart. This verifies application policy, not physical-camera
accuracy or proof of cheating.

Changed files: `src/core/session/IntegrityPolicy.ts`,
`src/core/session/InterviewStateMachine.ts`, their tests, `src/api/server.ts`,
`src/api/schemas.ts`, `src/api/server.test.ts`,
`src/api/proctoringConcurrency.test.ts`, `src/api/visionEvents.integration.test.ts`,
`src/api/fairIntegrity.integration.test.ts`, `frontend/src/api.ts`,
`frontend/src/types.ts`, `frontend/src/components/useInterviewIntegrity.ts`,
`frontend/src/components/InterviewRoom.tsx`, `scripts/verify-proctoring.ts`, and this README.

## Backend and interview-state integration

Verified for this integration: **220 application tests and 31 Python tests pass**;
backend/frontend builds and frontend lint pass (existing warnings remain).
New lifecycle tests cover account isolation, token/stale-frame rejection before
inference, real Python multi-session cache release, disconnected-request retry,
and completing the real adaptive interview while inference is pending. Worker
tests cover immediate cleanup, cancellation, other-session isolation and malformed
protocol shutdown. Browser checks cover a stalled request, stale-frame recovery,
backend termination received only through the camera response, no subsequent
frame requests, media cleanup and terminal rejection after API restart. Production
voice-room verification still reaches the real assessment/report; native TTS is
tested, but recognition events are injected, so live spoken transcription is not
claimed. Camera input is fixture video, not a physical-webcam accuracy test.

Run these browser variants separately after the test suite:

```powershell
$env:VERIFY_FIXTURE_FACE = 'true'
$env:VERIFY_FIXTURE_HANDS = 'true'
$env:VERIFY_STALLED_VISION = 'true'
npx tsx scripts/verify-proctoring.ts
Remove-Item Env:VERIFY_STALLED_VISION
Remove-Item Env:VERIFY_FIXTURE_HANDS
$env:VERIFY_REMOTE_TERMINATION = 'true'
$env:VERIFY_STALE_FRAME = 'true'
npx tsx scripts/verify-proctoring.ts
$env:VERIFY_PRODUCTION = 'true'
npx tsx scripts/verify-voice-room.ts
```

Start the app in two PowerShell terminals at `D:\AI Mock Interview Platform`:
`npm run start:api` and `npm run dev:frontend`. Python is launched automatically;
no separate service command or external AI credential is required for deterministic
development mode. Browser camera/microphone permission remains explicit.

This is the running application's pipeline, not a separate Python demo:

`InterviewRoom → useVisionMonitoring → POST /interviews/:id/proctoring-frame`
`→ account ownership + token + consent + timestamp validation`
`→ ProctoringWorker → worker.py → validated observations/events`
`→ fresh InterviewStateMachine under session lock → session store → JSON response`
`→ tracking overlay + backend integrity state in the interview room`.

Python is a local subprocess launched automatically by the existing Node API,
not an HTTP service. Communication is newline-delimited JSON on child stdin/stdout.
Frame messages contain `sessionId`, bounded base64 JPEG and `observedAt`; the worker
returns `{ok, observation}` or a structured error code. Model diagnostics go to
stderr, not candidate events. At most one inference is pending globally; another
request receives a retryable busy error. There is no unbounded frame queue. Session
ownership/authentication remains in Node; Python cannot select or terminate users.

The server validates the current persisted state before analysis and again before
committing results. An interview that completes or terminates during inference
cannot be revived by the late frame. Completed/terminated errors include the
validated authoritative public state. Tokens never authorize another account's
session. Warning counters are modified only by the existing backend policy.

The frontend consumes `publicState` from vision responses and terminal errors.
Proctoring responses update integrity state without rewinding question/answer
progression; delayed lower warning counts cannot replace a newer backend count.
Unauthorized, missing, inactive or malformed sessions stop sampling with
an explicit error instead of retrying forever. Network failures, worker busy
responses, stale-frame rejections and timeouts retry with a new frame. Existing deadlines remain 20 seconds
for Python by default and 25 seconds for each browser frame request. No expired
request's raw frame is queued for retry. Active-session token reauthorization after
API restart is not added: stale authorization stops capture and requires a fresh
authorized interview flow, without any fabricated warning.

Completion, integrity termination, consent withdrawal, camera-off/leave and room
unmount release the session's Python state. A `{"command":"release","sessionId":…}`
control message removes that cache entry and deliberately emits **no stdout reply**,
so it cannot consume another frame's response. Releasing a cached session does not
interrupt a different active session. If the ending session owns pending inference,
the worker is killed to cancel that computation; other sessions' interview records
remain intact and can lazily reinitialize models. When no tracked sessions remain,
the worker is closed immediately. The existing idle-minute timeout remains a
fallback for abandoned clients that cannot send cleanup. Python never owns the
browser webcam: React stops browser media tracks, playback and timers separately.

A disconnected HTTP frame request cancels its pending work and cannot persist a
late observation or generate a misconduct event. Normal response closure does not
cancel another request. Malformed worker protocol output closes that process before
another request can accidentally consume a late or invalid reply. Child-process
identity guards continue to reject obsolete process callbacks.

Files for this integration: `src/api/server.ts`, `src/api/ProctoringWorker.ts`,
`src/api/schemas.ts`, `proctoring/worker.py`, `frontend/src/api.ts`,
`frontend/src/components/useVisionMonitoring.ts`,
`frontend/src/components/InterviewRoom.tsx`, `src/api/ProctoringWorker.test.ts`,
`src/api/visionLifecycle.integration.test.ts`, `scripts/verify-proctoring.ts`, and
this README. Existing authentication, interview engine and persistence drivers
are reused; no new service, dependency, database or parallel warning counter is added.

## Timestamped event pipeline

Verified: 212 application tests, 31 Python tests, backend/frontend builds and lint
(existing warnings remain). A real Python + JPEG API test verifies timestamped
event persistence; controlled failure tests verify one technical failure and recovery,
foreign/stale/low-confidence filtering, duplicate delivery, and browser-spoof rejection.
The fixture-video browser test verifies a measured hand event reaches saved backend
diagnostics, with zero visual penalties and existing termination safeguards intact.
This does not verify physical-camera accuracy or identity.

Added/updated files: `proctoring/events.py`, `proctoring/worker.py`,
`proctoring/test_events.py`, `src/core/session/IntegrityPolicy.ts`,
`src/api/VisionEvent.ts`, `src/api/ProctoringWorker.ts`, `src/api/server.ts`,
`src/api/schemas.ts`, `src/api/VisionEvent.test.ts`,
`src/api/visionEvents.integration.test.ts`, `src/api/proctoring.integration.test.ts`,
`frontend/src/types.ts`, `frontend/src/api.ts`,
`frontend/src/components/InterviewRoom.tsx`, `scripts/verify-proctoring.ts`, and this README.

`events.py` produces measurement transitions from real analyzer results. It shares
the application's camelCase integrity-event contract (`sessionId`, UUID `eventId`,
`eventType`, `occurredAt`, `durationMs`) rather than creating another ingest API.
`occurredAt` is UTC epoch milliseconds, matching existing persisted events; it can
be rendered as ISO-8601 with `new Date(occurredAt).toISOString()`. Python uses the
backend's sample timestamp and monotonic elapsed time for durations. Added fields
are `confidence`, `severity`, and bounded `details` (source, signal, state, phase).
There are no frames, landmark arrays, transcripts or biometric templates in events.

| Requested observation | Existing-contract event |
| --- | --- |
| Face present (not identity) | `face_detected` |
| Face not detected | `face_not_detected` |
| Temporary face tracking loss / low quality | `tracking_lost` / `tracking_unreliable` |
| Multiple faces | `multiple_faces_detected` |
| Reliable directional head change | `head_orientation_changed` |
| Reliable eye-direction transition | `gaze_tracking_changed` |
| Sustained approximate gaze deviation | `gaze_away` (existing backend review window) |
| Hand visibility/track changes | `hand_tracking_changed` |
| Useful tracking region boundary exceeded | `candidate_out_of_frame` (approximate framing only) |
| Missing/ambiguous pose | `pose_tracking_unavailable` |
| Multiple usable poses/faces | `additional_person_detected` |
| Measured return to usable tracking | `tracking_recovered` with signal/phase |
| Browser camera interruption / resumed frames | `camera_interrupted` / `camera_recovered` |
| Failed worker/model request / resumed analysis | `vision_pipeline_error` / `vision_pipeline_recovered` |

**No `FACE_VERIFIED` / `face_verified` event exists.** Face presence and readiness
do not verify identity. A framing event reports a measured tracking-region boundary,
not proof that a candidate left the room. Initial absence of a deviation is not
published as a recovery. Unusable directions do not produce directional detections.

Python requires two matching samples and `PROCTORING_EVENT_DEBOUNCE_SECONDS`
(default 2, range .5–10). A per-signal `PROCTORING_EVENT_COOLDOWN_SECONDS` (default
10, range 2–120) limits transitions. A recovery suppressed during cooldown remains
pending and is emitted if still measured later. Gaps above six seconds reset
debouncing. Existing geometry/visibility gates apply: model detection thresholds
are .7, usable shoulders require .65 visibility, and directional estimates require
consecutive usable samples. Event probability is **null**, since these result types
do not supply a calibrated event-confidence probability. The backend rejects
out-of-range confidence and filters any reported numeric event confidence below .7.
It never replaces missing confidence with a fabricated number.

The authenticated, token-protected camera route consumes the worker events only
after fresh session-state checks. It validates shape, session binding, event-ID
format, timestamp age/future bounds and numeric confidence; duplicate IDs and
recent identical signal/state deliveries are suppressed using the existing log.
The browser's `integrity-events` whitelist cannot submit vision event types.
Metadata is saved in the existing bounded 500-record session integrity log and is
available through authorized diagnostics with readable timestamps and severity.
Pre-interview events stay transient in the face-check response. Existing sustained
review notices (`face_absent`, `head_turned`, `gaze_away`, etc.) remain distinct from
measurement-transition events and retain their backend grace/notice windows.

An outage records one technical event; repeated failures during that outage do not
append duplicates. Successful inference records recovery. Outage metadata is derived
from saved session events rather than a new volatile counter. Ingestion still needs
the existing authorized session token; active-session reauthorization after a backend
restart is outside this change. A valid frame following
a recorded camera interruption records resumed capture. Python clears measurement
continuity after analysis errors; terminal/cancelled sessions discard late results.
Technical failures and all visual events carry **zero warning penalties**. Existing
tab-hidden policy remains the only warning/termination signal. There is no new
storage service or separate event endpoint, and no raw footage is retained.

## Hand and upper-body tracking

Verification for this milestone: **207 application tests and 26 Python tests pass**;
backend/frontend builds and frontend lint pass (existing lint warnings remain).
The browser check used actual portrait/hand fixture video through Python inference,
verified landmark rendering and hand loss without penalties, then verified the
existing warning/termination policy and rejection after restart. It was not a
physical-webcam accuracy test. Commands:

```powershell
npx vitest run --maxWorkers=1 --minWorkers=1
.\.venv-proctoring\Scripts\python.exe -m unittest discover -s proctoring -p 'test_*.py'
npm run build
npm run build:frontend
npm --prefix frontend run lint
$env:VERIFY_FIXTURE_FACE = 'true'
$env:VERIFY_FIXTURE_HANDS = 'true'
npx tsx scripts/verify-proctoring.ts
```

The existing Hand Landmarker now feeds `movement.py`: up to two visible hands,
21 image landmarks each, model-estimated left/right labels, anonymous position
association, time-based landmark smoothing, entry/recovery transitions and
temporary loss. Tracks survive brief loss for six seconds by default; recovery
does not calculate a movement jump across the missing interval. Expired tracks
are reported as not visible and a later hand receives a new anonymous ID. Position
matching is approximate: crossings, occlusion, sudden movement and handedness
misclassification may break continuity. It is not biometric recognition.

Wrist position relative to the single visible face is expressed in face-box widths
and heights (unmirrored camera coordinates). It does not establish face contact.
Invalid, collapsed or very small hand geometry is rejected; partial out-of-frame
hands are marked uncertain. `handednessScore` is the model's **side classification
score**, not landmark/detection confidence. `landmarkConfidence` remains null:
the selected hand result does not provide per-landmark confidence. `reliable`
means consecutive usable geometry, not a calibrated probability.

Pose Landmarker requests up to three poses. Usable shoulders require model
visibility >= .65. The output includes selected visible upper-body landmarks,
smoothed shoulder center, shoulder-line tilt, motion, displacement from the initial
usable center, framing and temporary tracking loss. Multiple usable poses or faces
make candidate-body attribution ambiguous. Additional-person observation means
multiple visible faces or usable poses; counts are **not added together**, and the
system cannot detect every person or identify who owns a hand. Complete absence
is reported as unavailable, not asserted to be a deliberate departure.

Hand and body movement episodes use a configurable normalized-distance threshold.
Three separate movement episodes in the rolling window are labeled repeated;
continuous above-threshold motion has a sustained duration. These are neutral
sampled observations, not suspicious-gesture classifiers. Only the existing coarse
open/curled/mixed finger configuration is classified; gesture meaning, intent,
objects, emotions and cheating are not inferred. Normal movement adds **no
automatic warnings or termination**. Backend position-review notices require
usable body tracking and the existing sustained review window. Tracking failure
resets continuity and does not incur penalties.

Settings inherited by Python when the API starts:

| Environment variable | Default | Range |
| --- | --- | --- |
| `PROCTORING_MOVEMENT_SMOOTHING_SECONDS` | 2 | .2–10 seconds |
| `PROCTORING_MOVEMENT_GAP_SECONDS` | 6 | 3–15 seconds; outer worker continuity is capped at six seconds |
| `PROCTORING_MOVEMENT_THRESHOLD` | .025 | .005–.2 normalized image distance per sample |
| `PROCTORING_MOVEMENT_WINDOW_SECONDS` | 30 | 10–120 seconds |
| `PROCTORING_MOVEMENT_SUSTAIN_SECONDS` | 15 | 5–120 seconds |

The browser samples every two seconds: this is **not continuous high-frame-rate
gesture recognition**. Fast movements between samples may be missed. Low light,
framing, occlusion and model limitations reduce quality. Physical-webcam accuracy
for different candidates still needs manual testing. Raw frames are not stored;
ephemeral numeric hand/pose state shares the existing bounded, expiring worker
cache and is cleared on worker cleanup. Landmark arrays reach the consented
candidate's browser and are not persisted into interview records.

Files for this milestone: `proctoring/movement.py`, `proctoring/worker.py`,
`proctoring/test_movement.py`, `proctoring/test_worker.py`,
`src/api/MovementObservation.ts`, `src/api/ProctoringWorker.ts`, `src/api/server.ts`,
`src/api/movement.integration.test.ts`, `frontend/src/types.ts`,
`frontend/src/components/InterviewRoom.tsx`, `frontend/src/components/VisionOverlay.tsx`,
`scripts/browser-face-fixture.ts`, `scripts/verify-proctoring.ts`, and this README.

The existing Node API owns sessions, policy decisions and warning counts. It launches `worker.py` as a persistent child process on the first consented camera sample. Python does not open its own webcam or run a separate application. The interview room uses its existing browser camera stream.

## Run in Windows PowerShell

From `D:\AI Mock Interview Platform`:

```powershell
.\.venv-proctoring\Scripts\python.exe -m pip install -r requirements-proctoring.txt
$env:INTERVIEW_PROVIDER = 'deterministic'
npm run start:api
```

In another terminal in the same project:

```powershell
npm run dev:frontend
```

Enter the interview room, review the policy, explicitly enable sampled visual monitoring, then request camera permission. The optional `PROCTORING_PYTHON` environment variable selects another compatible Python executable. Missing dependencies/models produce an unavailable notice and no warning. No separate Python HTTP server is required.

## Models and observations

Python 3.13 was inspected with OpenCV 4.12.0 and MediaPipe 0.10.35 in `.venv-proctoring`. Official model assets are stored under `models/`:

- https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task
- https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task
- https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task

The module estimates visible face count (up to three), coarse head orientation from the face transform, approximate horizontal eye direction from iris position, shoulder visibility, visible hands (up to two), normalized wrist positions, and inter-sample shoulder/wrist movement. Movement is the displacement between samples, not velocity or intent. Eye direction is an uncalibrated image-space proxy: lighting, glasses, occlusion and camera placement affect it. Face absence means detection failed, not proof the candidate left.

Face absence, multiple faces, reliable head/eye-direction changes, or upper-body displacement from the first reliable shoulder position can produce neutral notices after sustained consecutive samples and the grace period. `PROCTORING_NOTICE_MS` defaults to 15000; gaps of six seconds reset continuity. `PROCTORING_POSITION_THRESHOLD` defaults to 0.15 in normalized image coordinates. Head/eye direction, hand gestures and ordinary body movement never generate warnings. No object detector, substance classifier, facial identification, emotion classifier, application scanner or desktop AI-tool detector is implemented.

## Policy

- First 30 seconds: grace period.
- A hidden interview tab sustained for five seconds after that grace period is the sole warning-eligible event. This is a defined practice policy, not a cheating verdict.
- First distinct eligible incident: warning 1. Second: warning 2, final notice. Third: permanent `TERMINATED_FOR_INTEGRITY` state.
- Event IDs, overlapping durations and a 15-second recovery/suppression window prevent one continuous incident from adding multiple warnings. The API validates ownership, a per-session capability token, allowed event types, age, timestamps and duration. It serializes session mutations.
- Focus loss, exiting fullscreen, device failures and connection interruptions are recorded as contextual/technical observations after a duration threshold. They do not increment the warning counter. Client-reported observations are not tamper-proof evidence; browser monitoring is not a secure examination environment.
- Termination stops capture, sampling, playback and interview timers, rejects answers/progression, displays the reason, and returns to the dashboard after 15 seconds or by button. The candidate account remains signed in; only the interview is terminated.

## Processing and retention

With consent, the browser sends JPEG still samples (longest edge up to 640 pixels by default) with a default two-second delay after each response while an interview question and camera are active. These go only to the existing interview backend. On a local installation the backend and Python run on the candidate's computer; a remote deployment would send samples to that server and must disclose that deployment arrangement. No continuous video or audio is uploaded for vision. Sampling pauses when the tab is hidden.

Frames and full landmark arrays remain in memory for inference and are not written to storage. The worker keeps initial shoulder centers, previous wrist centers, and anonymous face track IDs with normalized boxes/centers for up to 256 sessions to estimate movement. A gap over six seconds resets continuity; those disappear on worker exit. Node keeps short-lived sampling continuity state, bounded to 1000 sessions. Persisted events contain only ID, type, timestamp, duration and warning outcome, capped at 500 events/session. Event metadata older than 30 days is purged on the next file-backed session read; there is no background deletion scheduler. Warning totals and terminal status/reason remain with interview history until that interview is deleted through storage administration. No sensitive media is included in assessment scores.

Browser Web Speech, when used for answers, is separate from vision and may send audio to the browser vendor's speech service as disclosed in the room.

The installed MediaPipe wheel attempts to send runtime usage telemetry (observed during verification). Its maintainer states that input data is never sent and that there is no official telemetry-disable API: https://github.com/google-ai-edge/mediapipe/issues/6291 (see the maintainer's July 6 response in that issue). This application does not claim complete network isolation. For a deployment requiring zero outbound diagnostics, use an audited source build or an administrator-managed network policy; neither was configured here.

## Verification commands

```powershell
.\.venv-proctoring\Scripts\python.exe -m unittest discover -s proctoring -p 'test_*.py'
npm test
npm run build
npm run build:frontend
npx tsx scripts/verify-proctoring.ts
```

The browser verification script uses the bundled Playwright runtime (override `PLAYWRIGHT_MODULE_PATH` if elsewhere) and installed Edge (override `BROWSER_EXECUTABLE`). It starts temporary API/Vite servers, uses Chromium's synthetic camera, exercises real Python inference, and simulates visibility/time events to verify two warnings followed by termination. It does not establish real-webcam accuracy or detect real outside assistance.

## Operational diagnostics

In the room, expand **Monitoring status and diagnostics** and refresh. The owner-authorized `GET /interviews/:id/diagnostics` reports Python connection state, received/analyzed/failed frame counts, timestamps, recent policy events, warning count and terminal state. Python starts on the first consented sample; `not_started` before then is expected. Counters are in memory and reset on API restart; event metadata persists. No raw frames, transcripts or secret tokens appear in this response. Sampling continues through answer evaluation and retries technical failures automatically.

`npx tsx scripts/verify-voice-room.ts` separately exercises native browser TTS start/end, test-device media capture, fullscreen isolation and real API assessment. Its recognition events are injected; it does not verify native spoken transcription or human audibility. See `../VOICE_PROCTORING_REPAIR.md` for current acceptance scope.


## Anonymous tracking repair milestone

Scope confirmed by the user: **face presence and anonymous geometry tracking only**. There is no enrolled identity photo, biometric embedding, face-to-account match, identity verification or emotion inference. Consented identity enrollment/matching is a future enhancement requiring its own specification, model, retention controls and validation.

### Diagnosis and fixes

1. **Reproduced delivery stall:** `submitVisionFrame` supplies its own AbortSignal, bypassing the API client's default deadline. A request that never settled prevented every later sample. Added a 25-second deadline, automatic serial retry, hide/unmount cancellation and browser captured/submitted/analyzed/failure counters. The browser test left its first request unanswered: failed before the fix, then recovered and reached real Python inference afterward.
2. **Frame format/size:** sampling previously limited width only. Both axes are now bounded to 640 pixels while preserving aspect ratio. JPEG payload is bounded to the existing 180 KB decoded/240,000-character limit; high-detail frames receive a lower-quality encoding retry. A 480x1920 fixture-driven browser stream was processed successfully without changing backend limits.
3. **Reproduced blocking policy:** inference held the interview session lock. A delayed analysis prevented timely third-incident termination. Python now runs outside the lock; its commit reloads and checks the latest state under the lock. A frame finishing after termination is rejected with 410 and cannot restore the session. A new API concurrency test failed before this change and passed afterward.
4. **Worker lifecycle:** responses from an obsolete process could reach a later pending request. Child identity is now checked. Timeouts, process startup/exit, invalid frames, missing models and dependency/model failures have bounded structured codes. Partial model initialization cleans up already-created tasks. Worker restart/late-output tests passed.
5. **Tracking quality:** hand motion used detection array order. It now uses bounded one-to-one nearest-position association. Face boxes receive anonymous positional track IDs across nearby samples. An interruption over six seconds resets movement continuity; new faces/gaps do not imply an identity match.
6. **Eye and head estimates:** both open eyes must agree for an approximate eye-direction result. Closed/blinking eyes, disagreement, insufficient geometry and turned heads report unavailable gaze. Yaw/pitch/roll are exposed in degrees, with existing 30-degree yaw / 25-degree pitch contextual thresholds. These are approximate image-based observations, not calibrated gaze or attention measurements.
7. **Hands/body:** model-derived wrist positions, coarse `open_fingers`, `curled_fingers`, `mixed_fingers` or unavailable labels, hand displacement, shoulder visibility, body displacement and position shift are available. Finger labels describe geometry only, not intent or prohibited behavior. No object/substance detection is claimed.
8. **Diagnostics/display:** real sampled face boxes align with the mirrored `object-fit:cover` camera preview, including its crop. Browser counters distinguish capture/delivery from backend inference. The existing monitoring disclosure and consent remain required. No raw frame, full landmark arrays or biometric identity is persisted.

The backend remains authoritative: visual observations produce neutral contextual notices after the existing configured grace/continuity thresholds. They never automatically count as cheating. The existing policy penalizes sustained hidden-tab incidents, with warning 1, final warning 2, then termination on incident 3. Camera/model/network failures add no penalty. This milestone does not change that policy or claim desktop-wide AI-tool detection.

### Verification

- 197 application tests across 33 files passed, including new worker lifecycle and inference/termination concurrency tests.
- 14 Python tests passed: real portrait/two-face/hand inference, anonymous track continuity, positive hand/body displacement from translated real fixtures, interruption reset, malformed/oversized frames, missing models, eye geometry reliability and order-independent position association. Geometry unit tests use explicit landmark inputs; real-model tests use official fixture images.
- Backend/frontend TypeScript and builds passed. Lint exits 0 with existing React warnings.
- Browser pipeline passed with a fixture-driven portrait video: actual face detection, normalized track bounds, correctly mirrored/cropped overlay, face disappearance and reappearance, no visual penalties, and the complete warning/duplicate suppression/termination/persistence/cleanup sequence.
- Browser oversized-portrait + stalled-request scenario passed using actual Python inference after automatic recovery. Only the deliberately stalled transport and time/visibility events were injected; detector outputs and backend policy responses were real.
- Native Chromium test-camera browser scenarios also passed. Some intermediate runs encountered test-device disconnection before sending frames; those failures were surfaced, not counted as cheating or fabricated as successful tracking. Physical user-camera accuracy, gaze calibration and gesture accuracy across lighting/glasses/occlusion remain unverified.
- Existing MediaPipe runtime/model and attempted-telemetry warnings remain; this is not a claim of zero outbound runtime diagnostics.

### Run and verify

No new dependency, model download, migration or separate Python HTTP server is required. The installed environment contains OpenCV 4.12.0 and MediaPipe 0.10.35 with all three existing task assets. From the existing project root, run API and frontend in separate terminals:

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run start:api
```

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run dev:frontend
```

Enter an interview, consent to sampled Python monitoring, enable the camera and open Monitoring status and diagnostics. The API starts its existing local Python worker on demand. Override `PROCTORING_PYTHON` only when selecting another prepared environment. `PROCTORING_TIMEOUT_MS`, `PROCTORING_NOTICE_MS`, and `PROCTORING_POSITION_THRESHOLD` retain their existing configuration roles.

```powershell
.\.venv-proctoring\Scripts\python.exe -m unittest discover -s proctoring -p 'test_*.py'
npx vitest run --maxWorkers=1 --minWorkers=1
npm run build
npm run build:frontend
npx tsx scripts/verify-proctoring.ts
$env:VERIFY_STALLED_VISION = 'true'
$env:VERIFY_PORTRAIT_CAMERA = 'true'
npx tsx scripts/verify-proctoring.ts
Remove-Item Env:VERIFY_STALLED_VISION, Env:VERIFY_PORTRAIT_CAMERA
$env:VERIFY_FIXTURE_FACE = 'true'
npx tsx scripts/verify-proctoring.ts
Remove-Item Env:VERIFY_FIXTURE_FACE
```

The browser harness requires the existing bundled Playwright and Edge paths (override `PLAYWRIGHT_MODULE_PATH` / `BROWSER_EXECUTABLE` on other machines). The stall test accelerates only the first request deadline. Fixture video tests do not establish physical webcam accuracy. Screenshot: `.browser-verification/anonymous-face-tracking.png`.

Changed files: `proctoring/worker.py`, new `proctoring/observations.py`, `proctoring/test_worker.py`, `src/api/ProctoringWorker.ts`, new `ProctoringWorker.test.ts`, `src/api/server.ts`, new `proctoringConcurrency.test.ts`, `frontend/src/components/useVisionMonitoring.ts`, `InterviewRoom.tsx`, new `VisionOverlay.tsx`, `frontend/src/types.ts`, `frontend/src/candidate-product.css`, `scripts/verify-proctoring.ts`, and this README.


## Face-readiness workflow (anonymous scope confirmed)

This milestone adds a **face-readiness check**, not identity verification or biometric face matching. Normal account authentication remains the existing login flow. No reference photograph, biometric enrollment, identity template, liveness/anti-spoof model or face-to-account comparison has been introduced. A picture could satisfy a presence check: readiness must never be used as identity evidence.

### Candidate and backend flow

1. Sign in and create the interview using the existing resume/planning flow.
2. In the interview room, explicitly enable sampled visual monitoring and grant camera permission.
3. Choose **Check face readiness**. The existing Python analyzer must find one clear, sufficiently large, well-lit, forward-facing face in two consecutive samples on the same anonymous track, less than six seconds apart.
4. The backend records ephemeral readiness for this session. Every response explicitly has `identityVerified: false` and `identityVerification: not_implemented`. The UI says “Face readiness · not identity verification.”
5. A start request with `proctored: true` requires a fresh successful backend readiness result. Missing, failed and expired results return 409 before question progression. Original non-proctored API callers remain compatible. Deployments requiring face readiness for **all** starts can set `PROCTORING_FACE_CHECK_REQUIRED=true`; a client cannot override that server policy with `proctored:false`.
6. Readiness expires after 30 seconds before starting. During the interview, the existing observation stream updates state automatically. Status queries treat a face-present sample older than six seconds as tracking lost. Looking away, poor tracking or multiple faces does not automatically add cheating warnings or change assessment scores.
7. Turning the camera off, withdrawing monitoring or leaving requests deletion of readiness metadata. Completion/report finalization and integrity termination clear it in the backend. Refresh/process restart cannot restore a successful memory-only readiness check.

### Observation contract

- `FACE_PRESENT`, `FACE_NOT_DETECTED`, `TRACKING_LOST`, `MULTIPLE_FACES` and `QUALITY_LOW` describe frame observations. Service failure is separately represented as `UNAVAILABLE` in readiness metadata.
- Face boxes and **14 sparse diagnostic landmarks** reach the existing mirrored/cropped preview. Full model landmarks are not sent to the browser or persisted.
- Anonymous position association survives a disappearance up to six seconds. It is not biometric identity continuity and can associate different people in the same position. Longer gaps reset continuity.
- Quality reports single face, adequate size, lighting, sharpness and forward orientation. Its score is the fraction of these checks passed, **not a calibrated confidence probability**. `detectorConfidence` is null: this landmarker interface does not provide a per-face recognition-confidence value. Model detection threshold remains 0.7.
- Guidance identifies missing faces, multiple faces, lighting, distance, blur or head direction. Failed checks can be retried without starting an interview or submitting an answer.

### Access, retention and deletion

`GET`, `POST` and `DELETE /interviews/:id/face-check` require the authenticated interview owner and the session's monitoring token. Another signed-in account cannot access the check even with its token. POST requires explicit consent and the existing bounded, timestamp-validated JPEG format. Client-supplied verified flags are ignored; only analyzer evidence can establish readiness. In-flight results are discarded after cancellation/deletion or terminal state.

Readiness stores only state, timestamps, an anonymous track ID and sample count in API memory (maximum 1000 sessions). Validity is 30 seconds; stale metadata is opportunistically removed on access after 15 minutes, and explicit deletion removes it immediately. An unreachable server cannot confirm deletion; local capture still stops and the short-lived metadata expires. Nothing is written into the candidate profile or a biometric database.

Python retains bounded anonymous center/box/shoulder/wrist geometry for continuity, without sparse landmark arrays or raw images. Entries are opportunistically pruned after 15 minutes. The stdin line containing the last base64 frame is cleared after processing. The API closes its Python worker after **60 seconds idle**, releasing model memory and all cached geometry; server shutdown also closes it. Raw frames are discarded after inference and never saved by this application. Existing contextual-event retention remains documented above.

### Verification and files

Final verification is recorded after the commands complete. Tests cover real portrait and blank-frame checks, two-sample readiness, quality/state/landmark output, anonymous recovery, expiry, deletion, consent-withdrawal races, wrong-session tokens, authenticated ownership, strict server policy and forged verified flags. Browser fixtures exercise actual Python inference; they are not a human-camera or recognition-accuracy benchmark.

Changed/new files for this workflow: `proctoring/worker.py`, `proctoring/test_worker.py`, `src/api/ProctoringWorker.ts`, `ProctoringWorker.test.ts`, new `FaceReadiness.ts`, `FaceReadiness.test.ts`, `faceReadiness.integration.test.ts`, `src/api/server.ts`, `ServiceConfig.ts`, `frontend/src/api.ts`, `types.ts`, `components/InterviewRoom.tsx`, `useVisionMonitoring.ts`, `VisionOverlay.tsx`, `candidate-product.css`, new `scripts/browser-face-fixture.ts`, updated `verify-proctoring.ts` and `verify-voice-room.ts`, and this README. No dependency, model download, biometric enrollment or migration was added.

Start commands remain `npm run start:api` and `npm run dev:frontend` in separate PowerShell terminals at `D:\AI Mock Interview Platform`. There is no separate Python web service. Run the existing commands above for regressions. The voice harness now uses an official face fixture for camera frames so its new readiness check is genuine model inference; speech recognition events remain injected and are not evidence of real spoken-transcription accuracy.


Final workflow verification: **204 application tests in 35 files passed**, including readiness API/security/expiry/deletion and idle-worker cleanup tests; **15 Python tests passed**. Backend and frontend TypeScript/builds passed. Lint exits 0 with existing warnings. A prior full run exited because a Vitest worker process crashed; the isolated final structured run returned success=true with zero failed tests. Browser readiness/face recovery/landmarks/termination passed, as did the oversized portrait + stalled-request recovery scenario and the production native-TTS interview/report regression. Physical user-camera accuracy and actual spoken-STT accuracy remain unverified. Screenshots: `.browser-verification/face-readiness.png` and `anonymous-face-tracking.png`; structured regression result: `face-regressions.json`.
# Directional head and eye estimates

Verified in this change: 206 application tests, 20 Python tests, backend and frontend
builds, deterministic interview demo, and the fixture-video browser proctoring
journey (`$env:VERIFY_FIXTURE_FACE='true'; npx tsx scripts/verify-proctoring.ts`).
Directional unit tests cover four axes, blink rejection, smoothing, gaps, framing
and configuration. API tests cover unreliable-sample resets, sustained-event
deduplication, zero visual penalties and disabled direction review. Browser input
is a portrait fixture video, not a live human accuracy study. Existing frontend lint
warnings and MediaPipe runtime/telemetry warnings remain; checks exit successfully.

`direction.py` extends the real MediaPipe frame pipeline. The API validates
`directionEstimate` and the interview's monitoring diagnostics display it.
Directions refer to the **unmirrored camera image**, not anatomical left/right;
the candidate preview is mirrored. Head direction uses the face transformation
matrix. Eye direction projects iris centers onto each eye's corner axis and lid
normal, rejecting closed eyes, invalid geometry, strong head turns and disagreeing
eyes. Vertical eye estimates are particularly sensitive to eyelid shape and camera
placement. These are geometric estimates, **not precise or personally calibrated
eye tracking**. `calibrated` is explicitly false. Default thresholds require
real-camera validation for the deployment population; fixture tests cannot
establish measurement accuracy for candidates or accessibility needs.

Time-based exponential smoothing requires two consecutive usable samples. A gap
over the configured limit, a changed anonymous track, poor image quality, missing
face, multiple faces, or bad framing resets continuity. Blinks reset eye continuity.
The response includes smoothed angles, angular change between samples (not angular
velocity), framing, sample count, reliability reason and head/gaze unreliable time.
Quality-check fractions are not detector confidence probabilities.

Settings (set before starting the API; Python inherits them):

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `PROCTORING_HEAD_YAW_DEG` | 30 | Horizontal head threshold, range 10–70 |
| `PROCTORING_HEAD_PITCH_DEG` | 25 | Vertical head threshold, range 10–60 |
| `PROCTORING_GAZE_HORIZONTAL_THRESHOLD` | .25 | Iris-ratio distance from center, .1–.4 |
| `PROCTORING_GAZE_VERTICAL_THRESHOLD` | .30 | Lid-normal ratio distance from center, .15–.45 |
| `PROCTORING_SMOOTHING_SECONDS` | 3 | Exponential time constant, .2–10 seconds |
| `PROCTORING_TRACKING_GAP_SECONDS` | 6 | Python continuity limit, 3–15 seconds |
| `PROCTORING_MIN_FACE_AREA` | .025 | Minimum normalized face-box area, .005–.15 |
| `PROCTORING_FRAME_MARGIN` | .02 | Useful tracking margin, 0–.15 |
| `PROCTORING_NOTICE_MS` | 15000 | Sustained neutral review window, 5000–120000 ms |
| `PROCTORING_DIRECTION_REVIEW_ENABLED` | true | Set false to disable head/gaze review records for accommodations |

The backend independently resets review continuity on missing/unreliable samples,
processing errors and gaps of six seconds. Its existing monitoring grace period
and event-ID deduplication remain authoritative. Head/gaze observations **never
increment warnings or terminate an interview**. Looking away is not evidence of
cheating. Administrators can extend the notice interval, relax geometric thresholds,
or disable direction review; communicate accommodations before the interview.
Disabling review leaves estimates visible for diagnostics. No personal calibration,
identity matching, emotion inference or external-tool identification is implemented.
Only ephemeral per-session numeric smoothing state is added, with the existing
bounded worker cache and cleanup policy; no frames or biometric templates are saved.



## Acceptance-test evidence

See [TESTING.md](TESTING.md) for the requirement-to-test map, reproducible commands,
mock-versus-real-model distinctions, and physical-camera checks still required.

## Performance configuration and data flow (2026-10-21)

Camera capture stays in the browser. A bounded canvas draw copies one frame; JPEG
encoding uses asynchronous `toBlob` and `FileReader`, rather than synchronous
`toDataURL`. Landmark inference runs in the Node API's persistent Python child
process, never on the UI thread. This is sampled monitoring, not continuous video
or precise eye tracking. Browser-managed JPEG encoding is asynchronous; the small
canvas draw still runs on the main thread.

Each consented sample sends one JPEG (long edge at most 640 pixels by default,
quality .65 with one .4 retry, at most 180,000 decoded bytes / 240,000 base64
characters) with session authorization and a capture timestamp to the API.
The API validates ownership, state, size, freshness and rate before invoking Python
through stdin/stdout JSON lines. Frames are transient memory, not saved recordings
or sent to the interview LLM. Observation coordinates return to the browser;
event metadata follows the existing bounded retention policy. There is no identity
matching or biometric enrollment. Use HTTPS for any hosted deployment.

In local development API and Python run on this computer. In a hosted deployment,
the JPEG travels to the API host and Python runs there; this is server processing,
not in-browser inference. The MediaPipe wheel has emitted Clearcut connection
attempts during local tests; do not describe the runtime as guaranteed network
isolated. Candidate frames are not intentionally sent to that telemetry endpoint.
Do not log frames, base64 data, authentication tokens or detailed landmark arrays.

### Installation (PowerShell, project root)

```powershell
py -3.13 -m venv .venv-proctoring
.\.venv-proctoring\Scripts\python.exe -m pip install -r requirements-proctoring.txt
.\scripts\install-proctoring-models.ps1
npm run start:api
# In a second terminal:
npm run dev:frontend
```

The installer verifies SHA-256 digests of the inspected official models, preserves
existing assets on mismatch, and removes failed temporary downloads. Upstream
`latest` changing will fail closed until reviewed. It is not run automatically at
server startup. All direct Python dependencies, including NumPy 2.2.6, are pinned;
transitive dependencies are not a fully locked environment.

### Settings

Copy frontend/.env.example to frontend/.env for public build settings. Root .env
settings are server-only. Restart the appropriate process after changing them.

| Setting | Default | Valid range / behavior |
| --- | --- | --- |
| VITE_PROCTORING_INTERVAL_MS | 2000 | 1500–3000 ms delay **after** completion/failure; unsafe values fall back to default |
| VITE_PROCTORING_MAX_EDGE | 640 | 320–640 pixels; preserve aspect ratio |
| PROCTORING_CPU_THREADS | 1 | 1–8 OpenCV threads, rounded down; MediaPipe uses its own CPU/XNNPACK scheduling |
| PROCTORING_POSE_ENABLED | true | false skips pose loading/inference |
| PROCTORING_HANDS_ENABLED | true | false skips hand loading/inference |
| PROCTORING_TIMEOUT_MS | 20000 | Existing API worker deadline, 1000–120000 ms |
| PROCTORING_NOTICE_MS | 15000 | Existing contextual sustained-observation threshold, 5000–120000 ms |
| PROCTORING_POSITION_THRESHOLD | .15 | Existing normalized position shift, .05–.8 |
| PROCTORING_HEAD_YAW_DEG / HEAD_PITCH_DEG | 30 / 25 | 10–70 / 10–60 degrees |
| PROCTORING_GAZE_HORIZONTAL_THRESHOLD / GAZE_VERTICAL_THRESHOLD | .25 / .30 | .1–.4 / .15–.45, geometric estimates |
| PROCTORING_SMOOTHING_SECONDS | 3 | .2–10 seconds |
| PROCTORING_MOVEMENT_SMOOTHING_SECONDS | 2 | .2–10 seconds |
| PROCTORING_MOVEMENT_THRESHOLD | .025 | .005–.2 normalized displacement |
| PROCTORING_MOVEMENT_WINDOW_SECONDS / MOVEMENT_SUSTAIN_SECONDS | 30 / 15 | 10–120 / 5–120 seconds |
| PROCTORING_EVENT_DEBOUNCE_SECONDS / EVENT_COOLDOWN_SECONDS | 2 / 10 | .5–10 / 2–120 seconds |

Invalid Python numeric settings fail initialization rather than silently changing
policy. Existing face confidence thresholds remain .7; image-quality checks and
null detector confidence are unchanged. Frontend and backend freshness/continuity
remain six seconds: slow CPU inference can therefore produce tracking unavailable
or reset temporal continuity rather than claiming uninterrupted tracking. Reduce
resolution or disable optional modules if needed. Never increase monitoring rates
past the API's 1500 ms per-session limit.

Face model initialization remains mandatory. Missing/corrupt optional pose or hand
models now report `moduleStatus: unavailable`; explicitly disabled modules report
`disabled`, not an invented successful detection. Available models report `ready`.
Only face inference can establish face readiness; it never establishes identity.
Unavailable optional modules cannot generate hand/pose disappearance events. Their
empty compatibility arrays must be interpreted with moduleStatus, not as evidence
that no hands or people exist. The candidate gets an availability notice. A failure
of the required face model is a technical error with automatic retry, never a
cheating penalty. Optional initialization failures are retried on worker restart.

One reusable model set serves the API process, with one inference in flight globally.
Busy requests get a retryable error, not an unbounded queue. Each browser also has
one request in flight; it pauses hidden tabs, aborts on cleanup, and checks cancellation
after asynchronous encoding. Python has bounded session caches, a 60-second idle
shutdown, and per-session release on consent removal/end. Models close on process
EOF and partial initialization failure; interrupted active inference kills its worker.
This is suitable for the existing demonstration, not a claimed multi-user capacity
benchmark. A measured worker pool would be a separate deployment change.


Verification of this performance update:
- 232 application tests passed (single-worker Vitest JSON report:
  `.browser-verification/performance-regressions.json`).
- 33 Python tests passed, including actual face inference with absent optional model
  files, disabled optional model allocation checks, real hand/pose/face fixtures,
  and temporal observation tests.
- Backend/frontend builds, frontend lint and deterministic demo passed. Existing
  unrelated lint warnings remain; no bundle-size warning was emitted in this build.
- Browser proctoring verification used fixture camera video passed through actual
  Python inference: readiness, freshness expiration/recovery, face loss/recovery,
  warnings 1/2/termination, cleanup and rejection after restart passed.
- Model installation script verified all three existing asset hashes. Its network
  download branch was not exercised during this update.
Physical webcam tracking accuracy, CPU capacity under concurrent candidates and live
speech recognition have not been established by these automated fixture checks.

The production-built voice-room browser check also passed native TTS, immersive
fullscreen, real API answer evaluation/adaptive next question, completed assessment
and cleanup with test-device media. Recognition callbacks were injected; this does
not verify live spoken STT. Run with `$env:VERIFY_PRODUCTION='true'` followed by
`npx tsx scripts/verify-voice-room.ts`. The development API was restarted on port
3000 after verification; begin a fresh interview because capability tokens are
process-local.
