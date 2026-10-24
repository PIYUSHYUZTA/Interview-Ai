# Voice room and proctoring repair

## Execution path

Resume/PDF/DOCX -> existing career detection and interview plan -> authenticated session -> dedicated room -> native browser question playback -> microphone permission/capture -> browser speech recognition -> read-only transcript -> existing `/answer` evaluation and rolling skill state -> `/next-question` -> spoken adaptive follow-up -> `/complete` and saved assessment.

No frontend scores, question sequences or transcripts are fabricated. The backend receives narrative text internally because speech recognition produces text; this is not a typed-answer interface. Browser Web Speech may use its vendor's online recognition service. No Whisper or external TTS provider is configured or verified by this repair.

## Causes and repairs

- The normal interview interaction required text submission/manual progression. The room now orchestrates speech completion, final transcript validation, evaluation and adaptive progression automatically. Empty/failed transcription does not consume an answer. Five seconds without additional recognized speech finalizes an answer; **Done speaking** is also available.
- The room lived inside the dashboard shell. App routing now renders the room alone. Fullscreen is requested directly from the Start button gesture on the room element, before awaiting network requests. Exiting fullscreen leaves the dedicated room visible; the policy can require fullscreen before resuming voice.
- Speech capture, playback and pending finalization needed explicit ownership and failure recovery. Native utterances are retained until completion, startup/completion watchdogs bound stalled services, stale callbacks are ignored, and media/timers stop on exit, completion or termination. Camera errors are visible before starting. Permission/device errors and failed API calls have retry actions with preserved completed transcripts.
- Python was already a backend-owned worker launched lazily for consented samples. It is not a separate webcam application or desktop AI detector. Missing consent/camera means no frames. The previous room had limited operational visibility. Owner-authorized diagnostics now identify frame receipt, analysis, unavailable workers and policy decisions without storing media.
- Frontend sampling included evaluation state while the frame endpoint accepted only active-question state, producing intermittent 409 errors between answers. The endpoint now accepts both active and evaluation states; session mutations remain serialized.
- Sustained head/eye-direction and position observations now use the existing policy path as neutral notices. The first reliable shoulder center is an in-memory position reference; model confidence, grace periods and continuity thresholds gate observations. Hands/upper-body movement are observations, not intent judgments.

## Warning policy and limitations

The preserved policy allows two warnings and permanently terminates on the third distinct qualifying hidden-tab incident. Grace is 30 seconds, hidden-tab threshold five seconds, duplicate suppression 15 seconds. Focus, fullscreen, camera, microphone, network and visual observations are contextual; they do not automatically establish cheating or increment warnings. Third-incident termination stops capture/playback/timers, rejects further answers/questions/results and persists across API restart. It ends the interview, not the candidate account.

A normal browser cannot inspect arbitrary desktop applications or prove use of an AI tool on another device. Approximate gaze/head/body signals are not identity, emotion, drug, object, gesture-meaning or conversation-partner recognition. Physical webcam accuracy, human audibility and native recognition of a candidate's actual voice require device-level verification; automated contract events do not establish those facts.

Raw camera stills are analyzed in memory and discarded. Operational event metadata follows the existing 30-day retention policy described in `proctoring/README.md`. Diagnostic counters reset when the API restarts; persisted event metadata and terminal session state remain.

## Changed implementation files

