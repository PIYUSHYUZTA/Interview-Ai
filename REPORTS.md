# Completed interview reports

The existing React results screen reads `GET /interviews/:id/results`. After the final planned answer is evaluated, the API creates a validated version-1 report snapshot in `.data/reports/<sessionId>.json` (or the configured interview data directory). The same session ID is already linked to the authenticated candidate by `CandidateAuthStore`; all report routes check that ownership before reading the snapshot. Another candidate receives 404. The original transcript, questions, structured evaluations and rolling skill state remain in the existing session store.

Reports survive API restarts and are available from the candidate dashboard. `/interviews/recent` now reads completed sessions rather than relying on a process-local results cache. A report is not regenerated when read, so its original provider, dates, coaching and score remain stable. Report files contain sensitive candidate text and should receive the same storage controls and deletion policy as the interview files. This milestone does not add a background deletion service.

## Completion and dates

`/complete` cannot mark an unfinished plan as complete. Both the session's completed state and an evaluated answer budget for every planned round are required. Incomplete sessions return 409 for final reports; integrity-terminated sessions return 410. Neither receives a fabricated final score. Old sessions previously marked completed without finishing their plan are also rejected.

New sessions record the completion time after their final evaluation. Duration is server elapsed time from session start through that timestamp. For fully completed legacy sessions without an end timestamp, the report clearly labels duration as time through the last recorded answer. API dates are ISO UTC; the browser displays them in local time. New sessions retain both the resume-detected career direction and the interview target role. Legacy reports disclose when the original role detection or provider was not stored.

## Scores and coaching

The existing `ScoringEngine` weights are unchanged: technical 25%, problem solving 25%, communication 15%, logical reasoning 15%, adaptability 10%, delivery 10%. The report preserves their established criterion mappings. It does not invent independent scores for project understanding or behavioral ability when no independent scoring contract exists.

Each scored answer retains its original question, transcript/code/selected option and rubric feedback. The coach links exact transcript excerpts to explicit rubric wording and identifies supported communication omissions: unclear personal contribution, vague wording, no explicit reasoning, and no concrete example. Exact-wording checks may miss synonyms and valid alternatives; an unmatched cue is not labelled proof of an incorrect answer.

Examples are application-authored reference explanations or generated rewrite scaffolds. They are clearly labelled as AI-coach examples produced from deterministic templates, not as live LLM output or something the candidate said. Behavioral/project examples leave placeholders for truthful personal details rather than inventing accomplishments or measurements. Technical reference examples are study aids, not independently executed or guaranteed solutions. The before-and-after coach preserves an actual excerpt and labels suggested wording separately.

The existing gap and roadmap engines determine priority. The detailed roadmap expands only the top five gaps into learning sequences, exercises, implementation tasks, checkpoints, measurable success criteria and question references. Unassessed skills show `null` proficiency, never a fabricated observed score.

## Run and verify

From `D:\AI Mock Interview Platform`, start the usual API and frontend in separate PowerShell terminals:

```powershell
$env:INTERVIEW_PROVIDER = 'deterministic'
npm run start:api
```

```powershell
npm run dev:frontend
```

Verification:

```powershell
npm test
npm run build
npm run build:frontend
npx tsx scripts/verify-report.ts
```

The browser script uses the bundled Playwright runtime and installed Edge, with override variables `PLAYWRIGHT_MODULE_PATH` and `BROWSER_EXECUTABLE`. It completes an authenticated deterministic interview through the real UI/API, checks transcript-specific coaching, inspects mobile overflow, restarts its temporary API, and reopens the unchanged saved report from the dashboard. Test accounts and report artifacts are stored under `.browser-verification/report-data`.
