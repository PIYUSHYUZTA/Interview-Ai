import { SetupStage } from './SetupStage';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'motion/react';
import { usePrefersReducedMotion } from '../design-system/motion';
import { playSound } from './sound/sound';
import type { InterviewCreateResponse, InterviewPreferences, ResumeUploadResponse, SetupOptions } from '../types';
import { createInterview, getCurrentCandidate, getResume, getSetupOptions, uploadResume, uploadResumeFileWithProgress } from '../api';
import { CheckDrawIcon, Icon, SearchIcon } from './icon/Icon';
import { ArrowRight, Check, CloudUpload, FileText } from './icon/icons';
import { Button, Card, ErrorNotice, Loading, Status, labelFor } from './ui';
const SAMPLE_RESUMES = {
  senior_backend: `Alex Morgan
Senior Backend Engineer
alex.morgan@example.com

SUMMARY
Backend engineer with 6 years of hands-on experience designing and scaling
high-traffic services in Node.js and PostgreSQL.

EXPERIENCE
Senior Backend Engineer, Fintech Co — 2022 - present
- Led design and delivery of an idempotent payments API (Express, Redis).
- Scaled Postgres from 2M to 40M rows; introduced partitioning and indexing.
- Built a Kafka-based event pipeline for audit and analytics.
- Mentored 3 engineers; ran code reviews and roadmap planning for the team.

Backend Engineer, SaaS Labs — 2019 - 2022
- Built REST APIs and a queue-based job system (Node.js, RabbitMQ).
- Improved CI/CD with GitHub Actions and Docker; cut deploys to 10 minutes.
- Introduced unit and integration testing (Jest), raising coverage to 85%.

PROJECTS
- Payments audit service: real-time transaction ledger with idempotency.
- Insights pipeline: ETL with Apache Spark and dbt modeling.`,

  ml_engineer: `Priya Patel
Machine Learning Engineer
priya.patel@example.com

SUMMARY
ML engineer with 3 years of experience building and shipping recommendation
and ranking systems in Python.

EXPERIENCE
Machine Learning Engineer, ShopCo — 2021 - present
- Built a machine-learning recommendation system that suggests products.
- Scaled inference latency down to under 50ms using ONNX Runtime.
- Ran offline evaluation on historical logs before every rollout.

PROJECTS
- Recommendation system: collaborative filtering on purchase history with vector search.`,
};


type VoiceMode = 'local' | 'browser';
const DIFFICULTY = [
  { value: '', title: 'Adaptive', detail: 'Follows your experience and answers' },
  { value: '2', title: 'Foundational', detail: 'Core concepts first' },
  { value: '3', title: 'Balanced', detail: 'A steady mix' },
  { value: '4', title: 'Challenging', detail: 'Depth and edge cases' },
];
const LEVELS: Record<string, string> = { '': 'From my résumé', junior: 'Early career', mid: 'Mid-level', senior: 'Senior' };

/** One numbered configuration group in the setup panel. */
function ConfigGroup({ index, title, hint, children }: { index: string; title: string; hint?: string; children: ReactNode }) {
  return <section className="su-group" aria-labelledby={`su-group-${index}`}>
    <header><span className="su-group-index" aria-hidden="true">{index}</span><h3 id={`su-group-${index}`}>{title}</h3></header>
    {hint && <p className="su-group-hint">{hint}</p>}
    {children}
  </section>;
}

/** Selection tiles: a native radio group (arrow keys, one tab stop) presented as cards with a check mark. */
function ChoiceTiles({ name, label, value, options, onChange }: { name: string; label: string; value: string; options: { value: string; title: string; detail?: string }[]; onChange: (value: string) => void }) {
  return <div className="su-tiles" role="radiogroup" aria-label={label}>
    {options.map((option) => <label key={option.value || 'default'} className="su-tile" data-checked={value === option.value ? '' : undefined}>
      <input className="su-tile-input" type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => { onChange(option.value); playSound('toggle'); }} />
      <span className="su-tile-check" aria-hidden="true"><Icon icon={Check} /></span>
      <strong>{option.title}</strong>
      {option.detail && <small>{option.detail}</small>}
    </label>)}
  </div>;
}

