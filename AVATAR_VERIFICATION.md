# AI interviewer avatar — verification by level

Each level is verified on its own, with evidence that does not depend on the level
below it. Passing one level is never treated as proof of the next. In particular, a
mouth rig (level 2) or a moving mouth (level 3) is not taken as proof of lip sync
(level 4).

Verified 25 October 2026 on Windows 11 with Blender 5.2.3 LTS, Edge headless and
software WebGL (SwiftShader).

## Project inspection (before changes)

| Area | Finding |
| --- | --- |
| Frontend | React 19 + Vite 8, TypeScript. `motion/react` for UI motion. |
| Real-time 3D | Three.js 0.186 (`GLTFLoader`, lazily loaded `three-runtime.ts`). No new rendering framework added. |
| Asset format | glTF binary (`.glb`) from Blender's exporter, served from `frontend/public/models`. |
| Interview room | `InterviewRoom.tsx`, `useInterviewMedia.ts`, `BlenderAssetScene.tsx`. |
| Existing avatar | CC0 MakeHuman/MPFB character (`assets/avatar-source/mpfb.glb`) with skeleton, ARKit face shapes and Oculus visemes. |
| Existing speech | Windows SAPI via `scripts/speech/synthesize.ps1`: WAV plus viseme events. Browser TTS fallback without lip sync. |
| Existing lip sync | One viseme at a time from SAPI cue times against `audio.currentTime`. |

### Blender connection
- **Blender MCP add-on:** not reachable. `localhost:9876` refused the connection, so
  no Blender UI session with the add-on server was running. None of the asset work
  depends on it.
- **Blender command line:** fully working (`D:\blander\blender.exe`, 5.2.3 LTS),
  driven through `scripts/generate-3d-assets.ps1`. Every operation used here works
  in background mode: glTF import, shape-key editing, pose-bone edits, mesh
  cropping/capping, materials, procedural modelling, Cycles rendering, and
  glTF/WebP export.
- To use the live MCP connection instead, start Blender, enable the MCP add-on and
  start its server on port 9876. The scripts also run unchanged in that session.

### Pipeline chosen
Blender (offline) prepares the character, room and hero bust and exports GLB with
skin, morph targets and WebP textures. Three.js renders them in the browser. Live
lip sync is browser code that reads the actual audio clock. Blender is not involved
at runtime.

## Level 1 — completed 3D model ✅
`blender -b --factory-startup --python scripts/blender/verify_avatar_rig.py -- frontend/public/models/human-interview-studio.glb`
plus `python scripts/validate-3d-assets.py`.
- Imports cleanly: 58 meshes, 89,298 triangles, 16 materials.
- Embedded textures: skin 2048², eyes, hair, clothing and teeth at 1024².
- 8.7 MB, under the 15 MB / 100,000-triangle budget. Validator checks the header,
  buffers, skins and SHA256.

## Level 2 — rigged and animated character ✅ (with one stated limit)
The same Blender script applies each control in isolation to the shipped GLB and
measures vertex displacement:
- **Mouth shapes:** `jawOpen` 49 mm; `viseme_aa` 29 mm; `mouthClose` 37 mm;
  `mouthFunnel` 14 mm; `mouthPucker` 10 mm; `mouthStretch` 9 mm; `mouthPress` 11 mm;
  `viseme_PP/FF/O/E/U` 9–14 mm.
- **Other face shapes:** blinks 18 mm; smile 27 mm; `browInnerUp` 6 mm.
- Every shape moves only vertices in the face region, and teeth and tongue follow
  the jaw and viseme shapes.
- **Bones:** `Head` (10°) moves 43,385 vertices with 0 mm lower-body movement.
  `LeftEye`/`RightEye` (12°) move about 500 vertices each.
- **Limit:** the human has **no baked Blender animation clips** (0 actions). Idle
  motion (blinks, saccades, head drift) and speech motion are generated at runtime
  in `avatar-face.ts` and `avatar-speech.ts`. The landing halo and the abstract
  assets do carry baked clips.

