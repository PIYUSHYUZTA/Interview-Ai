import { ScreenBoundary } from './components/ScreenBoundary';
import { AnimatePresence, PageTransition, ToastProvider, useToast } from './components/motion/feedback';
import { playSound } from './components/sound/sound';
import { SoundToggle } from './components/sound/SoundToggle';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { CandidateAccount, CandidateAuthResponse, InterviewCreateResponse } from './types';
import { getCurrentCandidate, getSetupOptions, logoutCandidate } from './api';
const ResumeUploadView = lazy(() => import('./components/ResumeUploadView').then((module) => ({ default: module.ResumeUploadView })));
const InterviewRoom = lazy(() => import('./components/InterviewRoom').then((module) => ({ default: module.InterviewRoom })));
const ResultsScreen = lazy(() => import('./components/ResultsScreen').then((module) => ({ default: module.ResultsScreen })));
const LandingPage = lazy(() => import('./components/LandingPage').then((module) => ({ default: module.LandingPage })));
const Dashboard = lazy(() => import('./components/Dashboard').then((module) => ({ default: module.Dashboard })));
const AuthScreen = lazy(() => import('./components/AuthScreen').then((module) => ({ default: module.AuthScreen })));
import { Icon } from './components/icon/Icon';
import { ArrowRight, Brain, ChartColumn, SlidersHorizontal, Sparkles } from './components/icon/icons';
import { Button, Loading, Status } from './components/ui';
type View = 'landing' | 'auth' | 'dashboard' | 'setup' | 'room' | 'results';
type ProtectedDestination = { view: 'dashboard' } | { view: 'setup'; preset?: string };
export default function App() {
  return <ToastProvider><Screens /></ToastProvider>;
}
function Screens() {
  const notify = useToast();
  const [view, setView] = useState<View>('landing');
  const previousView = useRef(view);
  const navigated = useRef(false);
  const completed = useRef(false);
  const currentView = useRef(view);
  const announced = useRef<View | null>(null);
  useEffect(() => {
    const titles: Record<View, string> = { landing: 'Interview AI', auth: 'Candidate account', dashboard: 'Your workspace', setup: 'Interview setup', room: 'Interview studio', results: 'Intelligence report' };
    document.title = `${titles[view]} · Interview AI`;
    currentView.current = view;
    if (previousView.current !== view) navigated.current = true;
    previousView.current = view;
  }, [view]);
  // Runs when the incoming screen mounts, after the outgoing one has faded out.
  const entered = useCallback(() => {
    window.scrollTo(0, 0);
    if (!navigated.current || announced.current === currentView.current) return; // outer and inner screens both mount
    announced.current = currentView.current;
    document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
    // A finished interview gets the completion chime; other screen changes a soft swipe. Never the room.
    if (completed.current && currentView.current === 'results') { completed.current = false; playSound('done'); }
    else if (currentView.current !== 'room') playSound('page');
  }, []);
  const [session, setSession] = useState<InterviewCreateResponse | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [preset, setPreset] = useState<string | undefined>();
  const [provider, setProvider] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<CandidateAccount | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [destination, setDestination] = useState<ProtectedDestination>({ view: 'dashboard' });
  useEffect(() => { let active = true; getCurrentCandidate().then((result) => { if (active) setCandidate(result.candidate); }).catch((error: Error) => { if (active) setAuthError(error.message); }).finally(() => { if (active) setAuthReady(true); }); return () => { active = false; }; }, []);
  useEffect(() => { getSetupOptions().then((o) => setProvider(o.providerName)).catch(() => setProvider(null)); }, []);
  const setup = (sample?: string) => { setPreset(sample); setSession(null); setView('setup'); };
  const showDestination = (target: ProtectedDestination) => { if (target.view === 'setup') setup(target.preset); else setView('dashboard'); };
  const openProtected = (target: ProtectedDestination) => { setDestination(target); if (authReady && candidate) showDestination(target); else setView('auth'); };
  const authenticated = (result: CandidateAuthResponse) => { setCandidate(result.candidate); setAuthError(null); showDestination(destination); notify(`Signed in as ${result.candidate.name}.`, 'success', { silent: true }); /* the submit chime already confirmed it */ };
  useEffect(() => { if (view === 'auth' && authReady && candidate) showDestination(destination); }, [view, authReady, candidate, destination]);
  const signOut = async () => { try { await logoutCandidate(); notify('You are signed out.'); } catch (error) { setAuthError((error as Error).message); } finally { setCandidate(null); setSession(null); setReportId(null); setView('landing'); } };
  let screen;
  if (view === 'landing') screen = <ScreenBoundary key="landing"><Suspense fallback={<Loading label="Opening Interview AI…" />}><LandingPage onStart={() => openProtected({ view: 'setup' })} onWorkspace={() => openProtected({ view: 'dashboard' })} signedIn={authReady && !!candidate} /></Suspense></ScreenBoundary>;
  else if (view === 'auth') screen = <ScreenBoundary key="auth"><Suspense fallback={<Loading label="Opening your account…" />}><AuthScreen checkingSession={!authReady} sessionError={authError} onAuthenticated={authenticated} onBack={() => setView('landing')} /></Suspense><SoundToggle corner /></ScreenBoundary>;
  else if (view === 'room' && session) screen = <div className="app-shell immersive-host"><ScreenBoundary><Suspense fallback={<Loading label="Preparing the interview room…" />}><InterviewRoom providerName={session.providerName} interviewId={session.sessionId} initialState={session.publicState} plan={session.plan} integrityToken={session.integrityToken} integrityPolicy={session.integrityPolicy} onExitSession={() => { setSession(null); setView('dashboard'); }} onInterviewCompleted={() => { completed.current = true; setReportId(session.sessionId); setView('results'); }} /></Suspense></ScreenBoundary></div>;
  else screen = <div className="app-shell"><a className="skip-link" href="#candidate-main">Skip to main content</a><aside className="sidebar"><button className="brand" disabled={view === 'room'} onClick={() => setView('landing')} aria-label="Interview home"><span className="brand-symbol"><Icon icon={Brain} size="feature" /></span><span>interview<span className="brand-ai">ai</span><small>YOUR PRACTICE STUDIO</small></span></button>
    <div className="nav-label">WORKSPACE</div><nav aria-label="Main navigation"><button className={view === 'dashboard' ? 'active' : ''} disabled={view === 'room'} onClick={() => setView('dashboard')}><Icon icon={ChartColumn} size="standalone" />Overview</button><button className={view === 'setup' ? 'active' : ''} disabled={view === 'room'} onClick={() => setup()}><Icon icon={SlidersHorizontal} size="standalone" />Interview setup</button>{view === 'room' && <button className="active" aria-current="page"><Icon icon={Sparkles} size="standalone" />Interview studio</button>}{reportId && view !== 'room' && <button className={view === 'results' ? 'active' : ''} onClick={() => setView('results')}><Icon icon={Sparkles} size="standalone" />Assessment report</button>}</nav>
    <div className="sidebar-bottom"><div className="workspace-mark">{candidate?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() ?? 'P'}</div><div><strong>{candidate?.name ?? 'Personal workspace'}</strong><small>{candidate?.email ?? 'Local practice environment'}</small></div></div></aside>
    <div className="main-shell"><header className="topbar"><span>Workspace <span className="breadcrumb-divider">/</span> <strong>{view === 'dashboard' ? 'Overview' : view === 'setup' ? 'Interview setup' : view === 'room' ? 'Interview studio' : 'Assessment'}</strong></span><div className="actions"><Status tone={provider === 'deterministic' ? 'cyan' : ''}>{provider === 'deterministic' ? 'Demo mode' : provider ? `Provider: ${provider}` : 'API not connected'}</Status>{view === 'dashboard' && <Button variant="ghost" onClick={() => setup()}>Start practice <Icon icon={ArrowRight} /></Button>}<SoundToggle />{candidate && <Button className="account-signout" variant="ghost" disabled={view === 'room'} onClick={() => { void signOut(); }}>Sign out</Button>}</div></header><main id="candidate-main" tabIndex={-1}><AnimatePresence mode="wait" initial={false}><PageTransition key={view} rise onEnter={entered}><ScreenBoundary key={view}><Suspense fallback={<Loading label="Opening your workspace…" />}>
      {view === 'dashboard' && <Dashboard onStartNewInterview={(sample) => openProtected({ view: 'setup', preset: sample })} onViewInterviewResults={(id) => { setReportId(id); setView('results'); }} />}
      {view === 'setup' && <ResumeUploadView key={preset ?? 'own-profile'} initialPreset={preset} onInterviewPrepared={(next) => { setSession(next); setProvider(next.providerName); setView('room'); }} />}
      {view === 'results' && reportId && <ResultsScreen key={reportId} interviewId={reportId} onRestart={() => setup()} />}
    </Suspense></ScreenBoundary></PageTransition></AnimatePresence></main><footer className="app-footer"><span>Built around your experience. Guided by your answers.</span><span>Interview AI · Practice with purpose</span></footer></div></div>;
  const screenKey = view === 'landing' || view === 'auth' ? view : view === 'room' && session ? 'room' : 'workspace';
  return <AnimatePresence mode="wait" initial={false}><PageTransition key={screenKey} onEnter={entered}>{screen}</PageTransition></AnimatePresence>;
}
