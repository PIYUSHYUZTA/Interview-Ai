# Live human interview studio — Part 3

## Part 6 — full facial rig, turn-taking and room controls

Level-by-level verification (model → rig → rendered → audio-driven → integrated)
and the SAPI cue-timing fix are documented in [AVATAR_VERIFICATION.md](AVATAR_VERIFICATION.md).
Cue times are now the running total of SAPI viseme durations, which match the WAV
exactly; the reported `AudioPosition` drifted about 25–30% late.

### Avatar preparation (Blender, offline)
`prepare_interviewer.py` now keeps, besides the 15 Oculus visemes, the ARKit shapes
`jawOpen`, `mouthClose`, `mouthFunnel`, `mouthPucker`, `mouthStretchLeft/Right`,
`mouthPressLeft/Right`, blinks, smile and `browInnerUp`. Gaze uses the rig's
`LeftEye`/`RightEye` bones; head motion uses `Head`. Textures export as WebP, so
the room GLB fell from 14.5 MB to 8.7 MB despite the extra shapes. The validator
now requires the jaw and lip shapes.

### Runtime pipeline (browser)
1. The engine's current question → authenticated `/speech` → Windows SAPI WAV plus
   timestamped visemes from the same synthesis (`scripts/speech/synthesize.ps1`).
2. The WAV plays in an `HTMLAudioElement`; `audio.currentTime` is the only clock.
3. `avatar-speech.ts` blends the cues (handover and anticipation) and computes a
   10 ms loudness envelope from the WAV's PCM samples.
4. `avatar-face.ts` layers jaw opening (viseme openness × loudness), lip rounding
   (O/U), stretching (E/I) and pressing (PP) on the visemes.
5. When audio ends, pauses or is interrupted, mouth shapes ease to rest over 400 ms.
6. Idle life: blinks at random 1.8–5.8 s intervals with occasional doubles, eye
   saccades that mostly return to the candidate, and layered head drift with
   incommensurate frequencies. All of it is authored behaviour, not a reading of
   the candidate. Reduced motion stops idle head and eye motion; speech articulation
   continues.

Blender prepares assets only. Live lip sync runs in Three.js in the browser.
**External dependency:** synchronized speech needs Windows with System.Speech
(SAPI) voices on the API host. Elsewhere the browser-voice fallback plays without
lip sync, and the room says so.

### Room controls and truthful state
The avatar comes first, then the live state and the question caption, then one
control bar:
- Microphone: Start / Pause microphone. While the interviewer speaks this becomes
  **Interrupt and answer**: question audio and mouth animation stop before the
  microphone opens.
- **Pause / Resume interview**: pausing mid-question keeps the WAV position, and
  resuming continues the same synchronized playback. Pausing while listening stops
  capture.
- **Replay question** is always available outside processing.
- End: **Exit interview** in the toolbar, with confirmation.
- Progress: the toolbar's round and answer count plus a thin progress bar.
- An optional **Conversation so far** panel lists evaluated questions and answers.
- State labels: "AI Speaking" only after the audio's `playing` event; "Listening"
  or "You are speaking" only while capture is active (the latter from measured
  input level); "Processing" only during transcription or evaluation; "Interview
  paused" only after the candidate pauses.

Voice barge-in (interrupting by speaking over the interviewer) is not enabled. The
microphone stays closed during playback so the interviewer's own voice is never
transcribed. Interrupting is an explicit control.

Verification (25 October 2026): `scripts/verify-avatar-turns.ts` passed with real SAPI
audio. Jaw opening reached 0.17 during speech; pausing froze audio at 1.67 s and
resuming continued at 1.76 s; interrupting stopped audio and mouth within 54 ms;
replay restarted from the beginning; the mouth returned to rest after the natural
end; gaze varied. `verify-voice-room.ts` and the landing verifier passed, and 245
unit/integration tests passed.

## Part 5 — cinematic room and coarticulated lip sync

Framing: the room camera is now framed from the rig's `Head` joint as a
conversational medium close-up (head to upper chest, 28° lens), so the
synchronized mouth is readable. The camera still offsets slightly with the pointer.

Room: architecture uses dark titanium and charcoal ceramic instead of bright
metal. Cerulean appears only as emissive reveals and a fine halo behind the head,
with one Neon Rose arc, echoing the landing hero. Human scenes use AgX tone
mapping with a soft neutral key (with shadows), a Cerulean rim and a Neon Rose
kicker. Regenerate with `generate-3d-assets.ps1 -HumanStudio -Render`.

Lip sync (`frontend/src/components/avatar-speech.ts`), still driven by the SAPI
WAV's own viseme cues against `audio.currentTime`:
- Coarticulation: each cue fades in over 60 ms while the previous shape fades out,
  and the next shape is anticipated at up to 40% in the 45 ms before its cue.
- Loudness: the browser computes a 10 ms RMS envelope from the same 16-bit PCM WAV
  bytes it plays (no Web Audio routing, so playback cannot be muted by it). Open
  vowels (aa, E, I, O, U) scale with loudness; closures (PP, FF, TH…) keep full
  weight so lips still meet on quiet consonants. Non-PCM audio skips the envelope.
- `data-viseme` still reports the active cue for the room verifier.
This is approximate viseme blending against real synthesis timing, not a
physically simulated face.

Phones: during an active interview the room is one column and the candidate
self-view floats bottom-right as a video-call picture-in-picture, so it stays
visible while monitoring details read in flow.

Verification (25 October 2026): `scripts/verify-voice-room.ts` passed with real SAPI
audio and visemes; 243 unit/integration tests passed, including
`src/api/avatarSpeech.test.ts` (envelope, handover, anticipation and loudness
shaping). Screenshots use software WebGL; physical-GPU rendering and live human
listening were not evaluated.



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