- `frontend/src/App.tsx`: isolated room route.
- `frontend/src/components/InterviewRoom.tsx`: voice lifecycle, fullscreen, transcript, controls, retries and diagnostic display.
- `frontend/src/components/useInterviewMedia.ts`: native speech callbacks, capture lifecycle, bounded startup/finalization and device handling.
- `frontend/src/components/DeviceCheck.tsx`: voice-compatible error guidance.
- `frontend/src/components/ResumeUploadView.tsx`: setup copy matches the voice workflow.
- `frontend/src/components/useVisionMonitoring.ts`: clear stale observations, accurate automatic-retry guidance.
- `frontend/src/api.ts`: diagnostics contract and bounded API requests.
- `frontend/src/types.ts`: supported vision fields.
- `frontend/src/candidate-product.css`: dedicated responsive interview room.
- `src/api/server.ts`: authorized diagnostics, evaluation-time sampling, sustained observation notices.
- `src/api/ProctoringWorker.ts`, `src/api/ServiceConfig.ts`, `src/api/schemas.ts`: validated observations, thresholds and diagnostics response.
- `src/core/session/IntegrityPolicy.ts`: contextual observation types; penalty policy preserved.
- `proctoring/worker.py`: reliable-face indicator and normalized position displacement.
- `src/api/auth.integration.test.ts`, `src/api/proctoring.integration.test.ts`, `proctoring/test_worker.py`: authorization, real inference, diagnostics and evaluation-state regression checks.
- `scripts/verify-voice-room.ts`, `scripts/verify-acceptance.ts`, `scripts/verify-proctoring.ts`: current browser verification; `scripts/verify-native-speech.ts`: separate native speech-service/fixture accuracy probe.
- `.env.example`, `proctoring/README.md`, this document: configuration and honest verification scope.

Older standalone browser scripts that refer to typed answers describe earlier milestones; use the three current scripts below for this voice room.

## Start in Windows PowerShell

Terminal 1:

```powershell
Set-Location 'D:\AI Mock Interview Platform'
$env:INTERVIEW_PROVIDER = 'deterministic'
$env:PROCTORING_PYTHON = (Resolve-Path '.\.venv-proctoring\Scripts\python.exe').Path
npm run start:api
```

Terminal 2:

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run dev:frontend
```

Open `http://localhost:5173`. Camera/microphone require localhost or HTTPS and explicit browser permissions. Python starts on the first enabled camera sample. Review monitoring consent before starting.

## Verification commands

```powershell
npx vitest run --maxWorkers=1 --minWorkers=1
npm run build
npm run build:frontend
npm --prefix frontend run lint
npm run demo
.\.venv-proctoring\Scripts\python.exe -m unittest discover -s proctoring -p 'test_*.py'
npx tsx scripts/verify-proctoring.ts
$env:VERIFY_PRODUCTION = 'true'
npx tsx scripts/verify-acceptance.ts
npx tsx scripts/verify-voice-room.ts
Remove-Item Env:VERIFY_PRODUCTION
```

Run heavy checks serially on this machine. An unrestricted localhost connection is required for integration/browser tests. The earlier restricted run failed with EACCES; an overlapping verification run also had a worker exit. Neither was counted as a pass. The browser scripts use installed Edge and the bundled Playwright runtime; override `BROWSER_EXECUTABLE` and `PLAYWRIGHT_MODULE_PATH` on other machines.

## Verified scope

- Full suite: 193 tests across 31 files passed with one worker, including real Python inference, authorization, deterministic adaptation and assessment persistence.
- Python: four real-model tests passed (blank frame, portrait/two faces, hands/repeated movement and malformed input).
- Browser development acceptance passed real account UI, PDF/DOCX parsing, ambiguity correction, real assessment/report persistence and reopening; injected recognition/playback contracts tested service startup failure, network/disconnection recovery, stale events and answer/next-question retries. Native preflight playback generated an event; audibility was not confirmed by automation.
- Browser native-TTS journey passed real question start/end events, test-device camera/audio, read-only transcripts, empty-speech rejection, actual evaluation/adaptive follow-up, silence finalization, fullscreen isolation/exit/reentry, Python frames/diagnostics, real final assessment and track cleanup. Recognition events were injected; actual spoken STT is not claimed.
- Browser warning journey passed real Python frame processing and simulated visibility incidents, warnings one/two, duplicate suppression, permanent termination, cleanup and rejection after restart.

Production and expanded context-event reruns are recorded after completion below.

