# Blender asset workflow

Blender is integrated through its Python command-line API. No running Blender UI,
MCP extension, cloud account, or API key is required. The detected installation is
Blender **5.4.0 Alpha**, hash `7a8f04b3bb5a`, under:

`D:\blender-5.4.0-alpha+main.7a8f04b3bb5a-windows.amd64-release\blender-5.4.0-alpha+main.7a8f04b3bb5a-windows.amd64-release\blender.exe`

This is an alpha build, so retain the script and exported GLBs when changing
Blender versions. A stable Blender version has not been tested in this environment.

## Generate and validate

From Windows PowerShell:

```powershell
Set-Location 'D:\AI Mock Interview Platform'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-3d-assets.ps1 -Render
python .\scripts\validate-3d-assets.py
```

The launcher checks `BLENDER_EXECUTABLE`, PATH, Blender Foundation under Program
Files, and portable `D:\blender*` directories. To select an installation:

```powershell
.\scripts\generate-3d-assets.ps1 -BlenderPath 'C:\path\to\blender.exe' -Render
```

Omit `-Render` to export models without CPU preview rendering. The launcher starts
an isolated background process with `--factory-startup` and `--python-exit-code 1`.
It does not modify an open Blender document. Generation overwrites only its two
named source/export files and manifest. Blender preferences are changed only in
that process, with file previews and backup versions disabled.

## Assets and provenance

`scripts/blender/generate_assets.py` authors both assets from original procedural
geometry and six brand-color materials. No downloaded model, texture, portrait,
biometric data, or paid generator is used.

| Asset | Editable source | Web export | Triangles | Export size |
| --- | --- | --- | ---: | ---: |
| Intelligence core | `assets/blender/intelligence-core.blend` | `frontend/public/models/intelligence-core.glb` | 16,688 | approximately 363 KB |
| Interview studio | `assets/blender/interview-studio.blend` | `frontend/public/models/interview-studio.glb` | 11,400 | approximately 235 KB |

Each source includes materials, lights, a camera and a looping object animation.
`-Render` writes `*-preview.png` beside the sources using Cycles, CPU, 32 samples.
GLBs contain geometry, materials and animation; cameras/lights stay in the source.
The browser supplies its own inexpensive studio illumination and generated
reflection environment. Architectural reflection intensity is reduced in the viewer
to retain the dark brand surface. No external textures or decoders are required. The core uses a charcoal faceted
body, machined titanium rings, bronze structural ribs, teal inlays and small amber
details. Three thin optical blades export real `KHR_materials_transmission`
glass with IOR 1.45. Transmission adds a rendering pass; drawing remains bounded
by the same frame/resolution limits.

`frontend/public/models/manifest.json` records Blender version, byte counts,
triangle budgets and SHA256 hashes. Generation rejects assets over 30,000 triangles
or 2 MB each. The validator reads the actual GLB headers, JSON, embedded buffer
ranges, required nodes, animation channels, topology, byte counts and hashes.
Unused UV coordinates are excluded. Hashes certify an individual export; Blender
may vary internal triangulation or accessor ordering between builds, so binary
identity across regeneration is not promised.

## Frontend connection

`LandingPage` mounts `BlenderAssetScene` with the intelligence-core GLB. The real
`InterviewRoom` now mounts the prepared CC0 human studio through `InterviewerVisual immersive`; the earlier abstract studio is retained as an asset. See `INTERVIEW_STUDIO.md` for the active human rig, speech pipeline and preparation commands. Smaller
marketing previews keep their existing lightweight visual.

The viewer lazily loads Three.js **0.186.1**, GLTFLoader and the asset when visible.
Type definitions are pinned to **0.186.0**. The named `three-runtime.ts` exports
keep unused Three.js features out of the bundle. The current frontend build has
no chunk-size warning. Blender is needed only to regenerate; the website serves
the checked-in GLBs without starting Blender or Python vision.

The core uses an entrance dolly and gentle pointer-responsive camera drift; the
studio retains its fixed framing. Rendering is capped at 30 fps, up to 1.25 pixel density and a
900-pixel maximum drawing-buffer side. Hidden/offscreen scenes stop rendering.
Reduced motion and the landing pause control stop animation. Resize, failed
fetch/parse, a 15-second asset timeout, missing WebGL2, context loss/recovery,
unmount and media preference changes are handled. Cleanup aborts pending fetches,
stops frames, removes observers/listeners and disposes meshes, materials,
environment maps and renderer resources. Static SVG remains usable on failure.

