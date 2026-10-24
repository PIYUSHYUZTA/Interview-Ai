# Live human interview studio — Part 3



## What changed



The existing room previously showed an abstract robot with a pulsing ring.

It had no human skeleton, blink shapes or facial visemes. Browser speech playback

provided no accessible PCM or phoneme timings, so the ring could not be lip sync.

The actual browser STT probe also returned empty results in this environment.



The room now loads a Blender-prepared CC0 MakeHuman/MPFB digital human with

original skin/eye maps, styled hair, charcoal clothing, a skeleton, blink shapes,

expression shapes and Oculus visemes. Original Blender architecture provides

acoustic slats, a dark desk, teal reveals and warm metal details. The human is a

generic fictional character. The source and license evidence are retained under

`assets/avatar-source/`; no biometric likeness or reference photo is required.

This is a textured digital human, not a bespoke photoreal actor scan.



The first web export incorrectly used the original rest pose instead of the

relaxed Blender pose. Current export explicitly uses the current joint rest pose.

The prepared GLB is approximately 14.4 MB / 86,146 triangles with embedded maps,

under an explicit 15 MB / 100,000-triangle budget. Texture dimensions are reduced

to at most 2048px for skin and 1024px for other maps. It loads on room entry; there is no runtime model-download API.



## Live execution path



Owned active question -> authenticated speech endpoint -> local Windows SAPI

WAV + timestamped visemes -> HTMLAudioElement -> audio.currentTime -> avatar

facial morphs -> microphone -> AudioWorklet PCM capture -> authenticated local

English dictation -> completed transcript -> existing answer endpoint -> existing

evaluation/rolling skill state/adaptive selection -> next question -> actual report.

The first question audio includes a short greeting. The question displayed in the

UI remains the engine's question. No scripted question sequence is introduced.



Speech is synthesized for each current question, not a prerecorded interviewer

video. Facial interpolation follows real synthesis cues against the actual audio

clock. Idle head/spine motion, blinking and small listening/idle expressions are

authored animation. They do not indicate candidate emotions. Coarticulation is

approximate viseme blending, not a physically simulated face or actor performance.

Reduced motion stops decorative idle motion; functional speech articulation remains.



## Voice engines and privacy



This Windows machine has Microsoft Zira/David Desktop voices and an en-US

MS-1033-80-DESK dictation recognizer. PowerShell System.Speech generates both audio

and viseme timing from the same synthesis. No cloud key or new npm/Python package

is required. This is a desktop voice, not a neural studio voice.



Local dictation records up to two minutes of mono 16kHz PCM in browser memory.

After five seconds of low input level following detected audio, or Done speaking,

the answer is sent to this backend. The AudioWorklet handles sampling off the UI

thread; the recording is held only for that answer. Speech detection is an audio

level heuristic, not an intent detector. Transcription finishes before evaluation;

the local mode shows a completed transcript rather than streaming partial words.

Blank/low-confidence recognition is rejected. No candidate audio file or transcript

is written by the speech worker; the existing assessment transcript is persisted

as part of the interview. Recording buffers, URLs, worklets and streams are cleaned

up on exit, cancellation, completion and termination.



The dictation engine can clear its input after its final recognition when a clip

ends mid-utterance. The worker now treats that specific end-of-stream condition as

completion and preserves the actual text already recognized. A cut-audio regression

test covers this defect.



Browser speech remains selectable before starting and from recovery controls. It

may send audio to the browser vendor. Browser TTS is the fallback when local

synchronized output is unavailable; the UI explicitly says mouth synchronization

is unavailable in that mode. Local dictation requires Windows and the installed

English recognizer. On other hosts use supported browser speech; synchronized

mouth animation is not claimed for that fallback. `INTERVIEW_SPEECH=browser`

disables local workers for a browser-only deployment. `/health` labels local

speech unprobed until used; it does not claim engine health from OS detection.



## API boundaries



- POST `/interviews/:id/speech`: current question ID only, no arbitrary client TTS

  prompt. Returns ephemeral WAV/visemes and source metadata.

- POST `/interviews/:id/transcribe`: current question ID and bounded WAV input.

  Returns actual recognized text and recognizer confidence.

- Both require account ownership and IN_PROGRESS state, recheck the question and

  state after processing, reject completed/terminated sessions, limit concurrency,

  apply worker/request timeouts and cancel on disconnect. Responses use no-store.

- Recognition never advances the session. Only the existing answer endpoint does.

- 3D failures show a retry control while voice/backend progression remain usable.

- Existing authentication, resume/JD planning, scoring and proctoring policy remain

  the application's source of truth.



## Start the application (PowerShell)



Terminal 1:



```powershell

Set-Location 'D:\AI Mock Interview Platform'

npm run start:api

```



