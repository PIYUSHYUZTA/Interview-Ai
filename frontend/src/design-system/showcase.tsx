import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './tokens.css';
import './base.css';
import './icons.css';
import './sound.css';
import './components.css';
import './motion.css';
import './a11y.css';
import './showcase.css';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Icon, IconButton } from '../components/icon/Icon';
import { ArrowRight, Brain, ChartColumn, FileText, Inbox, LayoutDashboard, Mic, Settings, SlidersHorizontal, Sparkles, Target, Trash2, User } from '../components/icon/icons';
import { ToastProvider, useToast } from '../components/motion/feedback';
import { ActionButton, holdSuccess, useShake, type ActionState } from '../components/motion/feedback';
import { Modal } from '../components/ui';
import { Breadcrumbs, Navbar, Sidebar, Tabs } from '../components/library/navigation';
import { Checkbox, FileDrop, PasswordField, RadioGroup, SearchField, Select, Switch, TextArea, TextField } from '../components/library/forms';
import { CopyButton, DsButton } from '../components/library/buttons';
import { AlertBanner, Drawer, EmptyState, ErrorState, Popover, SkeletonAvatar, SkeletonButton, SkeletonCard, SkeletonImage, SkeletonText, Tooltip } from '../components/library/overlays';
import { Avatar, Badge, BentoGrid, BentoItem, ChoiceCard, Chip, DataTable, Panel, ProgressBar, Stat, Tag } from '../components/library/display';
import { NotFound } from '../components/library/NotFound';