- Production browser acceptance also passed, including deliberately aborted screen-chunk recovery and persisted report reopening after API restart. Only deliberately induced unauthorized/network errors appeared in its captured console errors.
- Expanded browser integrity checks passed individually simulated focus loss, actual fullscreen exit/re-entry, simulated offline state and camera-track interruption through the frontend hook and real API. Each remained at zero warnings. The three later hidden-tab incidents, deduplication and permanent termination checks then passed.

- Native-TTS production journey passed after the final voice lifecycle changes. Desktop and narrow viewport checks use test-device camera/audio; screenshots are `.browser-verification/voice-immersive-room.png` and `.browser-verification/voice-immersive-mobile.png`.
- Backend and frontend TypeScript/build commands passed. Largest JavaScript chunk is about 386 KB; no large-bundle warning was emitted. Frontend lint exits successfully but retains 11 React effect/dependency/refresh warnings; it is not warning-free.

## Optional native speech probe

`scripts/verify-native-speech.ts` does not inject recognition results or TTS events. It runs the actual browser speech service against a generated non-personal WAV fixture. Generate the fixture first in this project:

```powershell
$audioPath = Join-Path (Get-Location) '.browser-verification\native-speech.wav'
$voice = New-Object -ComObject SAPI.SpVoice
$wav = New-Object -ComObject SAPI.SpFileStream
$wav.Open($audioPath, 3, $false)
$voice.AudioOutputStream = $wav
[void]$voice.Speak('I implemented an API with explicit error handling, measured latency and tested recovery. I used transactions and unique constraints to prevent duplicate payments.')
$wav.Close()
$env:VERIFY_PRODUCTION = 'true'
npx tsx scripts/verify-native-speech.ts
```

This probe requires installed Windows SAPI voices. An empty recognition result is not a successful transcript. A nonzero probe exit means actual native recognition was not established, independently of lifecycle contract-test passes. The test fixture is not a recording of the candidate.

### Native speech probe result (not a pass)

The real browser recognition probe did not meet the known-audio acceptance criterion. One attempt returned text with zero expected fixture terms; the last bounded attempt returned eight empty final results, then the room's 45-second no-speech timeout stopped capture (`aborted`). The UI displayed a retry notice and the backend recorded **zero answers** for that attempt. The probe exited 1. No raw recognition text is included in its current diagnostics.

This verifies failure handling, not transcription accuracy. Native browser recognition of the candidate's real microphone remains unverified. There is no configured server-side Whisper/STT or external TTS fallback. Browser-native TTS start/end was verified separately; human audibility still needs physical confirmation. No live LLM assessment provider was enabled or claimed.

## Final rerun

- Production `verify-voice-room.ts`: passed after the final mobile layout, callback ownership, disclosure and playback changes. No text-entry UI; native TTS start/end; test-device camera/audio; injected recognition -> real adaptive assessment -> report; fullscreen/mobile preview; actual Python frames and cleanup.
- Production `verify-acceptance.ts`: passed after adding interrupted-playback and recognition-finalization watchdog checks, plus all account/upload/report/network-retry assertions.
- `verify-proctoring.ts`: expanded contextual-event checks and the complete two-warning/third-incident termination test passed.
- Native speech fixture probe: exited 1; empty/mismatched output, not a verified speech-accuracy pass. The final empty attempt added no backend answer and displayed retry guidance.
- Backend is running on 3000 and Vite on 5173 for manual testing. Health reports file persistence, deterministic provider, browser-dependent speech and on-demand local Python. Frontend root and the proxied options endpoint respond successfully.

No dependencies were added and the existing adaptive engine, scoring weights, resume parsers and stored candidate accounts were preserved. No claim of real-webcam gaze accuracy, identity recognition, desktop AI detection or live LLM evaluation is made.

## Priority 1 follow-up — 19 October 2026

Inspected the existing room, media hook, device check, API flow and browser harnesses. The room already contained no standard text-answer input; the existing backend answer API and adaptive logic were preserved.