## Level 3 — character rendered inside the application ✅
`npx tsx scripts/verify-avatar-levels.ts`
- The room's WebGL renderer reports 176,432 triangles drawn (scene including the
  room).
- The stage screenshot has real detail (`.browser-verification/avatar-level3-render.png`).
- The mouth is at rest (weight 0) before any speech.

## Level 4 — working audio-driven lip synchronization ✅
Same script. Evidence is computed independently in Node from the WAV the server
actually returned, not with the app's own envelope code:
- **Loudness tracking:** jaw opening, sampled on the app's audio clock (317 samples
  over 15.3 s), correlates with WAV loudness at **r = 0.70**. The same samples
  against audio shifted 0.7–1.6 s give **r = −0.04**, so the motion tracks this
  audio rather than looping or moving randomly.
- **Silence alignment:** mid-points of SAPI silence cues fall on silent audio
  (RMS 0.0000 vs 0.1033 in speech cues). Jaw averages 0.001 in silent stretches.
- **Rest:** mouth and jaw return to exactly 0 after speech ends.
- `scripts/verify-avatar-turns.ts` covers turn-taking: pausing freezes the audio
  (1.67 s) and rests the mouth; resuming continues at 1.76 s in sync; interrupting
  stops audio and mouth within 54 ms; replay restarts at 0.32 s.

### Defect found and fixed by this verification
SAPI's `VisemeReached.AudioPosition` drifts later by about 35 ms per event. Cues ran
to 24.95 s on an 18.94 s WAV, so the mouth fell up to ~6 s behind the voice by the
end of long questions. The per-viseme `Duration` values sum exactly to the WAV
length (18.943 s vs 18.942 s), so `synthesize.ps1` now times cues by their running
total. On the old timeline, silence cues fell on audio as loud as speech (ratio
1.11); fixed, the ratio is 0.00. `src/api/InterviewSpeech.test.ts` now asserts real
SAPI cues end inside the WAV. The earlier room verifier missed this because it
compared the app's viseme with a value computed from the same cue list.

## Level 5 — fully integrated with the actual interviewer audio ✅
Same script:
- The adaptive engine's current question (`q-backend-professional-background-0`)
  becomes an authenticated `/speech` request.
- That returns a Windows SAPI WAV (15.30 s, Microsoft Zira Desktop) with 165 cues
  from the same synthesis, all inside the WAV.
- The browser plays it through to 15.30 s with the face sampled on that clock, and
  the caption equals the engine's prompt.
- `scripts/verify-voice-room.ts` covers the complete loop: playback → listening →
  evaluation → adaptive next question spoken with sync → report.

## What is not claimed
- Visual realism was judged only in software WebGL screenshots, not on a physical
  GPU. Natural-looking motion has not been reviewed by a person watching with sound.
- Lip sync is viseme blending plus loudness-driven jaw and lip layers on real SAPI
  timing. It is not a physically simulated face or a neural audio-to-face model.
- Synchronized speech requires Windows SAPI on the API host. Elsewhere the browser
  voice fallback has no lip sync, and the room says so.
- The voice is a desktop SAPI voice, not a neural voice. A neural TTS with phoneme
  or viseme timestamps would be the upgrade path, but it is an external, usually
  paid, service and was not added without approval.
- Candidate speech-to-text in these runs uses an injected recognition contract.
  Live spoken recognition is covered separately by `verify-native-speech.ts` and is
  not claimed here.
- The avatar is a prepared CC0 digital human, not a bespoke photoreal scan.

## Re-run everything
```powershell
.\scripts\generate-3d-assets.ps1 -HumanStudio -Render
& 'D:\blander\blender.exe' -b --factory-startup --python-exit-code 1 --python scripts\blender\verify_avatar_rig.py -- frontend\public\models\human-interview-studio.glb
python scripts\validate-3d-assets.py
npm test
npx tsx scripts\verify-avatar-levels.ts
npx tsx scripts\verify-avatar-turns.ts
npx tsx scripts\verify-voice-room.ts
```
The browser scripts need `PLAYWRIGHT_MODULE_PATH` pointing to a Playwright (or
playwright-core) install, plus Microsoft Edge.