The abstract studio figure has named `HeadPivot` and `VoiceAperture` nodes. Its
idle animation comes from Blender. Listening and speaking movement follows the
existing application's actual voice phases. Speaking begins from the native TTS
playback callback; it does not imply generated human facial performance. The
speaker aperture is an activity animation, not phoneme lip sync or an audio-level
measurement. This milestone does **not** implement a photoreal human, a facial rig,
visemes, emotion inference, new speech recognition, or a new live LLM provider.

## Start the application

Use separate terminals:

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run start:api
```

```powershell
Set-Location 'D:\AI Mock Interview Platform'
npm run dev:frontend
```

Open `http://localhost:5173/`. The existing Python proctoring worker remains
managed by the backend on consented monitoring requests.

## Verification commands

```powershell
python .\scripts\validate-3d-assets.py
npm run build:frontend
npm run build
npm --prefix frontend run lint
npm test -- --maxWorkers=1 --minWorkers=1
npx tsx .\scripts\verify-cinematic-landing.ts
$env:VERIFY_VISION = 'false'
$env:VERIFY_PRODUCTION = 'true'
npx tsx .\scripts\verify-voice-room.ts
```

Browser checks use the installed Edge executable and bundled Playwright runtime;
`BROWSER_EXECUTABLE` and `PLAYWRIGHT_MODULE_PATH` can override those paths. They
need permission to create temporary browser profiles and localhost servers.
The landing check uses actual software WebGL2, asset loading and animations,
pointer rotation, pause, context recovery, missing-asset/static fallback, responsive
layouts, existing navigation and optional sound. The voice check exercises the
actual loaded studio and TTS-driven speaking/listening phases through a completed
deterministic interview. It uses browser test devices and **injected recognition
results**, so it does not establish real microphone transcription accuracy or
physical camera/speaker behavior. Software WebGL is not a physical GPU benchmark.

Verified on 22 October 2026: both actual Blender CPU renders and GLB validation
passed; 234 application tests across 43 files passed; frontend/backend builds and
frontend lint passed (existing lint warnings remain). The production landing
browser check passed animation, interaction, context recovery, missing-model
fallback and responsive checks with no page errors. The production voice-room
check passed actual GLB rendering, TTS-triggered speaker animation, listening
state, adaptive next question, completed assessment and media cleanup. Screenshots
are in `.browser-verification/cinematic-*` and `voice-immersive-*`. Normal development
servers responded HTTP 200 on frontend port 5173 and API port 3000.

Changed frontend files: `BlenderAssetScene.tsx`, `BlenderAssetScene.css`,
`three-runtime.ts`, `LandingPage.tsx`, `InterviewerVisual.tsx`, `InterviewRoom.tsx`,
`frontend/package.json` and its lockfile. Workflow/verification files:
`scripts/generate-3d-assets.ps1`, `scripts/blender/generate_assets.py`,
`scripts/validate-3d-assets.py`, `scripts/verify-cinematic-landing.ts`,
`scripts/verify-voice-room.ts`, `CINEMATIC_LANDING.md`, this document, and the
generated `.blend`, preview PNG, GLB and manifest files listed above.

The dependency audit reports existing Vite/source-map-js development advisories;
neither Three.js nor its type package is implicated. No unrelated framework or
toolchain upgrade is included in this asset integration.

API references: [Blender glTF exporter](https://docs.blender.org/api/5.0/bpy.ops.export_scene.html),
[Three.js renderer](https://threejs.org/docs/pages/WebGLRenderer).

## Human interviewer (Part 3)

The active room uses `human-interview-studio.glb` (approximately 11.8 MB,
83,902 triangles). It includes a CC0 MPFB/MakeHuman avatar, embedded reduced
textures, a skeleton and Oculus/ARKit facial morphs. Natural skin and eye maps
are retained. The architecture and clothing are prepared in Blender. The previous
30,000-triangle/2 MB budget applies to the two original abstract assets; the human
has an explicit 100,000-triangle/15 MB budget checked by the same validator.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-3d-assets.ps1 -HumanStudio -Render
python .\scripts\validate-3d-assets.py
```

`assets/avatar-source/NOTICE.md` records provenance, license and source hash.
The preparation script exports the relaxed current pose as the joint rest pose;
exporting the original rest pose caused the first web preview to spread its arms.
The human manifest records source/export hashes. Runtime animation uses the rig
and facial blendshapes; no prerecorded video or animation clip substitutes for
spoken interaction. Full workflow and verification are in `INTERVIEW_STUDIO.md`.