/** Every library component, with its states, on one page. Development only: not in the production build. */
function Showcase() {
  return <ToastProvider>
    <Navbar logo={<><Icon icon={Brain} size="feature" />interview ai</>} cta="Start practicing" onCta={() => undefined}
      links={[{ href: '#navigation', label: 'Navigation', current: true }, { href: '#forms', label: 'Forms' }, { href: '#buttons', label: 'Buttons' }, { href: '#feedback', label: 'Feedback' }, { href: '#display', label: 'Display' }]} />
    <main className="ds-container sc-page" id="top">
      <header className="sc-intro"><p className="ds-label">Interview AI · component library</p><h1 className="ds-h1">Components</h1>
        <p className="ds-body-lg">Every component shows its default, hover, pressed, keyboard-focus, disabled and loading states. Switch the theme in the bar above; turn on sound to hear the confirmations.</p></header>
      <NavigationSection /><FormsSection /><ButtonsSection /><FeedbackSection /><DisplaySection />
    </main>
  </ToastProvider>;
}

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => <section id={id} className="sc-section" aria-labelledby={`${id}-title`}><h2 className="ds-h2" id={`${id}-title`}>{title}</h2>{children}</section>;
const Demo = ({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) => <div className="sc-demo" data-wide={wide || undefined}><p className="ds-label">{title}</p><div className="sc-demo-body">{children}</div></div>;

function NavigationSection() {
  const [current, setCurrent] = useState('overview');
  return <Section id="navigation" title="Navigation">
    <Demo title="Sidebar · current, badge, disabled, loading">
      <Sidebar landmark={false} label="Library sidebar" current={current} onSelect={setCurrent} footer={<div className="ds-cluster"><Avatar name="Ada Lovelace" status="online" size="sm" /><span className="ds-body-sm">Ada Lovelace</span></div>}
        items={[{ id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'setup', label: 'Interview setup', icon: SlidersHorizontal, badge: 'New' }, { id: 'reports', label: 'Reports', icon: ChartColumn, loading: true }, { id: 'settings', label: 'Settings', icon: Settings, disabled: true }]} />
    </Demo>
    <Demo title="Breadcrumbs"><Breadcrumbs items={[{ label: 'Workspace', onSelect: () => undefined }, { label: 'Reports', onSelect: () => undefined }, { label: 'Senior backend · 12 Oct' }]} /></Demo>
    <Demo title="Tabs · sliding underline, arrow keys, disabled" wide>
      <Tabs label="Report sections" tabs={[
        { id: 'summary', label: 'Summary', content: 'Overall 78 / 100 across four rounds.' },
        { id: 'skills', label: 'Skills', content: 'Strongest: API design. Weakest: capacity planning.' },
        { id: 'answers', label: 'Answers', content: 'Twelve answers with evidence and coaching.' },
        { id: 'plan', label: 'Learning plan', content: '', disabled: true },
      ]} />
    </Demo>
    <p className="ds-body-sm sc-note">The top bar of this page is the navbar; narrow the window to see the full-screen menu with its staggered links.</p>
  </Section>;
}

function FormsSection() {
  const [email, setEmail] = useState('ada@example');
  const [search, setSearch] = useState('');
  const [answer, setAnswer] = useState('I would start by clarifying the read and write patterns.');
  const [role, setRole] = useState<string | null>(null);
  const [round, setRound] = useState('complete');
  const [checks, setChecks] = useState({ camera: true, transcript: false });
  const [voice, setVoice] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | undefined>();
  const [state, setState] = useState<ActionState>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [form, shake] = useShake<HTMLFormElement>();
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const upload = (next: File[]) => { setFiles(next); setProgress(0); let p = 0; const t = window.setInterval(() => { p += 20; setProgress(p); if (p >= 100) window.clearInterval(t); }, 250); };
  return <Section id="forms" title="Forms & inputs">
    <Demo title="Text input · floating label, error, success, checking, disabled">
      <TextField label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} status={email ? (valid ? 'success' : 'error') : undefined} message={email && !valid ? 'Enter an address like name@example.com.' : undefined} hint="We only use it to sign you in." />
      <TextField label="Display name" defaultValue="Ada" loading hint="Checking availability…" />
      <TextField label="Account ID" defaultValue="cand_48213" disabled />
    </Demo>
    <Demo title="Password · show / hide"><PasswordField hint="Use at least 10 characters." /></Demo>
    <Demo title="Search · expands on focus; icon pulses while loading"><SearchField label="Search interviews" value={search} onValue={setSearch} loading={search.length > 0 && search.length < 4} /><SearchField label="Search (disabled)" value="" onValue={() => undefined} disabled /></Demo>
    <Demo title="Textarea · grows with the answer"><TextArea label="Your answer" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={600} /></Demo>
    <Demo title="Select · keyboard, type-ahead, loading, disabled option">
      <Select label="Target role" value={role} onValue={setRole} options={[{ value: 'backend', label: 'Backend engineer' }, { value: 'frontend', label: 'Frontend engineer' }, { value: 'fullstack', label: 'Full-stack engineer' }, { value: 'data', label: 'Data & ML engineer' }, { value: 'mobile', label: 'Mobile engineer (soon)', disabled: true }]} />
      <Select label="Interviewer voice" value={null} onValue={() => undefined} options={[]} loading />
    </Demo>
    <Demo title="Checkbox · drawn tick">
      <Checkbox label="Allow camera monitoring" description="Sampled frames, analysed locally." checked={checks.camera} onChange={(e) => setChecks({ ...checks, camera: e.target.checked })} />
      <Checkbox label="Save transcripts" checked={checks.transcript} onChange={(e) => setChecks({ ...checks, transcript: e.target.checked })} />
      <Checkbox label="Share with a mentor (coming soon)" disabled />
    </Demo>
    <Demo title="Radio group"><RadioGroup label="Interview type" name="round" value={round} onValue={setRound} options={[{ value: 'complete', label: 'Complete interview', description: 'All four rounds' }, { value: 'technical', label: 'Technical deep dive' }, { value: 'panel', label: 'Panel interview', disabled: true, description: 'Not available yet' }]} /></Demo>
    <Demo title="Toggle switch · on, off, saving, disabled">
      <Switch label="Interviewer speaks questions aloud" checked={voice} onChecked={setVoice} />
      <Switch label="Saving preference" checked onChecked={() => undefined} loading />
      <Switch label="Proctoring (required)" checked onChecked={() => undefined} disabled description="Set by your organisation." />
    </Demo>
    <Demo title="File upload · drag, accepted, rejected, uploading" wide>
      <FileDrop label="Upload your résumé" accept={['.pdf', '.docx']} maxBytes={5 * 1024 * 1024} files={files} onFiles={upload} onRemove={() => { setFiles([]); setProgress(undefined); }} progress={progress} />
    </Demo>
    <Demo title="Form · loading, success, error" wide>
      <form ref={form} className="sc-form" noValidate onSubmit={async (event) => {
        event.preventDefault(); setFormError(null); setState('busy');
        await new Promise((r) => setTimeout(r, 900));
        if (!valid) { setState('idle'); setFormError('That email address does not look complete.'); shake(); return; }
        setState('success'); await holdSuccess(); setTimeout(() => setState('idle'), 1500);
      }}>
        {formError && <AlertBanner tone="error" title="Could not save">{formError}</AlertBanner>}
        <TextField label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <ActionButton type="submit" state={state} busyLabel="Saving…" successLabel="Saved">Save details</ActionButton>
      </form>
    </Demo>
  </Section>;
}

