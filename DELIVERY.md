# Delivery — premium 3D landing page and realistic AI interview room

Scope for this phase: the landing page and the interview room only. No other
platform features were added. The existing account, resume, adaptive-question,
evaluation, proctoring and report flows are preserved, and their test suite still
passes. Detailed evidence for the avatar is in
[AVATAR_VERIFICATION.md](AVATAR_VERIFICATION.md).

## 1. Blender assets (editable sources)

| File | What it is | Produced by |
| --- | --- | --- |
| `assets/blender/hero-bust.blend` | **New.** CC0 interviewer cropped and capped as a portrait bust; original orbital halo; Cerulean rim and Neon Rose kicker; Cycles camera. | `scripts/blender/prepare_hero_bust.py` |
| `assets/blender/human-interview-studio.blend` | **Modified.** Interviewer with jaw, lip and expression shapes kept; dark titanium/charcoal studio; Cerulean halo with one Neon Rose arc. | `scripts/blender/prepare_interviewer.py` |
| `assets/blender/intelligence-core.blend`, `interview-studio.blend` | **Regenerated** in the new palette (the core is no longer the hero). | `scripts/blender/generate_assets.py` |

Source character: `assets/avatar-source/mpfb.glb` (CC0, see `NOTICE.md`). It is
unchanged; every prepared asset is derived from it by script.

## 2. Exported 3D files (`frontend/public/models/`)

| File | Size | Triangles | Used by |
| --- | ---: | ---: | --- |
| `hero-bust.glb` | 4.1 MB | 72,741 | Landing hero (skinned, blink/smile shapes, halo animation clip) |
| `hero-bust-poster.webp` | 70 KB | — | Landing fallback (Cycles render) |
| `human-interview-studio.glb` | 8.7 MB | 89,218 | Interview room (skeleton, 15 visemes, 13 ARKit shapes, WebP textures) |
| `intelligence-core.glb`, `interview-studio.glb` | 0.36 / 0.24 MB | 16,688 / 11,400 | Retained abstract assets |

Receipts with hashes: `manifest.json`, `hero-bust-manifest.json`,
`human-interviewer-manifest.json`.

## 3. Application changes

**Design system.** Jet Black `#0A0A0A` dominates; Cerulean `#007BA7` is used for
structure, light and interaction; Neon Rose `#FF2D95` for selective emphasis.
Text is neutral `#EDEDED`. Tints are derived from the two darker colors. Applied
across `index.css`, `product-design.css`, `candidate-product.css`,
`LandingPage.css`, `BlenderAssetScene.css`, the shaders and the Blender palette.

**Landing page.** `LandingPage.tsx`, `LandingPage.css`, `BlenderAssetScene.tsx`,
`three-runtime.ts`:
- **Hero:** the lit human-bust hero with a Cerulean/Rose halo, AgX tone mapping,
  camera entrance and drift, pointer turn, blinks and eye saccades, plus pause and
  reduced-motion support.
- **Copy and sections:** headline "Interview practice that feels real.", primary
  CTA *Start Your Interview*, secondary *Explore the Platform*. New feature
  section for voice, adaptive questions and actionable feedback. "Features" added
  to the navigation and footer.
- **Fallbacks:** a poster image for data-saver, low-memory or low-core devices, for
  sustained frame rates under about 12 fps, and when WebGL or the model download
  fails.
- **Layouts:** a stacked layout for portrait tablets.

**Interview room.** `InterviewRoom.tsx`, `useInterviewMedia.ts`,
`BlenderAssetScene.tsx`, `avatar-speech.ts`, new `avatar-face.ts`,
`candidate-product.css`, `scripts/speech/synthesize.ps1`:
- **Layout:** medium close-up framed from the head joint; the avatar first, then
  the live state and caption, then one control bar.
- **Controls:** microphone (with *Interrupt and answer* while the interviewer
  speaks), *Pause/Resume interview* (resumes the same WAV in sync), *Replay
  question*, *Exit interview*, the progress bar, and an optional *Conversation so
  far* panel.
- **Phones:** a one-column layout with a floating picture-in-picture self-view.
- **Lip sync:** viseme coarticulation, a WAV loudness envelope, a jaw/lip
  articulation layer, an eased return to rest, and randomized blinks, saccades and
  head drift.
- **Fixed:** SAPI viseme timing now uses cumulative durations (it previously
  drifted ~25–30% late), and opening the microphone during playback now stops the
  question audio first.

**Verification added.**
- `scripts/blender/verify_avatar_rig.py`: levels 1–2.
- `scripts/verify-avatar-levels.ts`: levels 3–5.
- `scripts/verify-avatar-turns.ts`: pause, resume, interrupt, replay, rest pose and
  end interview.
- `src/api/avatarSpeech.test.ts` and an extended `InterviewSpeech.test.ts`.
- The landing verifier now includes a low-power check.

## 4. Blender → application pipeline

```
assets/avatar-source/mpfb.glb (CC0)
   │  Blender 5.2.3 LTS, background mode (generate-3d-assets.ps1 → scripts/blender/*.py)
   │  • pose arms, keep viseme + ARKit shapes, crop/cap (hero), restyle materials
   │  • procedural room/halo geometry, palette materials, lights, Cycles poster
   ▼
assets/blender/*.blend  (editable)  ──export glTF 2.0 (.glb, skin + morph targets + WebP)──►  frontend/public/models/*.glb
   │                                                                                         │
   │  validate-3d-assets.py · verify_avatar_rig.py (Blender measures every shape/bone)       │
   ▼                                                                                         ▼
Three.js GLTFLoader (lazy) in BlenderAssetScene.tsx ── renders hero / room, drives morphs and bones each frame
   ▲
   │  audio.currentTime + cue timeline + WAV loudness  (avatar-speech.ts, avatar-face.ts)
   │
Interview engine question → POST /interviews/:id/speech → synthesize.ps1 (Windows SAPI: WAV + viseme durations)
```

