import { useEffect, useRef, useState } from 'react';
import type { IntegrityPolicy, PublicInterviewState } from '../types';
import { submitIntegrityEvent } from '../api';

type EventType = Parameters<typeof submitIntegrityEvent>[2]['eventType'];

export function useInterviewIntegrity(input: {
  interviewId: string; token: string; policy: IntegrityPolicy; state: PublicInterviewState;
  onState: (state: PublicInterviewState) => void; technicalError?: string | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [windowBlurred, setWindowBlurred] = useState(false);
  const callback = useRef(input.onState);
  const technical = useRef(input.technicalError);
  useEffect(() => { callback.current = input.onState; technical.current = input.technicalError; }, [input.onState, input.technicalError]);
  const active = ['IN_PROGRESS', 'EVALUATING'].includes(input.state.state);

  useEffect(() => {
    if (!active || input.state.timing.sessionStartedAt === null) return;
    const eligibleAt = input.state.timing.sessionStartedAt + input.policy.monitoringGracePeriodMs;
    const incidents = new Map<EventType, { id: string; since: number; sent: boolean }>();
    let closed = false;
    let wasFullscreen = !!document.fullscreenElement;
    let fullscreenExited = false;
    const submit = (type: EventType, incident: { id: string; since: number; sent: boolean }) => {
      const now = Date.now();
      const durationMs = Math.floor(now - incident.since);
      if (incident.sent || durationMs < (type === 'tab_visible' ? input.policy.minimumTabVisibleDurationMs : input.policy.minimumTabHiddenDurationMs)) return;
      incident.sent = true;
      setSending(true);
      void submitIntegrityEvent(input.interviewId, input.token, {
        eventId: incident.id, eventType: type, occurredAt: new Date(now).toISOString(), durationMs,
      }).then((response) => {
        if (closed) return;
        callback.current(response.publicState);
        setError(null);
        if (type !== 'tab_visible' && !response.duplicate && !response.suppressed) setMessage(response.message);
      }).catch(() => {
        if (!closed) { setError('Monitoring could not synchronize with the interview server. No warning was added by this browser.'); incident.sent = false; }
      }).finally(() => { if (!closed) setSending(false); });
    };
    const update = (type: EventType, present: boolean) => {
      const current = incidents.get(type);
      if (!present) {
        if (current) submit(type, current);
        incidents.delete(type);
      } else {
        const incident = current ?? { id: crypto.randomUUID(), since: Math.max(Date.now(), eligibleAt), sent: false };
        incidents.set(type, incident); submit(type, incident);
      }
    };
    const tick = () => {
      update('tab_hidden', document.visibilityState === 'hidden');
      update('tab_visible', document.visibilityState === 'visible');
      update('window_unfocused', !document.hasFocus());
      update('fullscreen_exited', fullscreenExited);
      update('connection_interrupted', !navigator.onLine || !!technical.current?.includes('API'));
      update('camera_interrupted', !!technical.current?.toLowerCase().includes('camera disconnected'));
      update('microphone_interrupted', !!technical.current?.toLowerCase().includes('microphone disconnected'));
    };
    const onFullscreen = () => {
      if (document.fullscreenElement) { wasFullscreen = true; fullscreenExited = false; }
      else if (wasFullscreen) fullscreenExited = true;
      tick();
    };
    const onFocus = () => { setWindowBlurred(!document.hasFocus()); tick(); };
    const interval = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('blur', onFocus); window.addEventListener('focus', onFocus);
    window.addEventListener('online', tick); window.addEventListener('offline', tick);
    tick();
    return () => {
      closed = true; clearInterval(interval);
      document.removeEventListener('visibilitychange', tick); document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('blur', onFocus); window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', tick); window.removeEventListener('offline', tick);
    };
  }, [active, input.interviewId, input.token, input.policy.monitoringGracePeriodMs, input.policy.minimumTabHiddenDurationMs, input.policy.minimumTabVisibleDurationMs, input.state.timing.sessionStartedAt]);
  // Camera warnings arrive on frame responses; they share this panel. The count itself always comes from the server.
  return { message, error, sending, windowBlurred, clearMessage: () => setMessage(null), showWarning: setMessage };
}
