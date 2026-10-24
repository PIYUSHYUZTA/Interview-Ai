import { useState, type FormEvent } from 'react';
import type { CandidateAuthResponse } from '../types';
import { loginCandidate, registerCandidate } from '../api';
import { ArrowRightIcon, BrainIcon } from './Icons';
import { Button, Card, ErrorNotice, Loading } from './ui';

interface Props {
  checkingSession: boolean;
  sessionError: string | null;
  onAuthenticated: (result: CandidateAuthResponse) => void;
  onBack: () => void;
}

export function AuthScreen({ checkingSession, sessionError, onAuthenticated, onBack }: Props) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = mode === 'register'
        ? await registerCandidate({ name, email, password })
        : await loginCandidate({ email, password });
      setPassword(''); onAuthenticated(result);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return <div className="page auth-page">
    <div className="auth-intro"><span className="auth-brand-mark"><BrainIcon size={25} /></span><p className="eyebrow">YOUR PRACTICE, YOUR PROGRESS</p><h1>Make every answer part of your story.</h1><p>Your interview plans, resume profiles and evidence-backed reports stay with your candidate account.</p><div className="auth-points"><span><i /> Resume profiles saved to your workspace</span><span><i /> Interview history available after restart</span><span><i /> Private sign-in with secure password hashing</span></div></div>
    <Card className="auth-card">
      {checkingSession ? <Loading label="Checking your account…" /> : <>
        <p className="eyebrow">CANDIDATE ACCOUNT</p><h2>{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2><p className="muted">{mode === 'register' ? 'Save your profile and return to your interview development over time.' : 'Sign in to continue to your interview workspace.'}</p>
        <ErrorNotice message={error ?? sessionError} />
        <form className="auth-form" onSubmit={(event) => { void submit(event); }}>
          {mode === 'register' && <label className="field">Full name<input aria-label="Full name" autoComplete="name" required minLength={2} maxLength={100} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>}
          <label className="field">Email address<input aria-label="Email address" type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="field">Password<input aria-label="Password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 10 : 1} maxLength={128} value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />{mode === 'register' && <small>Use at least 10 characters.</small>}</label>
          <Button type="submit" disabled={busy || checkingSession}>{busy ? 'Signing you in…' : mode === 'register' ? 'Create candidate account' : 'Sign in'}<ArrowRightIcon size={16} /></Button>
        </form>
        <div className="auth-switch"><span>{mode === 'register' ? 'Already have an account?' : 'New to Interview AI?'}</span><Button variant="ghost" disabled={busy} onClick={() => { setError(null); setMode(mode === 'register' ? 'login' : 'register'); }}> {mode === 'register' ? 'Sign in' : 'Create account'}</Button></div>
        <Button className="auth-back" variant="ghost" disabled={busy} onClick={onBack}>Back to home</Button>
      </>}
    </Card>
  </div>;
}
