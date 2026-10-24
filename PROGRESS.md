# Candidate progress and persistent practice

## Storage and compatibility
Completed reports remain immutable JSON snapshots in `INTERVIEW_DATA_DIR/reports` (default `.data/reports`). Candidate ownership and saved resumes remain in `candidates.json`; interview state remains in `interviews`. Progress is derived on demand from owned, fully completed sessions and their saved reports. Incomplete and integrity-terminated sessions have no invented final scores and are excluded from progress.

No database migration or dependency is required. Existing files are read unchanged. The optional `practicePriorities` session configuration field is absent for old sessions and defaults to no historical personalization. Before deployment, stop the API and back up the complete data directory together, including ownership, interviews and report snapshots. Restore the complete backup together if rollback is needed; do not copy reports between accounts or edit snapshot scores.

## Progress rules
`GET /interviews/progress` requires the candidate cookie. The server filters session ownership before loading reports. It returns chronological reports, latest observed skills with date/role/provider/source, repeated demonstrated gaps, latest report learning recommendations and latest owned resume ID. It never accepts a candidate ID or scores from the browser. Current skills can be stale and come from different assessment contexts; source labels expose this. A recurring weakness counts only skills with actual answer samples and a gap verdict in at least two distinct completed interviews. Previously recurring gaps that no longer appear in the latest evidence are labeled accordingly.

The chart groups reports by the existing comparison key (provider, role requirements and interview plan). Score changes describe saved performances, not proof of lasting improvement or a hiring prediction. Skill histories are shown alongside dated report links. Deterministic-provider results remain labeled heuristic demo evaluation.

## Later interviews
Setup retrieves the latest owned resume for review and allows replacement or editing. Resume claims are preserved separately from assessment results. Session creation derives practice priorities from the latest observed gaps or partial verdicts for the same role title and provider. The existing adaptive engine receives these priorities only for skills not yet answered in the new session. Round target skills, difficulty bounds and current-answer adaptive decisions still apply. Historical answers, estimates, confidence and sample counts are never imported into new-session scoring. A changed role or provider gets no carried-over priorities; matching titles with different skills cannot bypass the current round's allowed targets.

## Windows PowerShell
```powershell
Set-Location 'D:\AI Mock Interview Platform'
$env:INTERVIEW_PROVIDER = 'deterministic'
npm run start:api
```
In another terminal at the same directory:
```powershell
npm run dev:frontend
```
Open `http://localhost:5173`, sign in and use Workspace. Complete at least two matching interviews to see a chart. New interview reuses the saved resume for confirmation.

Verification:
```powershell
npm test
npm run build
npm run build:frontend
npm run demo
npx tsx scripts/verify-progress.ts
```
The browser verifier uses installed Edge and the bundled Playwright runtime; `BROWSER_EXECUTABLE` and `PLAYWRIGHT_MODULE_PATH` can override local paths. It uses separate `.browser-verification/progress-data` accounts and sessions, not candidate production history.

## Files changed in Phase 7
- `src/api/CandidateProgress.ts`: chronological progress, current observed profile, recurring gaps and historical practice priorities.
- `src/api/server.ts`: protected progress endpoint, saved-resume text retrieval and server-owned session personalization.
- `src/core/types.ts`, `src/core/session/QuestionSelection.ts`: optional historical priorities passed through the existing adaptive selector without importing prior samples.
- `frontend/src/api.ts`, `frontend/src/types.ts`: typed progress API contract.
- `frontend/src/components/Dashboard.tsx`, `SkillDevelopment.tsx`, `ProgressHistory.tsx`: saved-score chart, historical skill scores, report links, current profile, recurring gaps and recommendations; comparisons use account ownership rather than candidate-name strings.
- `frontend/src/components/ResumeUploadView.tsx`: retrieve and review the latest owned resume for subsequent practice.
- `src/api/auth.integration.test.ts`, `src/core/session/InterviewStateMachine.test.ts`: persistence, ownership, fresh evidence and historical-priority selection coverage.
- `scripts/verify-progress.ts`: actual two-interview browser journey, responsive layout and restart/reopen checks.

Verified: 185 tests in 29 files, backend build, frontend build, deterministic demo and the browser verifier passed. Frontend build retains the existing large-bundle warning. Live external LLM evaluation was not tested. File storage is retained; multi-server deployments would require a separate concurrency/storage design.
