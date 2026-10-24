# UI library integration

This application uses selected, locally installed **source components** from all four requested libraries.
These are real adapted upstream implementations, not CSS imitations or unused package entries.

| Library | Source component | Used in the application | Local adaptations |
| --- | --- | --- | --- |
| [Unlumen UI](https://ui.unlumen.com) | [Switch](https://ui.unlumen.com/r/switch.json) | Interview room: read each question aloud | Scoped CSS, controlled/uncontrolled state correction, reduced motion, existing speech lifecycle |
| [Magic UI](https://magicui.design) | [Blur Fade](https://magicui.design/r/blur-fade.json) | Landing hero and workspace screen transitions | Reduced-motion handling; restrained timing/blur |
| [SmoothUI](https://smoothui.dev) | AI Loader, Siri Orb, AI Core | Resume/dashboard loading, interview evaluation/loading, actual interviewer state and explicitly illustrative landing preview | Scoped CSS, blue/cyan palette, application state mapping, no fake audio amplitude |
| [Retro UI / NeoBrutalism](https://retroui.dev) | [Base UI Button](https://neobrutalism.com/r/base/button.json) | Shared Button across landing, setup, room, dashboard and report | Existing button contract, navy/cyan variants, restrained offset shadows; Base UI semantics retained |

Retro UI's website redirects to NeoBrutalism. Its official repository is https://github.com/neobrutalism/neobrutalism.

## Installation model

The libraries distribute editable source through registries. Reviewed source snapshots are stored in
`vendor-sources/`; adapted application components are in `src/components/vendor/`. Styles use scoped CSS
instead of adding a global Tailwind reset. Runtime dependencies are `motion`, `@radix-ui/react-switch`,
`@base-ui/react`, and `class-variance-authority`. React 19 and the existing Vite/backend architecture remain.
No paid templates or licensed Pro components were downloaded, and no UI license key is needed.

## Provenance and licensing

Registry sources were retrieved October 15, 2026. `vendor-sources/manifest.json` records source URLs and SHA-256 hashes.

- Magic UI: MIT, notice in `vendor-sources/magic-LICENSE.txt`.
- SmoothUI: MIT, notice in `vendor-sources/smooth-LICENSE.txt`.
- Retro UI / NeoBrutalism: MIT, notice in `vendor-sources/retro-LICENSE.txt`.
- Unlumen: free component under its [application-use license](https://unlumen-ui-docs.vercel.app/docs/license).
  Use and modification inside a finished application is permitted. The component must not be extracted,
  resold or redistributed as a standalone component, registry or UI kit. This project is an interview application.
  Unlumen retains ownership of its original component. No claim of original authorship is made.

The orb reflects actual idle, listening, speaking, evaluating, error and completed states. It is a state
visualization, not an audio-level meter. Existing camera capture, speech recognition, speech synthesis,
answer submission, adaptive selection and deterministic scoring are unchanged.

## Verification

Use the startup and test commands in `README.md`. Browser checks are in the root `scripts/` directory.
The bundle includes the requested libraries; production size is about 147 KB gzip JavaScript and 10 KB gzip CSS.
The frontend production dependency audit reports zero known vulnerabilities at verification time.