interface ResumeUploadViewProps { onInterviewPrepared: (session: InterviewCreateResponse, voice: { recognitionMode: VoiceMode }) => void; initialPreset?: string }
export function ResumeUploadView({ onInterviewPrepared, initialPreset }: ResumeUploadViewProps) {
  const [text, setText] = useState(initialPreset ? SAMPLE_RESUMES[initialPreset === 'ml_engineer' ? 'ml_engineer' : 'senior_backend'] : '');
  const [name, setName] = useState(initialPreset === 'ml_engineer' ? 'Priya Patel' : initialPreset ? 'Alex Morgan' : '');
  const [mode, setMode] = useState<'upload' | 'text'>(initialPreset ? 'text' : 'upload');
  const [profile, setProfile] = useState<ResumeUploadResponse | null>(null);
  const [options, setOptions] = useState<SetupOptions | null>(null);
  const [preferences, setPreferences] = useState<InterviewPreferences>({ rolePreset: initialPreset === 'ml_engineer' ? 'data' : 'backend', interviewType: 'full', questionsPerRound: 3 });
  const [jd, setJd] = useState('');
  const [rounds, setRounds] = useState(4);
  const [stage, setStage] = useState(1);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState('');
  const [uploadStage, setUploadStage] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [clarifiedRole, setClarifiedRole] = useState<InterviewPreferences['rolePreset'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<InterviewCreateResponse | null>(null);
  const [dirty, setDirty] = useState(false);
  const [voice, setVoice] = useState<VoiceMode>('local');
  const reduced = !!usePrefersReducedMotion();
  const fileInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const loadOptions = () => { setError(null); getSetupOptions().then(setOptions).catch((e) => setError(e.message)); };
  useEffect(loadOptions, []);
  const acceptProfile = (result: ResumeUploadResponse) => {
    setProfile(result); setText(result.extractedText ?? result.resumeText ?? text); setName(result.candidateName); setDirty(false); setPlan(null);
    const detected = result.careerPath?.recommendedRoleId;
    if (detected) {
      setPreferences((prev) => ({ ...prev, rolePreset: detected }));
      setClarifiedRole(result.careerPath?.needsClarification ? null : detected);
    }
  };
  useEffect(() => {
    if (initialPreset) return;
    let active = true;
    setBusy('Loading your saved profile…');
    getCurrentCandidate().then(async (candidate) => {
      const id = candidate.resumes[0]?.resumeId;
      if (id) { const saved = await getResume(id); if (active) acceptProfile(saved); }
    }).catch((e: Error) => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(''); });
    return () => { active = false; };
  }, []);
  const readFile = async (file?: File) => {
    if (!file || busy) return;
    const attempt = ++generation.current;
    setError(null); setBusy('Processing your resume…'); setUploadStage('Reading your file'); setUploadProgress(0); setProfile(null); setPlan(null);
    try {
      const result = await uploadResumeFileWithProgress(file, ({ stage, percent }) => {
        if (attempt !== generation.current) return;
        setUploadStage(stage === 'reading' ? 'Reading your file' : stage === 'uploading' ? 'Uploading securely' : 'Extracting text and analyzing experience');
        setUploadProgress(percent);
      });
      if (attempt !== generation.current) return;
      acceptProfile(result); setFileName(file.name);
    }
    catch (e) { setError((e as Error).message); setFileName(''); }
    finally { if (attempt === generation.current) { setBusy(''); setUploadStage(''); setUploadProgress(null); } }
  };
  const analyze = async () => {
    setBusy('Reviewing your profile…'); setError(null);
    try { acceptProfile(await uploadResume(text, name.trim() || undefined)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const buildPlan = async () => {
    if (!profile) return;
    setBusy('Preparing your interview plan…'); setError(null);
    try { const result = await createInterview(profile.resumeId, undefined, rounds, jd, preferences); setPlan(result); setStage(3); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const update = (next: Partial<InterviewPreferences>) => { setPreferences((prev) => ({ ...prev, ...next })); setPlan(null); };
  const confirmCareerPath = () => {
    if (!profile?.careerPath) return;
    const rolePreset = clarifiedRole ?? profile.careerPath.recommendedRoleId;
    setPreferences((prev) => ({ ...prev, rolePreset }));
    setStage(2);
  };
  const showItems = (items: unknown[]) => items.length ? items.map((item, i) => {
    const record = typeof item === 'object' && item !== null ? item as Record<string, unknown> : null;
    const parts = record ? ['role', 'company', 'period', 'degree', 'institution', 'field'].flatMap((key) => typeof record[key] === 'string' && record[key] ? [record[key] as string] : []) : [String(item)];
    return <li key={i}>{parts.join(' · ') || 'See extracted text for details'}</li>;
  }) : <li className="muted">Not detected. You can add it to the extracted text.</li>;
  // Layout after the setup reference (docs/references/03): one panel holding the current stage, and the three
  // stage discs beside it. The stages, fields and actions are unchanged.
  return <div className="page setup-page su-page"><div className="su-layout"><section className="su-panel" aria-labelledby="su-title">
    <header className="su-head"><p className="su-eyebrow">Interview setup · step {stage} of 3</p><h1 id="su-title">Make practice personal.</h1><p>Bring your experience. We’ll build an interview around it.</p></header>
    {profile && !initialPreset && <p className="fine-print">Your saved resume is ready for review. You can edit or replace it. Previously observed gaps for this role and provider help prioritize practice; your new answers determine the new assessment.</p>}
    <ol className="stepper">{['Your profile', 'Interview preferences', 'Review your plan'].map((title, i) => <li key={title} className={stage === i + 1 ? 'active' : stage > i + 1 ? 'done' : ''}><span>{stage > i + 1 ? <CheckDrawIcon /> : `0${i + 1}`}</span>{title}</li>)}</ol>
    <ErrorNotice message={error} retry={!options ? loadOptions : undefined} />
    {busy && (uploadStage ? <div className="resume-processing" role="status" aria-live="polite"><strong>{uploadStage}</strong>{uploadProgress !== null ? <><progress aria-label="Resume upload progress" max={100} value={uploadProgress} /><small>{uploadProgress}%</small></> : <span className="processing-indicator">This may take a few seconds.</span>}</div> : /^(Processing your resume|Reviewing your profile)/.test(busy) ? <div className="loading" role="status" aria-live="polite"><SearchIcon loading size="standalone" /><span>{busy}</span></div> : <Loading label={busy} />)}
    {/* Each stage arrives with a short slide from the right (none under reduced motion). */}
    <motion.div key={stage} className="su-stage-body" initial={reduced ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .4, ease: [0.22, 1, 0.36, 1] }}>
    {stage === 1 && <div className="setup-grid">
      <Card><div className="section-heading"><div><p className="eyebrow">01 / PROFILE</p><h2>A little about you.</h2></div><Icon icon={FileText} size="feature" /></div>
        <div className="segmented" aria-label="Resume input method"><Button variant={mode === 'upload' ? 'secondary' : 'ghost'} onClick={() => setMode('upload')} disabled={!!busy}>Upload a file</Button><Button variant={mode === 'text' ? 'secondary' : 'ghost'} onClick={() => setMode('text')} disabled={!!busy}>Paste text</Button></div>
        {mode === 'upload' && <div className={`upload-zone ${dragging ? 'dragging' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void readFile(e.dataTransfer.files[0]); }}>
          <span className="upload-symbol"><Icon icon={CloudUpload} size="feature" /></span><h3>{fileName || 'Drop your resume here'}</h3><p>{profile && fileName ? 'Text extracted. Review your profile below before continuing.' : 'PDF or DOCX · up to 5 MB'}</p>
          <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={!!busy}>{fileName ? 'Choose another file' : 'Browse files'}</Button>
          <input ref={fileInput} aria-label="Resume file" type="file" accept=".pdf,.docx" hidden onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ''; }} />
          <small>Text-based PDFs supported. Scanned PDFs need OCR. Uploads are parsed in memory; the original file is not stored.</small>
        </div>}
        <label className="field">Candidate name<input aria-label="Candidate Name" value={name} disabled={!!busy} placeholder="Your full name" onChange={(e) => { setName(e.target.value); setDirty(true); }} /></label>
        {(mode === 'text' || profile) && <label className="field">{profile ? 'Review & correct extracted text' : 'Resume or experience summary'}<textarea aria-label="Resume Text" rows={profile ? 7 : 10} value={text} disabled={!!busy} placeholder="Paste your experience, education, skills and projects…" onChange={(e) => { setText(e.target.value); setDirty(true); }} /><small>Corrections are re-analyzed before the interview is planned.</small></label>}
        <div className="actions spread"><Button variant="ghost" disabled={!!busy} onClick={() => { setMode('text'); setText(SAMPLE_RESUMES.senior_backend); setName('Alex Morgan'); setFileName(''); setProfile(null); setDirty(true); }}>Use sample resume</Button>
          {(mode === 'text' || dirty) && <Button onClick={analyze} disabled={!!busy || text.trim().length < 10}>{profile ? 'Re-analyze corrections' : 'Analyze resume'}<Icon icon={ArrowRight} /></Button>}
        </div>
      </Card>
      <div className="stack"><Card className="profile-preview"><p className="eyebrow">PROFILE PREVIEW</p><h2>{profile ? profile.candidateName : 'Your experience, understood.'}</h2>
        {!profile ? <><p className="muted">Upload your resume to review the skills and experience your interview can explore.</p><div className="preview-list"><span>01 <strong>Extract your experience</strong></span><span>02 <strong>Review what we found</strong></span><span>03 <strong>Practice for your target role</strong></span></div></> : <>
          <Status tone={dirty ? 'warning' : 'success'}>{dirty ? 'Changes need review' : 'Ready for your review'}</Status>
          <h3>Skills</h3><div className="chips">{profile.profile.skills.length ? profile.profile.skills.map((s) => <span key={s.skillId}>{labelFor(s.skillId)}</span>) : <p className="muted">No recognized skills detected.</p>}</div>
          <h3>Experience</h3><ul className="detail-list">{showItems(profile.profile.experience.filter((item) => (item as { employmentType?: string }).employmentType !== 'internship'))}</ul>
          {!!profile.insights?.internships.length && <><h3>Internships</h3><ul className="detail-list">{showItems(profile.insights.internships)}</ul></>}
          <h3>Education</h3><ul className="detail-list">{showItems(profile.profile.education)}</ul>
          <h3>Projects</h3><ul className="detail-list">{showItems(profile.profile.projects)}</ul>
          {!!profile.profile.certifications.length && <><h3>Certifications</h3><ul className="detail-list">{showItems(profile.profile.certifications)}</ul></>}
          {!!profile.insights?.technologies.length && <><h3>Tools & technologies</h3><div className="chips">{profile.insights.technologies.map((technology) => <span key={technology}>{technology}</span>)}</div></>}
          {!!profile.insights?.domainKnowledge.length && <><h3>Domain experience signals</h3><div className="chips">{profile.insights.domainKnowledge.map((domain) => <span key={domain}>{domain}</span>)}</div></>}
          {!!profile.insights?.communicationEvidence.length && <><h3>Communication evidence</h3><ul className="detail-list">{profile.insights.communicationEvidence.slice(0, 3).map((evidence) => <li key={evidence.source.line}>“{evidence.text}” <small>Resume line {evidence.source.line}</small></li>)}</ul></>}
          {!!profile.insights?.leadershipEvidence.length && <><h3>Leadership evidence</h3><ul className="detail-list">{profile.insights.leadershipEvidence.slice(0, 3).map((evidence) => <li key={evidence.source.line}>“{evidence.text}” <small>Resume line {evidence.source.line}</small></li>)}</ul></>}
          {!!profile.insights?.validationAreas?.length && <><h3>Areas to validate in your interview</h3><ul className="detail-list">{profile.insights.validationAreas.slice(0, 4).map((area) => <li key={`${area.source.line}-${area.topic}`}><strong>{area.topic}</strong> — {area.rationale} <small>Resume line {area.source.line}</small></li>)}</ul></>}
          <p className="fine-print">Extracted claims are a starting point, not verified abilities. Review the source text for missing or incorrect details.</p>
        </>}
        {profile?.careerPath && <section className={`career-path-card ${profile.careerPath.needsClarification ? 'needs-clarification' : ''}`} aria-labelledby="career-path-heading"><p className="eyebrow">DETECTED FROM YOUR RESUME</p><h3 id="career-path-heading">{profile.careerPath.needsClarification ? 'Let’s choose the right direction.' : 'Likely career direction'}</h3><strong>{profile.careerPath.title}</strong><Status tone={profile.careerPath.confidence === 'high' ? 'success' : 'warning'}>{profile.careerPath.confidence} confidence</Status><p>{profile.careerPath.rationale}</p>{profile.careerPath.evidence.length > 0 && <small>Resume signals: {profile.careerPath.evidence.join(' · ')}</small>}
          {profile.careerPath.needsClarification && <fieldset className="career-path-choices"><legend>{profile.careerPath.clarificationPrompt}</legend>{(options?.roles ?? []).map((role) => <label key={role.id}><input type="radio" name="career-direction" value={role.id} checked={clarifiedRole === role.id} onChange={() => setClarifiedRole(role.id as InterviewPreferences['rolePreset'])} />{role.title}</label>)}</fieldset>}
        </section>}
      </Card><Button className="wide" disabled={!profile || dirty || !!busy || !name.trim() || !options || (!!profile.careerPath?.needsClarification && !clarifiedRole)} onClick={confirmCareerPath}>{profile?.careerPath?.needsClarification ? 'Continue with selected direction' : profile?.careerPath ? `Confirm ${profile.careerPath.title} & continue` : 'Continue to preferences'} <Icon icon={ArrowRight} /></Button></div>
    </div>}
    {stage === 2 && <div className="su-config">
      <header className="su-step-head"><p className="eyebrow">02 / YOUR DIRECTION</p><h2>Shape the interview.</h2><p className="muted">Each choice shapes the plan. You review everything before the interview starts.</p></header>
      <ConfigGroup index="01" title="Job role" hint="Detected from your résumé. Change it, or paste a job description, if you are preparing for something specific.">
        <label className="field su-field">Target role<select aria-label="Target role (optional)" value={preferences.rolePreset} onChange={(e) => update({ rolePreset: e.target.value as InterviewPreferences['rolePreset'] })}>{options?.roles.map((role) => <option key={role.id} value={role.id}>{role.title}</option>)}</select></label>
        <label className="field su-field">Job description or role requirements (optional)<textarea aria-label="Job description or role requirements (optional)" rows={4} value={jd} onChange={(e) => setJd(e.target.value)} placeholder={'Paste the job title and requirements.\nRequired: PostgreSQL, indexing, transactions…'} /><small>When provided, the job description takes priority over the detected career direction.</small></label>
      </ConfigGroup>
      <ConfigGroup index="02" title="Experience level">
        <ChoiceTiles name="experience-level" label="Experience level" value={preferences.experienceLevel ?? ''} onChange={(value) => update({ experienceLevel: (value || undefined) as InterviewPreferences['experienceLevel'] })}
          options={[{ value: '', title: 'From my résumé', detail: 'Estimated from your experience' }, { value: 'junior', title: 'Early career', detail: 'Foundations and learning' }, { value: 'mid', title: 'Mid-level', detail: 'Independent delivery' }, { value: 'senior', title: 'Senior', detail: 'Ownership and trade-offs' }]} />
      </ConfigGroup>
      <ConfigGroup index="03" title="Interview category">
        <ChoiceTiles name="interview-type" label="Interview type" value={preferences.interviewType ?? 'full'} onChange={(value) => { update({ interviewType: value as InterviewPreferences['interviewType'] }); setRounds(options?.interviewTypes.find((t) => t.id === value)?.rounds ?? 4); }}
          options={(options?.interviewTypes ?? []).map((t) => ({ value: t.id, title: t.label, detail: `Up to ${t.rounds} ${t.rounds === 1 ? 'round' : 'rounds'}` }))} />
      </ConfigGroup>
      <ConfigGroup index="04" title="Difficulty">
        <ChoiceTiles name="difficulty" label="Difficulty preference" value={preferences.targetDifficulty === undefined ? '' : String(preferences.targetDifficulty)} onChange={(value) => update({ targetDifficulty: value ? Number(value) : undefined })}
          options={DIFFICULTY.map((d) => ({ value: d.value, title: d.title, detail: d.detail }))} />
      </ConfigGroup>
      <ConfigGroup index="05" title="Interview length" hint={`${rounds * (preferences.questionsPerRound ?? 3)} questions in total, spoken aloud and answered by voice.`}>
        <div className="su-length">
          <label className="field su-field">Rounds<select aria-label="Rounds" value={rounds} onChange={(e) => setRounds(Number(e.target.value))}>{Array.from({ length: options?.interviewTypes.find((t) => t.id === preferences.interviewType)?.rounds ?? 4 }, (_, i) => <option key={i} value={i + 1}>{i + 1} {i ? 'rounds' : 'round'}</option>)}</select></label>
          <label className="field su-field">Questions per round<select aria-label="Questions per round" value={preferences.questionsPerRound} onChange={(e) => update({ questionsPerRound: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6].map((n) => <option value={n} key={n}>{n} questions</option>)}</select></label>
          <div className="su-length-grid" aria-hidden="true">{Array.from({ length: rounds }, (_, r) => <div key={r} className="su-length-row"><span>R{r + 1}</span>{Array.from({ length: preferences.questionsPerRound ?? 3 }, (_, q) => <i key={q} style={{ '--i': r * 6 + q } as CSSProperties} />)}</div>)}</div>
        </div>
      </ConfigGroup>
      <ConfigGroup index="06" title="Voice" hint="Questions are always spoken aloud. Choose how your spoken answers are transcribed; you can change this in the room.">
        <ChoiceTiles name="voice" label="Voice transcription" value={voice} onChange={(value) => setVoice(value as VoiceMode)}
          options={[{ value: 'local', title: 'Local dictation', detail: 'Sent to this app’s backend, discarded after transcription' }, { value: 'browser', title: 'Browser recognition', detail: 'Uses your browser’s service; its vendor may process audio' }]} />
      </ConfigGroup>
      <div className="notice">{options?.providerName === 'deterministic' ? 'Demo mode uses deterministic evaluation. No AI API key is needed.' : `Configured evaluation provider: ${options?.providerName ?? 'loading'}.`}</div>
      <div className="actions spread"><Button variant="ghost" onClick={() => setStage(1)} disabled={!!busy}>Back to profile</Button><Button onClick={buildPlan} disabled={!!busy || !options}>Build my interview plan <Icon icon={ArrowRight} /></Button></div>
    </div>}
    {stage === 3 && plan?.plan && <Card className="plan-card"><div className="section-heading"><div><p className="eyebrow">03 / READY WHEN YOU ARE</p><h2>Your interview, mapped out.</h2><p>{plan.plan.roleTitle} · {plan.plan.rounds.length} rounds · {plan.plan.totalQuestionBudget} questions</p></div><Status tone="success">Plan prepared</Status></div>
      <section className="su-summary" aria-labelledby="su-summary-title"><h3 id="su-summary-title">Final configuration</h3><dl>
        <div><dt>Role</dt><dd>{plan.plan.roleTitle}</dd></div>
        <div><dt>Experience</dt><dd>{LEVELS[preferences.experienceLevel ?? ''] ?? 'From my résumé'}</dd></div>
        <div><dt>Category</dt><dd>{options?.interviewTypes.find((t) => t.id === preferences.interviewType)?.label ?? labelFor(preferences.interviewType ?? 'full')}</dd></div>
        <div><dt>Difficulty</dt><dd>{DIFFICULTY.find((d) => d.value === (preferences.targetDifficulty === undefined ? '' : String(preferences.targetDifficulty)))?.title}</dd></div>
        <div><dt>Length</dt><dd>{plan.plan.rounds.length} {plan.plan.rounds.length === 1 ? 'round' : 'rounds'} · {plan.plan.totalQuestionBudget} questions</dd></div>
        <div><dt>Voice</dt><dd>{voice === 'local' ? 'Local dictation' : 'Browser recognition'}</dd></div>
        <div><dt>Job description</dt><dd>{jd.trim() ? 'Provided' : 'Not provided'}</dd></div>
      </dl></section>
      <div className="plan-rounds">{plan.plan.rounds.map((r) => <article key={r.roundNumber}><span className="round-number">0{r.roundNumber}</span><div><h3>{r.name.replace(/^Round \d+\s*[—–-]\s*/, '')}</h3><p>{r.description}</p><div className="chips">{r.targetSkills.map((s) => <span key={s}>{labelFor(s)}</span>)}</div><small>{r.questionBudget} questions · difficulty {r.difficultyRange.min * 2}–{r.difficultyRange.max * 2} / 10</small></div></article>)}</div><div className="notice">The plan sets the boundaries. Questions adapt to your answers and accumulated evidence. Questions are spoken aloud and your spoken answers are transcribed for assessment.</div><div className="actions spread"><Button variant="ghost" onClick={() => setStage(2)}>Edit preferences</Button><Button onClick={() => onInterviewPrepared(plan, { recognitionMode: voice })}>Enter interview room <Icon icon={ArrowRight} /></Button></div></Card>}
    </motion.div>
  </section><SetupStage stage={stage} /></div></div>;
}
