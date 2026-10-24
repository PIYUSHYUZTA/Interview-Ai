import { captureSettings, encodeCameraFrame } from './visionCapture';
import { useEffect, useState, useRef, type RefObject } from 'react';
import { submitVisionFrame, clearFaceReadiness, ApiError } from '../api';
import type { VisionObservation, FaceReadinessStatus, PublicInterviewState } from '../types';

const capture = captureSettings(import.meta.env);

/** Consented snapshots, bounded in size and time. No recording or frame storage. */
export function useVisionMonitoring(input: {
  video: RefObject<HTMLVideoElement | null>; enabled: boolean; active: boolean;
  interviewId: string; token: string; preflight?: boolean; onReadiness?: (status: FaceReadinessStatus) => void; onState?: (state:PublicInterviewState) => void; onUnavailable?: (message:string) => void;
}) {
  const [faceReadiness, setFaceReadiness] = useState<FaceReadinessStatus | null>(null);
  const callback = useRef(input.onReadiness);
  const stateCallback=useRef(input.onState), unavailableCallback=useRef(input.onUnavailable);
  useEffect(()=>{stateCallback.current=input.onState;unavailableCallback.current=input.onUnavailable;},[input.onState,input.onUnavailable]);
  useEffect(() => { callback.current = input.onReadiness; }, [input.onReadiness]);
  useEffect(() => {
    if (!faceReadiness?.ready || !faceReadiness.expiresAt) return;
    const timer = setTimeout(() => setFaceReadiness(current => current ? { ...current, ready: false, state: 'TRACKING_LOST', message: 'Face readiness expired. Please check again.' } : null), Math.max(0, Date.parse(faceReadiness.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [faceReadiness?.ready, faceReadiness?.expiresAt]);
  const invalidate = async () => { setFaceReadiness(null); setObservation(null); await clearFaceReadiness(input.interviewId, input.token).catch(() => {}); };
  const [observation, setObservation] = useState<VisionObservation | null>(null);
  const [observationSession,setObservationSession]=useState<string|null>(null);
  const [observedAt,setObservedAt]=useState<number|null>(null);
  useEffect(()=>{if(observedAt===null)return;const timer=setTimeout(()=>setObservation(null),Math.max(0,observedAt+6000-Date.now()));return()=>clearTimeout(timer);},[observedAt]);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState('Off');
  const [diagnostics, setDiagnostics] = useState({ captured: 0, submitted: 0, analyzed: 0, failures: 0 });
  useEffect(() => {
    if (!input.enabled || !input.active) return;
    let cancelled = false;
    let halted = false;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | null = null;
    const canvas = document.createElement('canvas');
    const sample = async () => {
      const video = input.video.current;
      if (document.visibilityState !== 'visible') setStatus('Sampling paused while the interview tab is hidden');
      else if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight || !(video.srcObject as MediaStream | null)?.getVideoTracks().some(track => track.readyState === 'live' && track.enabled && !track.muted)) {
        setObservation(null); setStatus('Waiting for an active camera frame');
      } else {
        let deadline: ReturnType<typeof setTimeout> | undefined;
        try {
          // Bound BOTH axes, including portrait/rotated cameras. Preserve aspect ratio.
          const scale = Math.min(1, capture.maxEdge / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Camera frame capture is unavailable in this browser.');
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = await encodeCameraFrame(canvas);
          if (cancelled) return;
          if (document.hidden) { timer = setTimeout(() => void sample(), capture.intervalMs); return; }
          setDiagnostics(d => ({ ...d, captured: d.captured + 1, submitted: d.submitted + 1 }));
          request = new AbortController();
          // Passing a signal bypasses the API client's default timeout: own this deadline.
          deadline = setTimeout(() => request?.abort(), 25000);
          setStatus('Analyzing sampled frame');
          const result = await submitVisionFrame(input.interviewId, input.token, image, request.signal, input.preflight);
          if (!cancelled) {
            stateCallback.current?.(result.publicState);
            if (['COMPLETED','TERMINATED_FOR_INTEGRITY'].includes(result.publicState.state)) { halted=true;setObservation(null);setStatus('Interview ended · visual monitoring stopped');return; }
            if (result.faceReadiness) { setFaceReadiness(result.faceReadiness); callback.current?.(result.faceReadiness); }
            setFrameSize({ width: canvas.width, height: canvas.height }); setObservationSession(input.interviewId); setObservation(result.observation); setObservedAt(result.observedAt?Date.parse(result.observedAt):null); setNotice([...result.notices, ...Object.entries(result.observation.moduleStatus ?? {}).filter(([, value]) => value !== 'ready').map(([name, value]) => `${name} tracking ${value}. Face presence remains available.`)].join(' '));
            setDiagnostics(d => ({ ...d, analyzed: d.analyzed + 1 }));
            setStatus(input.preflight ? 'Face-readiness sample analyzed' : `Connected · sampled every ${capture.intervalMs / 1000} seconds`);
          }
        } catch (error) {
          if (!cancelled) {
            if (error instanceof ApiError && [400,401,403,404,409,410].includes(error.status)) {
              halted=true;setObservation(null);setStatus('Visual monitoring stopped · session unavailable');setNotice(error.message);
              if (error.publicState) stateCallback.current?.(error.publicState);
              else unavailableCallback.current?.(error.message);
              return;
            }
            setObservation(null); setDiagnostics(d => ({ ...d, failures: d.failures + 1 }));
            setStatus('Visual analysis unavailable · retrying');
            if (input.preflight) { const failed: FaceReadinessStatus = { state: 'UNAVAILABLE', ready: false, identityVerified: false, identityVerification: 'not_implemented', checkedAt: null, expiresAt: null, goodSamples: 0, message: 'Face check unavailable. Retry when ready.' }; setFaceReadiness(failed); callback.current?.(failed); }
            setNotice(`${request?.signal.aborted ? 'Camera analysis request timed out or was interrupted.' : (error as Error).message} No warning was added. Sampling will retry automatically.`);
          }
        } finally { if (deadline) clearTimeout(deadline); request = null; }
      }
      if (!cancelled && !halted) timer = setTimeout(() => void sample(), capture.intervalMs);
    };
    const visibility = () => { if (document.hidden) { request?.abort(); setObservation(null); } };
    document.addEventListener('visibilitychange', visibility);
    void sample();
    return () => { cancelled = true; clearTimeout(timer); request?.abort(); document.removeEventListener('visibilitychange', visibility); canvas.width = 0; canvas.height = 0; };
  }, [input.enabled, input.active, input.interviewId, input.token, input.video, input.preflight]);
  return { observation: input.enabled && observationSession===input.interviewId && (input.active || input.preflight) ? observation : null, notice: input.enabled && input.active ? notice : '', status: input.enabled && input.active ? status : 'Off', diagnostics, frameSize, faceReadiness, observedAt:observationSession===input.interviewId?observedAt:null, invalidate };
}