Fixed observable lifecycle defects:

- Queued TTS was labelled as active speaking before a native playback-start event. The room now shows “Preparing question playback” until `onstart`.
- Recognition-service `onstart` was treated as microphone capture. Listening now requires both service start and `onaudiostart`, with a live, enabled, unmuted app audio track. A temporarily muted startup track can recover before the watchdog expires. Capture interruption stops recognition and offers retry without submitting.
- Repeated final recognition events could duplicate a sentence in an answer. Final result indices are consumed once; empty final results do not consume an index or become answers.
- Unsupported capture/STT/TTS could consume session startup before a usable voice path existed. Capability failures now keep the session unstarted with explicit guidance.
- Preflight interim words could look like a completed transcription test, and its capture continued until timeout. Interim and final statuses are now separate; a completed transcript automatically ends the test capture.
- Added one-action camera/microphone preflight and automatic capability/status reporting. Human speaker audibility confirmation remains optional and is never a start gate.

Changed files: `frontend/src/components/InterviewRoom.tsx`, `useInterviewMedia.ts`, `DeviceCheck.tsx`, `scripts/verify-voice-room.ts`, `scripts/verify-acceptance.ts`, and this document. No new dependencies, speech provider, backend architecture or scoring changes.

Verified outcomes:

- All 193 existing tests in 31 files passed, including actual Python JPEG analysis through the API.
- Backend TypeScript and frontend TypeScript/production builds passed. Lint exits 0 with existing warnings.
- Native-TTS browser journey passed: no text entry, real question playback start/end, Chromium test-device audio/camera, injected final transcript -> real evaluation -> adaptive next question -> second native playback -> actual completed report, fullscreen isolation and media cleanup.
- Latest native-TTS browser run also passed consented camera-frame delivery to Python. Two earlier runs timed out with zero frames received; the intermittent browser sampling startup behavior was not attributed to missing Python libraries or declared fixed. Extra status-only failure diagnostics now expose frame counts and camera/visibility state. Python's four unit tests passed; runtime emitted existing model/telemetry warnings.
- Browser acceptance covers queued TTS, unsupported-recognition startup without a backend start request, service-start without audio-start, capture failure/cleanup, empty and repeated final events, speech network failure, disconnection, stalled finalization, interrupted playback, answer/next-question retries, stale events and persisted real reports. TTS/STT events in that acceptance harness are injected and explicitly not evidence of native recognition accuracy.

Remaining speech blocker: the final actual browser recognition probe started the native service and returned two final results (one nonempty), but matched zero of the seven expected fixture terms. One answer reached the assessment API; that does not establish transcript correctness. Probe exited 1. No reliable native-STT accuracy, physical speaker audibility or actual human microphone recognition is claimed. No server-side Whisper/STT or external TTS provider is configured. Deterministic assessment is used; no live LLM verification is claimed.

Run from PowerShell in this existing project (separate terminals):

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run start:api
```

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run dev:frontend
```

Open http://localhost:5173/. API health, frontend root and proxied interview options returned 200 during this follow-up. Existing Python is launched on demand by the API; no separate Python HTTP service is required.

Verification commands:

```powershell
npm run build
npm run build:frontend
npx vitest run --maxWorkers=1 --minWorkers=1
$env:VERIFY_PRODUCTION = 'true'
npx tsx scripts/verify-acceptance.ts
npx tsx scripts/verify-voice-room.ts
# Optional voice-only isolation, not a proctoring verification:
$env:VERIFY_VISION = 'false'
npx tsx scripts/verify-voice-room.ts
Remove-Item Env:VERIFY_VISION
# Actual recognition probe, currently failing its known-audio accuracy check:
npx tsx scripts/verify-native-speech.ts
.\.venv-proctoring\Scripts\python.exe -m unittest discover -s proctoring -p 'test_*.py'
```
