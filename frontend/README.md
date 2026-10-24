# Interview practice application

Run from `D:\AI Mock Interview Platform` (Node.js 20 or newer).

## Start the existing application

Install dependencies when needed: `npm install` and `npm --prefix frontend install`.

Terminal 1 (PowerShell):

```powershell
$env:INTERVIEW_PROVIDER = 'deterministic'
npm run start:api
```

Terminal 2:

```powershell
npm run dev:frontend
```

Open http://localhost:5173. Vite proxies the API to port 3000. The explicit deterministic
setting overrides automatic credential discovery. This demonstration needs no AI API key.

## Candidate journey

1. Create a candidate account or sign in, then choose **New interview**. Upload PDF/DOCX (browse or drag/drop), paste text, or explicitly select a sample.
2. Review extracted skills, experience, education and projects. Correct the name/source text and re-analyze before proceeding.
3. Select a target role, experience level, interview type, difficulty preference, rounds and questions per round.
   An optional JD takes precedence over the role preset. Example:

   ```text
   Database Engineer
   Required: PostgreSQL, SQL, indexing and transactions.
   ```

4. Build and review the actual backend plan, then enter the interview room and start.
5. Read or play the current question. Type an answer or dictate where supported, review the transcript, and submit.
6. Continue through the backend-controlled rounds. View the completed assessment, scores, skill verdicts, gaps, answer evidence and prioritized roadmap.
7. Return to Overview to see this account's actual sessions and latest assessment. Completed and unfinished session records survive API restarts; continuing an unfinished session after leaving or refreshing is not yet implemented.

The browser submits narrative answers (including reviewed voice transcripts) using `answerMode: "text"`.
The existing backend owns planning, question selection, evaluation, skill updates, adaptation and scoring.
No question arrays or invented scores are used in the UI. Deterministic evaluation is heuristic, not live LLM assessment.
JD and resume analysis use the existing supported taxonomy; extraction does not guarantee every resume field is recognized.
Candidate passwords are stored as salted scrypt hashes. Browser sessions use a 14-day HttpOnly, SameSite=Lax cookie.
Candidate accounts, resume profiles, ownership records and serialized interview sessions persist under the gitignored
`.data/` directory. Set `INTERVIEW_DATA_DIR` to select another local data directory. This file-backed local store
supports a single API process; it is not a substitute for a managed production database or deployment security review.

## Documents and media

- PDF/DOCX limit: 5 MB. PDFs: at most 30 pages. DOCX expanded content: at most 20 MB/1,000 entries.
- Real extraction uses pdf-parse and mammoth on the backend; no uploaded file is saved to disk.
- Scanned PDFs need OCR, which is not implemented. Encrypted/damaged files return errors; paste text as a fallback.
- Camera uses actual `getUserMedia`, stays local, and is not recorded or scored. Turning it off or leaving stops tracks.
- Spoken playback uses browser `speechSynthesis` with the actual session question.
- Dictation uses browser SpeechRecognition/webkitSpeechRecognition where available. It may transmit audio to the browser vendor's speech service. Browser support, permission, network and service availability apply.
- Text mode requires no media permission. Permission denial and speech failures preserve typed/completed transcripts.
- HTTPS or localhost is required for media. Physical-device speech accuracy and audio quality require a manual check.
- Unfinished interviews remain visible in history, but resuming them after leaving/refreshing is not implemented.

## Verification

```powershell
npm test
npm run build
npm run build:frontend
npm run demo
```

API integration tests include real PDF/DOCX fixtures, correction/re-analysis, preferences/plan creation,
malformed/oversized uploads, actual session history, JD/default-role paths and complete interview execution.

With both servers running, use an existing Playwright installation (no new browser-test dependency):

```powershell
$env:PLAYWRIGHT_MODULE_PATH = '<existing Playwright package directory>'
$env:BROWSER_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node scripts/verify-frontend.cjs
node scripts/verify-media.cjs
```

The first script completes PDF/default-role and DOCX/JD interviews, checks network retry, actual returned
question text, results/evidence, dashboard history, mobile overflow, camera toggle and native speech startup.
The second checks real browser permission denial and simulated recognition events for interim/final text,
stale-result rejection, unsupported voice fallback and cleanup on exit. Camera/audio tests use Chromium
synthetic devices. These checks do not prove physical microphone transcription accuracy or audible output.
Screenshots and isolated browser profiles are stored inside `.browser-verification`.

## Landing-page follow-up

The application now opens on a dedicated landing page. **Build my interview** opens setup;
**Workspace** opens the existing dashboard. The workspace brand returns to the landing page.
Entrance, illustration and scroll-reveal animations respect reduced-motion preferences.
Run `node scripts/verify-landing.cjs` with the same browser environment variables above to check
landing navigation, desktop/mobile layouts and reduced-motion behavior.

## Readiness, development and feedback

Role readiness is calculated on the backend from role-weighted existing skill verdicts: meets=1,
partially meets=0.5, gap/unassessed=0. It is an evidence index, not a hiring probability; coverage is shown separately.
Unassessed interviews receive no readiness score. Dashboard development compares the most recent matching
candidate name, provider, role and plan configuration. It does not claim controlled measurement of learning.
Answer feedback uses the five actual rubric scores and never displays provider reasoning traces.
The room offers an opt-in **Read each question aloud** setting. Turn it off to stop automatic playback.

`node scripts/verify-dashboard.cjs` creates two real completed sessions and checks readiness, skill comparison,
history filtering, report feedback and responsive layout. `verify-media.cjs` now also checks automatic playback
and stale speech events with simulated speech APIs. Full checks: 163 tests across 24 files passed on October 15, 2026.

## Requested UI libraries

The interface now uses actual source components from Unlumen UI, Magic UI, SmoothUI and Retro UI / NeoBrutalism.
See [UI_LIBRARIES.md](UI_LIBRARIES.md) for the component mapping, upstream links and license details.
Install with the existing `npm --prefix frontend install` command. No UI API/license key is needed.
Run `node scripts/verify-ui-libraries.cjs` with the same Playwright environment variables to check
keyboard switch operation, reduced motion, the real upload loader and mobile component geometry.