function ButtonsSection() {
  return <Section id="buttons" title="Buttons">
    <Demo title="Variants" wide>
      <DsButton iconEnd={ArrowRight}>Primary</DsButton>
      <DsButton variant="secondary">Secondary</DsButton>
      <DsButton variant="ghost">Ghost</DsButton>
      <DsButton variant="danger" icon={Trash2}>Delete report</DsButton>
    </Demo>
    <Demo title="Disabled and loading" wide>
      <DsButton disabled>Primary</DsButton><DsButton variant="secondary" disabled>Secondary</DsButton>
      <DsButton loading>Saving…</DsButton><DsButton variant="secondary" loading>Loading</DsButton>
    </Demo>
    <Demo title="Sizes"><DsButton size="sm">Small</DsButton><DsButton>Medium</DsButton><DsButton size="lg">Large</DsButton></Demo>
    <Demo title="Icon buttons · circle, ripple, loading, disabled"><IconButton icon={Mic} label="Start microphone" /><IconButton icon={Settings} label="Settings" /><IconButton icon={Sparkles} label="Generating" loading /><IconButton icon={Trash2} label="Delete" disabled /></Demo>
    <Demo title="Copy"><CopyButton text="https://interview.ai/r/48213" label="Copy report link" /></Demo>
  </Section>;
}