Blender is used offline only and is not needed at runtime. The live Blender MCP
add-on was not running (port 9876 refused the connection); the Blender command
line performs every operation above.

## 5. Startup and testing (verified on this machine, 25 October 2026)

Project folder: `D:\codes\interview ai\Interview-Ai-main\Interview-Ai-main`.
Requires Node ≥ 20 (tested on 24.11).

```powershell
Set-Location 'D:\codes\interview ai\Interview-Ai-main\Interview-Ai-main'
npm install
npm --prefix frontend install
$env:INTERVIEW_PROVIDER = 'deterministic'
npm run start:api
```

In a second terminal:

```powershell
Set-Location 'D:\codes\interview ai\Interview-Ai-main\Interview-Ai-main'
npm run dev:frontend
```

Open `http://localhost:5173`. Both commands were started and the landing page and
interview room were checked in a real browser on an NVIDIA RTX 4060 (Direct3D 11).

Optional camera monitoring needs `.venv-proctoring` (Python 3.13 with
`requirements-proctoring.txt`). It was created here through `uv`, because the
machine's Python 3.14 cannot install the pinned packages.

Tests and checks:

```powershell
npm test                                   # 245 tests (incl. real SAPI synthesis on Windows)
npm run build; npm run build:frontend
python scripts\validate-3d-assets.py
& 'D:\blander\blender.exe' -b --factory-startup --python-exit-code 1 --python scripts\blender\verify_avatar_rig.py -- frontend\public\models\human-interview-studio.glb
$env:PLAYWRIGHT_MODULE_PATH = '<path to node_modules\playwright-core>'
npx tsx scripts\verify-cinematic-landing.ts
npx tsx scripts\verify-avatar-levels.ts
npx tsx scripts\verify-avatar-turns.ts
npx tsx scripts\verify-voice-room.ts
```

Regenerate assets:

```powershell
.\scripts\generate-3d-assets.ps1 -BlenderPath 'D:\blander\blender.exe' -Render
.\scripts\generate-3d-assets.ps1 -BlenderPath 'D:\blander\blender.exe' -HumanStudio -Render
.\scripts\generate-3d-assets.ps1 -BlenderPath 'D:\blander\blender.exe' -HeroBust -Render
```

## 6. Status

### Completed and verified
- Palette applied across landing and room; Blender assets regenerated in it.
- **Landing page:**
  - The hero renders with real WebGL (RTX 4060).
  - Navigation, both CTAs and all anchors work.
  - Layouts verified at 1440 px, 1366 px, 1024 px, portrait tablet 820 px, and
    390 px and 320 px phones.
  - Reduced motion stops drawing.
  - Context loss and recovery work.
  - Fallbacks verified for missing WebGL, a missing model and low-power devices.
- **Avatar levels 1–5:** model, rig, in-app render, audio-driven lip sync and
  integration with real interviewer audio, each checked independently
  (`AVATAR_VERIFICATION.md`).
- **Interview room behaviour:**
  - The mouth is at rest when idle.
  - Pause freezes audio and rests the mouth; resume continues in sync.
  - Interrupt stops audio and mouth within 54 ms and opens the microphone.
  - Replay restarts in sync.
  - The mouth eases to rest after speech ends.
  - Exit ends all tracks and audio.
  - Status labels appear only while the state is real.
- SAPI cue-drift defect found and fixed, with a regression test.

### Simulated or authored (not measured from a person)
- Idle blinks, eye saccades and head drift are authored, randomized behaviour.
  They never describe the candidate.
- The landing hero's floating "conversation" and waveform panels are illustrative
  and labelled on the page.
- In automated runs, candidate speech recognition uses an injected recognition
  contract, and Chromium's fake camera and microphone stand in for devices.

### Blocked
- **Live Blender MCP connection:** Blender was not running with the add-on server.
  Asset work used the Blender command line instead.

### Not verified
- How natural the motion looks when a person watches the avatar with sound.
- Frame rate in a visible foreground window on physical hardware. The ~51 ms
  frame interval was measured in a hidden, throttled browser pane.
- Live spoken recognition in these runs (covered separately by
  `verify-native-speech.ts`, which was not re-run here).
- Browsers other than Edge/Chromium; macOS and Linux hosts.

## 7. Remaining requirements for higher-fidelity real-time lip sync

Audio-driven lip sync works today. It is driven by the actual SAPI audio clock,
timing and loudness, and verified at level 4. To go beyond it:
1. **Cross-platform speech with timing.** SAPI exists only on Windows. Another host
   needs a TTS engine that returns phoneme or viseme timestamps with the audio
   (for example a neural cloud TTS with viseme events). This is an external,
   usually paid, service and needs approval and keys.
2. **A more natural voice.** Zira is a desktop voice. The same neural TTS would
   improve both the voice and the timing detail.
3. **Voice barge-in.** Interrupting by speaking over the interviewer needs a
   microphone that is open during playback, with echo cancellation verified on real
   speakers. Interruption is currently an explicit control.
4. **Finer facial fidelity.** An audio-to-blendshape model (for example a
   NVIDIA Audio2Face-style service), or a bespoke scanned character with a denser
   facial rig, would add effects that viseme blending can't, such as cheek and
   tongue dynamics. Both are external tools or assets.
