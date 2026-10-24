import { ScreenBoundary } from './components/ScreenBoundary';
import { BlurFade } from './components/vendor/magic-blur-fade';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { CandidateAccount, CandidateAuthResponse, InterviewCreateResponse } from './types';
import { getCurrentCandidate, getSetupOptions, logoutCandidate } from './api';
const ResumeUploadView = lazy(() => import('./components/ResumeUploadView').then((module) => ({ default: module.ResumeUploadView })));
const InterviewRoom = lazy(() => import('./components/InterviewRoom').then((module) => ({ default: module.InterviewRoom })));
const ResultsScreen = lazy(() => import('./components/ResultsScreen').then((module) => ({ default: module.ResultsScreen })));
const LandingPage = lazy(() => import('./components/LandingPage').then((module) => ({ default: module.LandingPage })));
const Dashboard = lazy(() => import('./components/Dashboard').then((module) => ({ default: module.Dashboard })));
const AuthScreen = lazy(() => import('./components/AuthScreen').then((module) => ({ default: module.AuthScreen })));
import { BrainIcon, BarChartIcon, SparklesIcon, SlidersIcon, ArrowRightIcon } from './components/Icons';
import { Button, Loading, Status } from './components/ui';
type View = 'landing' | 'auth' | 'dashboard' | 'setup' | 'room' | 'results';
type ProtectedDestination = { view: 'dashboard' } | { view: 'setup'; preset?: string };
export default function App() {
  const [view, setView] = useState<View>('landing');
  const previousView = useRef(view);
  useEffect(() => {
    const titles: Record<View, string> = { landing: 'Interview AI', auth: 'Candidate account', dashboard: 'Your workspace', setup: 'Interview setup', room: 'Interview studio', results: 'Intelligence report' };
    document.title = `${titles[view]} · Interview AI`;
    window.scrollTo(0, 0);
    if (previousView.current !== view) document.querySelector<HTMLElement>('main')?.focus({ preventScroll: true });
    previousView.current = view;
  }, [view]);
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
  const authenticated = (result: CandidateAuthResponse) => { setCandidate(result.candidate); setAuthError(null); showDestination(destination); };
  useEffect(() => { if (view === 'auth' && authReady && candidate) showDestination(destination); }, [view, authReady, candidate, destination]);
  const signOut = async () => { try { await logoutCandidate(); } catch (error) { setAuthError((error as Error).message); } finally { setCandidate(null); setSession(null); setReportId(null); setView('landing'); } };
  if (view === 'landing') return <ScreenBoundary key="landing"><Suspense fallback={<Loading label="Opening Interview AI…" />}><LandingPage onStart={() => openProtected({ view: 'setup' })} onWorkspace={() => openProtected({ view: 'dashboard' })} /></Suspense></ScreenBoundary>;
  if (view === 'auth') return <ScreenBoundary key="auth"><Suspense fallback={<Loading label="Opening your account…" />}><AuthScreen checkingSession={!authReady} sessionError={authError} onAuthenticated={authenticated} onBack={() => setView('landing')} /></Suspense></ScreenBoundary>;
  if (view === 'room' && session) return <div className="app-shell immersive-host"><ScreenBoundary><Suspense fallback={<Loading label="Preparing the interview room…" />}><InterviewRoom providerName={session.providerName} interviewId={session.sessionId} initialState={session.publicState} plan={session.plan} integrityToken={session.integrityToken} integrityPolicy={session.integrityPolicy} onExitSession={() => { setSession(null); setView('dashboard'); }} onInterviewCompleted={() => { setReportId(session.sessionId); setView('results'); }} /></Suspense></ScreenBoundary></div>;
  return <div className="app-shell"><a className="skip-link" href="#candidate-main">Skip to main content</a><aside className="sidebar"><button className="brand" disabled={view === 'room'} onClick={() => setView('landing')} aria-label="Interview home"><span className="brand-symbol"><BrainIcon size={23} /></span><span>interview<span className="brand-ai">ai</span><small>YOUR PRACTICE STUDIO</small></span></button>
    <div className="nav-label">WORKSPACE</div><nav aria-label="Main navigation"><button className={view === 'dashboard' ? 'active' : ''} disabled={view === 'room'} onClick={() => setView('dashboard')}><BarChartIcon size={19} />Overview</button><button className={view === 'setup' ? 'active' : ''} disabled={view === 'room'} onClick={() => setup()}><SlidersIcon size={19} />Interview setup</button>{view === 'room' && <button className="active" aria-current="page"><SparklesIcon size={19} />Interview studio</button>}{reportId && view !== 'room' && <button className={view === 'results' ? 'active' : ''} onClick={() => setView('results')}><SparklesIcon size={19} />Assessment report</button>}</nav>
    <div className="sidebar-bottom"><div className="workspace-mark">{candidate?.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() ?? 'P'}</div><div><strong>{candidate?.name ?? 'Personal workspace'}</strong><small>{candidate?.email ?? 'Local practice environment'}</small></div></div></aside>
    <div className="main-shell"><header className="topbar"><span>Workspace <span className="breadcrumb-divider">/</span> <strong>{view === 'dashboard' ? 'Overview' : view === 'setup' ? 'Interview setup' : view === 'room' ? 'Interview studio' : 'Assessment'}</strong></span><div className="actions"><Status tone={provider === 'deterministic' ? 'cyan' : ''}>{provider === 'deterministic' ? 'Demo mode' : provider ? `Provider: ${provider}` : 'API not connected'}</Status>{view === 'dashboard' && <Button variant="ghost" onClick={() => setup()}>Start practice <ArrowRightIcon size={15} /></Button>}{candidate && <Button className="account-signout" variant="ghost" disabled={view === 'room'} onClick={() => { void signOut(); }}>Sign out</Button>}</div></header><main id="candidate-main" tabIndex={-1}><ScreenBoundary key={view}><Suspense fallback={<Loading label="Opening your workspace…" />}><BlurFade key={view} duration={0.25} blur="2px" offset={4}>
      {view === 'dashboard' && <Dashboard onStartNewInterview={(sample) => openProtected({ view: 'setup', preset: sample })} onViewInterviewResults={(id) => { setReportId(id); setView('results'); }} />}
      {view === 'setup' && <ResumeUploadView key={preset ?? 'own-profile'} initialPreset={preset} onInterviewPrepared={(next) => { setSession(next); setProvider(next.providerName); setView('room'); }} />}
      {view === 'results' && reportId && <ResultsScreen key={reportId} interviewId={reportId} onRestart={() => setup()} />}
    </BlurFade></Suspense></ScreenBoundary></main><footer className="app-footer"><span>Built around your experience. Guided by your answers.</span><span>Interview AI · Practice with purpose</span></footer></div></div>;
}