Terminal 2:



```powershell

Set-Location 'D:\AI Mock Interview Platform'

npm run dev:frontend

```



Open http://localhost:5173/. Sign in, upload/analyze a resume, confirm the direction,

build a plan, enter the room and start voice. Local English dictation is the default

when synchronized Windows playback succeeds. Camera monitoring remains separately

consented and uses the existing Python worker. No Python vision service is needed

for avatar rendering or speech. Current API/frontend were restarted/served locally.



Prepare the asset (Blender already installed; source GLB included):



```powershell

powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-3d-assets.ps1 -HumanStudio -Render

python .\scripts\validate-3d-assets.py

```



## Verification



```powershell

npm test -- --maxWorkers=1 --minWorkers=1

npm run build

npm run build:frontend

npm --prefix frontend run lint

$env:VERIFY_PRODUCTION='true'

$env:VERIFY_VISION='false'

npx tsx scripts/verify-voice-room.ts

npx tsx scripts/verify-native-speech.ts

```



- Full regression: 239 tests passed across 45 files; report

  `.browser-verification/part3-tests.json`.

- Real Windows synthesis and actual dictation, including clipped audio, passed.

  API tests cover account ownership, stale question IDs, client-prompt rejection,

  malformed audio and completed-session rejection.

- Production browser room: real GLB/skin/morph rendering, actual WAV playback,

  sampled viseme/audio-clock correspondence, failed-asset retry, test-device streams,

  fullscreen isolation/exit/reentry, no typed answers, empty-speech rejection, two

  adaptive questions, final report and capture/GPU cleanup passed. That harness

  explicitly injects browser recognition events for its answer scenarios.

- Separate no-injection browser probe: generated known speech through Chromium's

  microphone test device -> real AudioWorklet capture -> actual local dictation ->

  actual answer evaluation -> completed interview/report. Six expected technical

  terms matched and one real report evidence entry was checked. Report:

  `.browser-verification/native-audio-checks.json`.

- Native browser-vendor speech was separately tried and returned empty results;

  that path is not claimed verified. Local dictation is the verified alternative.

- Existing landing-page production browser regression checks also passed after

  extending the shared renderer, including its motion, navigation and fallback paths.

- Frontend/backend builds and lint pass. Existing unrelated lint warnings remain.

- Physical microphone/camera accuracy, human listening judgments and physical GPU

  performance are not established by these tests. The camera fixture is synthetic;

  browser rendering uses software WebGL. No live LLM provider was configured/tested

  in this milestone; assessments in these checks use the deterministic provider.



## Files



Runtime: `InterviewRoom.tsx`, `InterviewerVisual.tsx`, `BlenderAssetScene.tsx` and

its CSS; `useInterviewMedia.ts`; new `LocalRecognition.ts`,

`pcm-capture.worklet.js`, `avatar-speech.ts`; `frontend/src/api.ts`;

`src/api/server.ts`; new `src/api/InterviewSpeech.ts`;

`scripts/speech/synthesize.ps1`, `scripts/speech/transcribe.ps1`.



Assets/workflow: `scripts/blender/prepare_interviewer.py`, import-safe

`generate_assets.py`, `generate-3d-assets.ps1`, `validate-3d-assets.py`;

CC0 source/notice/README, prepared `.blend`/preview/GLB and human manifest.

The landing core and earlier abstract studio are preserved.



Verification: `InterviewSpeech.test.ts`, `interviewSpeech.integration.test.ts`,

`verify-voice-room.ts`, `verify-native-speech.ts`. Documentation:

`BLENDER_WORKFLOW.md`, `CINEMATIC_LANDING.md`, this document.



## Technical references



- CC0 model declaration: https://github.com/met4citizen/TalkingHead#setting-up-and-running-the-test-web-app

- SAPI visemes: https://learn.microsoft.com/en-us/dotnet/api/system.speech.synthesis.speechsynthesizer.visemereached

- Browser speech boundaries are word/sentence events, not phonemes:

  https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event



No TalkingHead runtime was added. Its CC0 example asset was prepared for the

existing Three.js renderer. Paid/restricted example avatars were not used.





## Studio refinement - 23 October 2026



The previous camera cropped out the room, the browser rendered no cast shadows,

and pointer input rotated the whole architecture. The prepared Blender room now

includes return walls, a ceiling coffer, inset acoustic panels, shelving, ceramic

objects, reference volumes, a supported desk and notebook. The standing character

retains its existing facial rig; skin texture detail is retained at 2048px.

The browser uses a bounded 1024px soft shadow map, lower ambient fill, and a

wider seated-candidate camera composition. Pointer response moves the camera

slightly instead of rotating the building. Shadow resources are released on exit.

