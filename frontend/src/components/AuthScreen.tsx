import { useEffect, useState, type FormEvent } from 'react';
import type { CandidateAuthResponse } from '../types';
import { loginCandidate, registerCandidate } from '../api';
import { Icon } from './icon/Icon';
import { ArrowRight, Brain } from './icon/icons';
import { Button, Card, ErrorNotice, Loading } from './ui';
import { ActionButton, FloatingField, holdSuccess, useShake, type ActionState } from './motion/feedback';

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
  const [state, setState] = useState<ActionState>('idle');
  const busy = state !== 'idle';
  const [error, setError] = useState<string | null>(null);
  // A rejected sign-in shakes the form once, so the error reads as the answer to the click.
  const [form, shake] = useShake<HTMLFormElement>();
  useEffect(() => { if (error) shake(); }, [error, shake]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setState('busy'); setError(null);
    try {
      const result = mode === 'register'
        ? await registerCandidate({ name, email, password })
        : await loginCandidate({ email, password });
      setState('success'); setPassword('');
      await holdSuccess();
      onAuthenticated(result);
    } catch (caught) {
      setError((caught as Error).message);
      setState('idle');
    }
  };

  return <div className="page auth-page">
    <div className="auth-intro"><span className="auth-brand-mark"><Icon icon={Brain} size="feature" /></span><p className="eyebrow">YOUR PRACTICE, YOUR PROGRESS</p><h1>Make every answer part of your story.</h1><p>Your interview plans, resume profiles and evidence-backed reports stay with your candidate account.</p><div className="auth-points"><span><i /> Resume profiles saved to your workspace</span><span><i /> Interview history available after restart</span><span><i /> Private sign-in with secure password hashing</span></div></div>
    <Card className="auth-card">
      {checkingSession ? <Loading label="Checking your account…" /> : <>
        <p className="eyebrow">CANDIDATE ACCOUNT</p><h2>{mode === 'register' ? 'Create your account' : 'Welcome back'}</h2><p className="muted">{mode === 'register' ? 'Save your profile and return to your interview development over time.' : 'Sign in to continue to your interview workspace.'}</p>
        <ErrorNotice message={error ?? sessionError} />
        <form ref={form} className="auth-form" onSubmit={(event) => { void submit(event); }}>
          {mode === 'register' && <FloatingField label="Full name" autoComplete="name" required minLength={2} maxLength={100} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />}
          <FloatingField label="Email address" type="email" autoComplete="email" required maxLength={254} value={email} disabled={busy} onChange={(event) => setEmail(event.target.value)} />
          <FloatingField label="Password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 10 : 1} maxLength={128} value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} hint={mode === 'register' ? 'Use at least 10 characters.' : undefined} />
          <ActionButton type="submit" state={state} disabled={checkingSession} busyLabel={mode === 'register' ? 'Creating your account…' : 'Signing you in…'} successLabel={mode === 'register' ? 'Account created' : 'Signed in'}>{mode === 'register' ? 'Create candidate account' : 'Sign in'}<Icon icon={ArrowRight} /></ActionButton>
        </form>
        <div className="auth-switch"><span>{mode === 'register' ? 'Already have an account?' : 'New to Interview AI?'}</span><Button variant="ghost" disabled={busy} onClick={() => { setError(null); setMode(mode === 'register' ? 'login' : 'register'); }}> {mode === 'register' ? 'Sign in' : 'Create account'}</Button></div>
        <Button className="auth-back" variant="ghost" disabled={busy} onClick={onBack}>Back to home</Button>
      </>}
    </Card>
  </div>;
}