function FeedbackSection() {
  const notify = useToast();
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState<'right' | 'bottom' | null>(null);
  const [alerts, setAlerts] = useState(['info', 'success', 'warning', 'error'] as const as readonly ('info' | 'success' | 'warning' | 'error')[]);
  const [failures, setFailures] = useState(0);
  return <Section id="feedback" title="Feedback & overlays">
    <Demo title="Toasts · bottom-right, timer bar">
      <DsButton variant="secondary" onClick={() => notify('Report saved to your workspace.', 'success')}>Success</DsButton>
      <DsButton variant="secondary" onClick={() => notify('Could not reach the server.', 'error')}>Error</DsButton>
      <DsButton variant="secondary" onClick={() => notify('Your camera is covered.', 'warning')}>Warning</DsButton>
      <DsButton variant="secondary" onClick={() => notify('A new practice plan is ready.', 'info')}>Info</DsButton>
    </Demo>
    <Demo title="Modal · blurred backdrop, scale">
      <DsButton variant="secondary" onClick={() => setModal(true)}>Open dialog</DsButton>
      {modal && <Modal title="Leave this interview?" onClose={() => setModal(false)}>{(close) => <><p>Unfinished interviews cannot be resumed.</p><div className="ds-cluster"><DsButton variant="secondary" onClick={close}>Keep practicing</DsButton><DsButton variant="danger" onClick={close}>Leave</DsButton></div></>}</Modal>}
    </Demo>
    <Demo title="Drawer · right and bottom">
      <DsButton variant="secondary" onClick={() => setDrawer('right')}>From the right</DsButton>
      <DsButton variant="secondary" onClick={() => setDrawer('bottom')}>From the bottom</DsButton>
      {drawer && <Drawer title="Answer evidence" side={drawer} onClose={() => setDrawer(null)} footer={(close) => <DsButton onClick={close}>Done</DsButton>}><p>Each answer is scored against the role’s skills with the quote that supports it.</p><SkeletonText lines={6} /></Drawer>}
    </Demo>
    <Demo title="Tooltip · delay and arrow; Popover">
      <Tooltip label="Scores are practice indicators"><DsButton variant="ghost">Hover or focus me</DsButton></Tooltip>
      <Popover title="How readiness is calculated" trigger={(props) => <DsButton variant="secondary" {...props}>Open popover</DsButton>}><p>Full credit for meets, half for partially meets.</p><DsButton size="sm" variant="ghost">Read the method</DsButton></Popover>
    </Demo>
    <Demo title="Alert banners · dismissible" wide>
      {alerts.map((tone) => <AlertBanner key={tone} tone={tone} title={{ info: 'Practice tip', success: 'Interview saved', warning: 'Camera is dim', error: 'Upload failed' }[tone]} onDismiss={() => setAlerts((list) => list.filter((t) => t !== tone))}
        action={tone === 'error' ? <DsButton size="sm" variant="secondary">Retry</DsButton> : undefined}>{{ info: 'Answer out loud as you would in the room.', success: 'Your report is ready to review.', warning: 'Move toward a light source for reliable face checks.', error: 'The file could not be read.' }[tone]}</AlertBanner>)}
      {alerts.length === 0 && <DsButton variant="ghost" onClick={() => setAlerts(['info', 'success', 'warning', 'error'])}>Show alerts again</DsButton>}
    </Demo>
    <Demo title="Skeletons · text, avatar, image, button, card" wide><div className="sc-skeletons"><SkeletonCard /><div className="ds-stack"><SkeletonAvatar size={56} /><SkeletonText lines={4} /><SkeletonImage ratio="4 / 3" /><SkeletonButton /></div></div></Demo>
    <Demo title="Empty state"><Panel><EmptyState icon={Inbox} title="No interviews yet" action={<DsButton iconEnd={ArrowRight}>Set up an interview</DsButton>}>Your first practice builds a baseline you can measure against.</EmptyState></Panel></Demo>
    <Demo title="Error state · retry"><Panel><ErrorState message={failures ? `Still unavailable (attempt ${failures + 1}).` : 'The report service did not respond.'} onRetry={() => new Promise((r) => setTimeout(() => { setFailures((n) => n + 1); r(null); }, 900))} /></Panel></Demo>
    <Demo title="404 page" wide><div className="sc-404"><NotFound embedded path="/reports/old-link" onHome={() => undefined} onWorkspace={() => undefined} /></div></Demo>
  </Section>;
}