The character remains the existing CC0 human mesh, not a newly scanned actor;

hair, facial geometry and approximate viseme blending still limit photorealism.



A voice coupling defect was also removed: selecting local dictation no longer

requires successful local TTS. A failed playback request must not silently select

browser-vendor recognition. The regression mode below forces HTTP 503 for speech,

then captures real test-device audio, transcribes it through Windows and completes

the real assessment. It does not fabricate recognition callbacks.



```powershell

$env:VERIFY_PRODUCTION='true'

$env:VERIFY_TRANSCRIPTION_WITHOUT_TTS='true'

npx tsx scripts/verify-native-speech.ts

Remove-Item Env:VERIFY_TRANSCRIPTION_WITHOUT_TTS

```



Validation: 239 unit/integration tests passed; backend/frontend builds and GLB

validation passed. Lint completed with existing warnings. Both normal and

playback-unavailable local dictation reached a real report using generated audio

through the browser test microphone. Physical microphone accuracy remains untested.

Run media browser tests sequentially: a concurrent test run timed out acquiring its

test camera. The isolated run is the acceptance check. Proctoring/physical camera

accuracy was not part of this refinement.



Changed sources: `scripts/blender/prepare_interviewer.py`,

`frontend/src/components/BlenderAssetScene.tsx`,

`frontend/src/components/three-runtime.ts`,

`frontend/src/components/useInterviewMedia.ts`,

`scripts/verify-native-speech.ts`, and this document. Regenerated artifacts:

`assets/blender/human-interview-studio.blend`,

`frontend/public/models/human-interview-studio.glb`, and its manifest.



## Live voice capture repair

The baseline generated-audio probe could complete one answer. Inspection found
microphone permission was requested only after question playback, a new capture
context was created on each automatic turn, the microphone control was confined
to the side panel, and no input meter or active-answer repeat control was shown.
Permission now occurs before the backend starts. An AudioContext opened from the
Start button gesture is reused across local capture turns and released on exit.
Per-answer audio nodes and tracks are disconnected when recording stops.
Permission denial leaves the first question unconsumed.

The prominent voice panel shows actual RMS input levels, microphone start/pause,
Speaking/Listening/Processing/AI Speaking states, and Record answer again. Repeating
discards the current recording before evaluation. Local transcripts appear after
recognition; browser-service interim text retains its existing display. Sustained
sound followed by five seconds of quiet ends an answer, with Done speaking for
noisy rooms. Sound-level activity is a heuristic, not proof that input is speech.
Transcription failures show retry controls and do not submit empty answers.

The real-audio browser harness now checks two turns, actual input levels,
discard/re-record, real transcriptions and evaluations, the next spoken backend
question, report data, and track/context cleanup. No recognition results are
injected. Audio comes from a generated fixture through the browser test microphone;
physical microphone and user-accent accuracy remain unverified. Optional recovery
mode simulates one permission denial and one failed transcription request.
Automatic-finish mode appends actual silence and does not press Done speaking.

```powershell
$env:VERIFY_PRODUCTION='true'
$env:VERIFY_VOICE_RECOVERY='true'
$env:VERIFY_AUTO_FINISH='true'
npx tsx scripts/verify-native-speech.ts
Remove-Item Env:VERIFY_VOICE_RECOVERY
Remove-Item Env:VERIFY_AUTO_FINISH
```

Run browser media checks sequentially. Do not rebuild frontend/dist during a
production-preview check: replacing hashed files interrupts lazy report loading.
Changed sources: InterviewRoom.tsx, useInterviewMedia.ts, LocalRecognition.ts,
BlenderAssetScene.css, verify-native-speech.ts and this document. Authentication,
adaptive scoring and Python proctoring implementations are retained.


Final voice acceptance results: 239 tests passed across 45 files; backend and
frontend builds passed. Lint completed with existing warnings. The final native
browser run recovered from simulated permission denial and a simulated HTTP 503,
then completed two actual PCM-to-Windows-dictation-to-assessment turns. It measured
real input levels, repeated a recording without consuming an answer, detected a
five-second quiet period automatically, played the backend follow-up and produced
a report with two evidence entries. All test tracks and capture contexts closed.
Only failure conditions were simulated in this recovery scenario; recognition
results and interview progression were not injected. The question provider for
verification was the configured deterministic development provider, not a tested
external LLM. Evidence is .browser-verification/native-audio-checks.json.

Camera regression repair: the live preview is now revealed immediately after
getUserMedia returns a live stream, before awaiting video.play(). Previously the
video remained display:none until that promise resolved, which allowed browsers
that defer hidden video playback to stall the preview. Failure still stops capture
and displays a retry message; sampled Python vision retains its readiness checks.
The avatar/fullscreen contract harness now prints camera diagnostics on failure.