function DisplaySection() {
  const [picked, setPicked] = useState('complete');
  const [chips, setChips] = useState(['Backend', 'System design', 'APIs']);
  const [filters, setFilters] = useState<string[]>(['Completed']);
  const [loadingTable, setLoadingTable] = useState(false);
  const rows = Array.from({ length: 12 }, (_, i) => ({ role: ['Senior backend', 'Frontend', 'Full-stack', 'Data & ML'][i % 4], date: `2026-10-${String(26 - i).padStart(2, '0')}`, score: [78, 64, 82, 71, 59, 88][i % 6], answers: 6 + (i % 5) }));
  return <Section id="display" title="Display">
    <Demo title="Cards · default, hover lift, selected, disabled, loading" wide>
      <div className="sc-cards">
        <ChoiceCard icon={Target} title="Complete interview" description="All four rounds" selected={picked === 'complete'} onSelect={() => setPicked('complete')} />
        <ChoiceCard icon={Sparkles} title="Technical deep dive" description="Technical and problem-solving" selected={picked === 'technical'} onSelect={() => setPicked('technical')} />
        <ChoiceCard icon={User} title="Panel interview" description="Not available yet" selected={false} onSelect={() => undefined} disabled />
        <ChoiceCard title="" description="" selected={false} onSelect={() => undefined} loading />
      </div>
    </Demo>
    <Demo title="Bento grid" wide>
      <BentoGrid label="Features">
        <BentoItem span="large" icon={Mic} title="Voice interview">The interviewer speaks, listens and follows up on what you actually said.</BentoItem>
        <BentoItem icon={Target} title="Role-aware">Questions for backend, frontend, full-stack and data roles.</BentoItem>
        <BentoItem icon={FileText} title="Evidence">Every score quotes the answer behind it.</BentoItem>
        <BentoItem span="wide" icon={ChartColumn} title="Progress">Matched assessments show what changed between attempts.</BentoItem>
      </BentoGrid>
    </Demo>
    <Demo title="Avatars · photo, initials fallback, presence, loading">
      <Avatar name="Interviewer" src="/models/hero-bust-poster.webp" status="online" size="lg" /><Avatar name="Ada Lovelace" status="away" /><Avatar name="Grace Hopper" src="/missing.png" status="offline" /><Avatar name="Alan Turing" size="sm" /><Avatar name="x" loading />
    </Demo>
    <Demo title="Badges, tags, chips" wide>
      <div className="ds-cluster">{(['neutral', 'primary', 'info', 'success', 'warning', 'error'] as const).map((tone) => <Badge key={tone} tone={tone}>{tone}</Badge>)}</div>
      <div className="ds-cluster"><Badge tone="success" variant="solid">Meets</Badge><Badge tone="warning" variant="outline">Partially meets</Badge><Tag icon={Mic}>voice</Tag><Tag>v2.4</Tag></div>
      <div className="ds-cluster">{['Completed', 'Unfinished', 'Planned'].map((f) => <Chip key={f} selected={filters.includes(f)} onToggle={() => setFilters((l) => (l.includes(f) ? l.filter((x) => x !== f) : [...l, f]))}>{f}</Chip>)}<Chip disabled onToggle={() => undefined}>Archived</Chip></div>
      <div className="ds-cluster">{chips.map((c) => <Chip key={c} onRemove={() => setChips((l) => l.filter((x) => x !== c))}>{c}</Chip>)}</div>
    </Demo>
    <Demo title="Progress · animated fill, tones, indeterminate">
      <ProgressBar label="Evidence coverage" value={72} /><ProgressBar label="Strengths" value={88} tone="success" /><ProgressBar label="Gaps addressed" value={34} tone="warning" /><ProgressBar label="Preparing report" />
    </Demo>
    <Demo title="Stats · count-up, trend, loading" wide>
      <div className="sc-cards"><Stat label="Completed interviews" value={12} delta={{ value: 3, label: 'this month' }} /><Stat label="Average score" value={76.4} decimals={1} suffix="/ 100" delta={{ value: -2.1, label: 'vs. last' }} /><Stat label="Answers recorded" value={148} /><Stat label="Loading" value={0} loading /></div>
    </Demo>
    <Demo title="Data table · sort, hover, pagination, loading, empty" wide>
      <DsButton size="sm" variant="ghost" onClick={() => { setLoadingTable(true); setTimeout(() => setLoadingTable(false), 1200); }}>Reload table</DsButton>
      <DataTable caption="Interview history" loading={loadingTable} rows={rows} columns={[{ key: 'role', label: 'Role', sortable: true }, { key: 'date', label: 'Date', sortable: true }, { key: 'answers', label: 'Answers', numeric: true }, { key: 'score', label: 'Score', sortable: true, numeric: true, render: (r) => <Badge tone={r.score >= 75 ? 'success' : r.score >= 65 ? 'warning' : 'error'}>{r.score}</Badge> }]} />
      <DataTable caption="Archived interviews" rows={[]} columns={[{ key: 'role', label: 'Role' }, { key: 'score', label: 'Score' }]} empty="No archived interviews." />
    </Demo>
  </Section>;
}

createRoot(document.getElementById('showcase')!).render(<Showcase />);
