import { MonitoringStatus } from './MonitoringStatus';
import { faceStatus } from './monitoringPresentation';

import { useCallback, useEffect, useRef, useState } from 'react';



import { VisionOverlay } from './VisionOverlay';



import { DeviceCheck } from './DeviceCheck';



import { InterviewerVisual } from './InterviewerVisual';



import { useInterviewMedia } from './useInterviewMedia';



import { useInterviewIntegrity } from './useInterviewIntegrity';



import { useVisionMonitoring } from './useVisionMonitoring';



import { startInterview, submitAnswer, getNextQuestion, completeInterview, clearFaceReadiness, getInterviewDiagnostics, type InterviewDiagnostics } from '../api';



import { Button, ErrorNotice, Modal, Status } from './ui';
import { useSoundSuppressed } from './sound/sound';
import { BellRingIcon, CheckDrawIcon, Icon } from './icon/Icon';
import { Mic, MicOff } from './icon/icons';



import type { IntegrityPolicy, InterviewCreateResponse, InterviewCompleteResponse, PublicInterviewState } from '../types';







type Phase = 'ready' | 'preparing' | 'playback' | 'speaking' | 'connecting' | 'listening' | 'transcribing' | 'evaluating' | 'paused' | 'error' | 'complete';



interface Props { providerName?: string; interviewId: string; initialState: PublicInterviewState; plan?: InterviewCreateResponse['plan']; integrityToken: string; integrityPolicy: IntegrityPolicy; onInterviewCompleted: (result: InterviewCompleteResponse) => void; onExitSession?: () => void }



export function InterviewRoom({ providerName, interviewId, initialState, plan, integrityToken, integrityPolicy, onInterviewCompleted, onExitSession }: Props) {
  // Interface sounds stay off in the room: the microphone is listening and the interviewer speaks.
  useSoundSuppressed();



  const root = useRef<HTMLElement>(null);



  const [state, setStateRaw] = useState(initialState);



  const [question, setQuestion] = useState(initialState.currentQuestion);



  const [recognitionMode,setRecognitionMode]=useState<'local'|'browser'>('local');

  const [avatarStatus,setAvatarStatus]=useState<'loading'|'ready'|'fallback'>('loading');

  const [avatarRevision,setAvatarRevision]=useState(0);

  const [phase, setPhase] = useState<Phase>('ready');



  const [transcript, setTranscript] = useState('');



  const [error, setError] = useState<string | null>(null);



  const [fullscreen, setFullscreen] = useState(false);



  const [fullscreenMessage, setFullscreenMessage] = useState('');



  const [exit, setExit] = useState(false);



  const [showOverlays,setShowOverlays]=useState(true);

  const [diagnostics, setDiagnostics] = useState<InterviewDiagnostics | null>(null);



  const [diagnosticsError, setDiagnosticsError] = useState('');



  const [checks, setChecks] = useState(false);



  const [checkingFace, setCheckingFace] = useState(false);



  const [consent, setConsent] = useState(false);

  const monitoringLease=useRef(false);



  const [elapsed, setElapsed] = useState(0);



  const [failure, setFailure] = useState<'next' | 'report' | null>(null);



  const completionPending = useRef(false);



  const [review, setReview] = useState('');



  const active = useRef(false); const mounted = useRef(true); const terminal = useRef(false);



  const words = useRef(''); const questionRef = useRef(question); const inFlight = useRef(false);



  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);



  const noSpeech = useRef<ReturnType<typeof setTimeout> | null>(null);



  const continuation = useRef<ReturnType<typeof setTimeout> | null>(null);



  const finishRef = useRef<() => void>(() => {});
  const [userPaused, setUserPaused] = useState<null | 'speaking' | 'question' | 'listening'>(null);
  const [conversation, setConversation] = useState<Array<{ question: string; answer: string }>>([]);



  const listenRef = useRef<() => void>(() => {});



  const clearVoiceTimers = useCallback(() => { for (const timer of [silence, noSpeech, continuation]) { if (timer.current) clearTimeout(timer.current); timer.current = null; } }, []);



  const { video, ...media } = useInterviewMedia(question?.id, (text) => {



    if (!active.current || terminal.current || inFlight.current) return;



    words.current = `${words.current} ${text}`.trim(); setTranscript(words.current);



  }, { onPlaybackStart: () => { if (active.current && !terminal.current) setPhase('speaking'); }, onPlaybackEnd: () => listenRef.current(), onSpeechActivity:()=>{if(noSpeech.current)clearTimeout(noSpeech.current);},onTranscriptionStart:()=>{if(active.current&&!terminal.current){clearVoiceTimers();setPhase('transcribing');}},onRecognitionEnd: () => { if (active.current && !terminal.current && !inFlight.current) finishRef.current(); } }, interviewId, recognitionMode);



  // Imperative callbacks only: rendered capture status stays in React state.



  const mediaRef = useRef({ stopMicrophone: media.stopMicrophone, stopSpeaking: media.stopSpeaking, stopCamera: media.stopCamera, speak: media.speak, toggleMicrophone: media.toggleMicrophone, finishMicrophone: media.finishMicrophone, releaseMicrophone:media.releaseMicrophone, pauseSpeaking: media.pauseSpeaking, resumeSpeaking: media.resumeSpeaking });



  useEffect(() => { mediaRef.current = { stopMicrophone: media.stopMicrophone, stopSpeaking: media.stopSpeaking, stopCamera: media.stopCamera, speak: media.speak, toggleMicrophone: media.toggleMicrophone, finishMicrophone: media.finishMicrophone, releaseMicrophone:media.releaseMicrophone, pauseSpeaking: media.pauseSpeaking, resumeSpeaking: media.resumeSpeaking }; }, [media]);



  useEffect(() => { questionRef.current = question; }, [question]);



  const stop = useCallback(() => { active.current = false; clearVoiceTimers(); mediaRef.current.stopMicrophone(); mediaRef.current.stopSpeaking(); mediaRef.current.stopCamera(); mediaRef.current.releaseMicrophone(); }, [clearVoiceTimers]);



  const setState = useCallback((next: PublicInterviewState) => {



    if (terminal.current) return;



    if (next.state === 'TERMINATED_FOR_INTEGRITY') { terminal.current = true; stop(); }

    if (next.state === 'COMPLETED') { stop();setPhase('complete'); }



    setStateRaw(next);



  }, [stop]);







  const syncProctoringState=useCallback((next:PublicInterviewState)=>{

    if (terminal.current) return;

    if (['COMPLETED','TERMINATED_FOR_INTEGRITY'].includes(next.state)) {setState(next);return;}

    // Camera responses must not rewind question/answer progression when responses arrive late.

    setStateRaw(current=>({...current,integrity:{...next.integrity,warningCount:Math.max(current.integrity.warningCount,next.integrity.warningCount)}}));

  },[setState]);

  const monitoringUnavailable=useCallback((message:string)=>{stop();setError(message);setPhase('error');},[stop]);

  const integrity = useInterviewIntegrity({ interviewId, token: integrityToken, policy: integrityPolicy, state, onState: syncProctoringState, technicalError: error ?? media.error });



  const vision = useVisionMonitoring({ onState:syncProctoringState, onUnavailable:monitoringUnavailable, onWarning:integrity.showWarning, video, enabled: consent, active: media.camera && (checkingFace || ['IN_PROGRESS', 'EVALUATING'].includes(state.state)), preflight: phase === 'ready', onReadiness: (readiness) => { if (readiness.ready || readiness.state !== 'FACE_PRESENT') setCheckingFace(false); }, interviewId, token: integrityToken });



  useEffect(()=>{monitoringLease.current=consent&&media.camera;},[consent,media.camera]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); if(monitoringLease.current) void clearFaceReadiness(interviewId,integrityToken).catch(()=>{}); }; }, [stop,interviewId,integrityToken]);



  useEffect(() => {



    const sync = () => { setFullscreen(document.fullscreenElement === root.current); if (!document.fullscreenElement && active.current) setFullscreenMessage(integrityPolicy.fullscreenRequired ? 'Fullscreen is required. Return to fullscreen to continue.' : 'Fullscreen exited. You are still in the dedicated interview room.'); };



    document.addEventListener('fullscreenchange', sync); return () => document.removeEventListener('fullscreenchange', sync);



  }, [integrityPolicy.fullscreenRequired]);



  useEffect(() => {



    if (integrityPolicy.fullscreenRequired && !fullscreen && active.current) { clearVoiceTimers(); mediaRef.current.stopMicrophone(); mediaRef.current.stopSpeaking(); setPhase('paused'); }



  }, [fullscreen, integrityPolicy.fullscreenRequired, clearVoiceTimers]);



  useEffect(() => {



    if (!active.current || terminal.current) return;



    const timer = setInterval(() => setElapsed((n) => n + 1), 1000); return () => clearInterval(timer);



  }, [state.state]);



  useEffect(() => {



    if (!media.error || !active.current || terminal.current) return;



    clearVoiceTimers(); mediaRef.current.stopMicrophone(); mediaRef.current.stopSpeaking(); setError(media.error); setPhase('error');



  }, [media.error, clearVoiceTimers]);



  useEffect(() => {



    if (!media.listening || !active.current) return;



    setPhase('listening');



    noSpeech.current = setTimeout(() => { mediaRef.current.stopMicrophone(); setPhase('paused'); setError('No completed speech was received. Check the microphone and retry your spoken answer. Nothing was submitted.'); }, 45000);



    return () => { if (noSpeech.current) clearTimeout(noSpeech.current); };



  }, [media.listening]);



  useEffect(() => {



    if (!media.listening || (!transcript && !media.interim)) return;



    if (noSpeech.current) clearTimeout(noSpeech.current);



    if (silence.current) clearTimeout(silence.current);



    silence.current = setTimeout(() => { setPhase('transcribing'); mediaRef.current.finishMicrophone(); }, 5000);



    return () => { if (silence.current) clearTimeout(silence.current); };



  }, [transcript, media.interim, media.listening]);



  const requestFullscreen = () => {



    if (!document.fullscreenElement && root.current?.requestFullscreen) return root.current.requestFullscreen().then(() => setFullscreenMessage('')).catch(() => setFullscreenMessage('The browser did not allow fullscreen. Use Enter fullscreen to retry.'));



    return Promise.resolve();



  };



  const speakCurrent = () => {



    if (!active.current || terminal.current || !questionRef.current) return;



    if (integrityPolicy.fullscreenRequired && document.fullscreenElement !== root.current) { setPhase('paused'); setFullscreenMessage('Fullscreen is required. Return to fullscreen to continue.'); return; }



    clearVoiceTimers(); setError(null); setUserPaused(null); setPhase('playback'); mediaRef.current.speak(questionRef.current.prompt);



  };



  const beginListening = () => {



    if (!active.current || terminal.current || inFlight.current) return;



    if (integrityPolicy.fullscreenRequired && document.fullscreenElement !== root.current) { setPhase('paused'); setFullscreenMessage('Fullscreen is required. Return to fullscreen to continue.'); return; }



    mediaRef.current.stopSpeaking(); setUserPaused(null); setError(null); setPhase('connecting'); void mediaRef.current.toggleMicrophone(true);



  };



  useEffect(() => { listenRef.current = beginListening; });
  // Interruption: the candidate takes the turn, so question audio and mouth animation stop first.
  // in beginListening stops question audio and mouth animation before the microphone opens.
  const pauseInterview = () => {
    if (!active.current || terminal.current) return;
    clearVoiceTimers();
    if (phase === 'speaking' && mediaRef.current.pauseSpeaking()) setUserPaused('speaking');
    else if (phase === 'speaking' || phase === 'playback') { mediaRef.current.stopSpeaking(); setUserPaused('question'); }
    else { mediaRef.current.stopMicrophone(); setUserPaused('listening'); }
    setPhase('paused');
  };
  const resumeInterview = () => {
    const from = userPaused; setUserPaused(null);
    if (from === 'speaking' && mediaRef.current.resumeSpeaking()) return;
    if (from === 'speaking' || from === 'question') speakCurrent(); else listenRef.current();
  };



  const advance = async () => {



    if (!mounted.current || terminal.current) return;



    setPhase('preparing');



    try {



      const next = await getNextQuestion(interviewId);



      if (!mounted.current || terminal.current) return;



      setState(next.publicState); setElapsed(0); setFailure(null); words.current = ''; setTranscript(''); setReview(''); setQuestion(next.currentQuestion); questionRef.current = next.currentQuestion; inFlight.current = false;



      continuation.current = setTimeout(speakCurrent, 150);



    } catch (caught) { if (mounted.current && !terminal.current) { setError((caught as Error).message); setFailure('next'); setPhase('error'); } }



  };



  const finishAnswer = () => {



    if (!active.current || terminal.current || inFlight.current) return;



    clearVoiceTimers(); mediaRef.current.stopMicrophone();



    const text = words.current.trim();



    if (!text) { setPhase('paused'); setError('No completed transcript was received. Please retry speaking. No answer was submitted.'); return; }



    inFlight.current = true; setPhase('evaluating'); setError(null);



    void (async () => {



      try {



        const result = await submitAnswer(interviewId, { questionId: questionRef.current?.id, text, elapsedSec: elapsed });



        if (!mounted.current || terminal.current) return;



        setConversation((items) => [...items, { question: questionRef.current?.prompt ?? '', answer: text }]); setState(result.publicState); setReview('Answer evaluated. Preparing your adaptive follow-up.');



        if (result.publicState.state === 'COMPLETED') {



          completionPending.current = true; stop(); setPhase('complete'); const completed = await completeInterview(interviewId);



          if (mounted.current && !terminal.current) { if (document.fullscreenElement) await document.exitFullscreen().catch(() => {}); onInterviewCompleted(completed); }



        } else continuation.current = setTimeout(() => void advance(), 900);



      } catch (caught) { if (mounted.current && !terminal.current) { inFlight.current = false; if (completionPending.current) setFailure('report'); setError((caught as Error).message); setPhase('error'); } }



    })();



  };



  useEffect(() => { finishRef.current = finishAnswer; });



  const start = async () => {



    if (phase !== 'ready') return;



    setError(null); setPhase('preparing');



    // Missing browser services must not consume the session's first question.



    const browser = window as import('./useInterviewMedia').SpeechWindow;



    if ((recognitionMode==='local' ? !window.AudioWorkletNode||!window.AudioContext : !(browser.SpeechRecognition ?? browser.webkitSpeechRecognition)) || !navigator.mediaDevices?.getUserMedia) { setError('The selected speech service is not supported in this browser. Choose another speech service or use a supported browser. No interview was started.'); setPhase('ready'); return; }



    // Fullscreen is requested directly from this trusted button gesture, before network awaits.



    const entering = requestFullscreen();



    try {



      // Request permission before consuming the first backend question.

      await media.prepareMicrophone();

      await entering;



      if (integrityPolicy.fullscreenRequired && !document.fullscreenElement) throw new Error('Enter fullscreen before starting this interview.');



      if (consent && !media.camera && !await media.toggleCamera()) throw new Error('Camera monitoring could not start. Enable camera access or turn off optional visual monitoring before retrying.');



      if (consent && !vision.faceReadiness?.ready) throw new Error('Complete the face-readiness check before starting the proctored interview. This check does not verify identity.');



      const result = await startInterview(interviewId, consent);



      if (!mounted.current) return;



      active.current = true; setState(result.publicState); setQuestion(result.currentQuestion); questionRef.current = result.currentQuestion; setElapsed(0);



      continuation.current = setTimeout(speakCurrent, 150);



    } catch (caught) {

      media.releaseMicrophone();

      const failure=caught as Error;

      setError(failure.name==='NotAllowedError'?'Microphone permission denied. Allow microphone access in the browser site settings, then start again. No question was consumed.':failure.name==='NotFoundError'?'No microphone was found. Connect one and start again.':failure.name==='NotReadableError'?'The microphone is unavailable or in use by another app. Check your device and retry.':failure.message);

      setPhase('ready');

    }



  };



  const leave = useCallback(() => { stop(); if (!terminal.current) void clearFaceReadiness(interviewId, integrityToken).catch(() => {}); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); onExitSession?.(); }, [stop, onExitSession, interviewId, integrityToken]);



  const terminated = state.state === 'TERMINATED_FOR_INTEGRITY';



  useEffect(() => { if (!terminated) return; stop(); const timer = setTimeout(leave, 15000); return () => clearTimeout(timer); }, [terminated, stop, leave]);



  const labels: Record<Phase, string> = { ready: 'Ready for your voice interview', preparing: 'Preparing your next question', playback: 'Preparing question playback', speaking: 'AI Speaking  -  Interviewer is speaking', connecting: 'Connecting microphone and speech service', listening: 'Listening to your answer', transcribing: 'Processing  -  Transcribing your answer', evaluating: 'Processing  -  Evaluating your answer', paused: 'Voice paused', error: 'Voice needs attention', complete: 'Interview completed' };



  const total = plan?.totalQuestionBudget ?? state.maxRounds * state.progress.questionBudgetInRound;



  return <main ref={root} id="room-main" tabIndex={-1} className={`immersive-room ${phase !== 'ready' ? 'interview-active' : ''} ${fullscreen ? 'is-fullscreen' : ''}`}>



    <header className="immersive-toolbar"><strong>Interview AI <small>{providerName === 'deterministic' ? 'Deterministic demo · voice interview' : 'Voice interview'}</small></strong><span>Round {state.currentRound}/{state.maxRounds} · {state.progress.totalQuestionsAnswered}/{total} answers</span><Status tone={state.integrity.warningCount ? 'warning' : ''}>Warnings {state.integrity.warningCount}/{integrityPolicy.maximumWarnings}</Status><Button variant="ghost" onClick={() => void requestFullscreen()}>Enter fullscreen</Button><Button variant="ghost" onClick={() => setExit(true)}>Exit interview</Button></header>



    {terminated ? <section className="integrity-termination-card" role="alert"><h1>This interview has ended.</h1><p>{state.integrity.terminationReason}</p><p>Capture, playback and timers have stopped. This session cannot be restored by refreshing.</p><Button onClick={leave}>Return to your workspace</Button></section> : <>



      <progress aria-label="Interview progress" value={state.progress.totalQuestionsAnswered} max={total} />



      <ErrorNotice message={error ?? media.error} />{fullscreenMessage && <div className="voice-notice" role="status"><p>{fullscreenMessage}</p><Button variant="secondary" onClick={() => void requestFullscreen()}>Return to fullscreen</Button></div>}



      {integrity.message && <div role="alert" className={`integrity-warning-panel ${state.integrity.warningCount >= 2 ? 'final-warning' : ''}`}><div><h2 className="ds-cluster"><BellRingIcon ringKey={integrity.message} />{state.integrity.warningCount >= 2 ? 'Final integrity warning' : 'Interview integrity notice'}</h2><p>{integrity.message}</p></div><Button variant="secondary" onClick={integrity.clearMessage}>Dismiss notice</Button></div>}



      <div className="immersive-grid"><section className="voice-interviewer"><InterviewerVisual key={avatarRevision} onStatusChange={setAvatarStatus} immersive speech={media.avatarSpeech} state={phase === 'speaking' ? 'streaming' : phase === 'listening' ? 'listening' : ['preparing','evaluating'].includes(phase) ? 'thinking' : phase === 'error' ? 'error' : 'idle'} size={120} />{avatarStatus === 'fallback' && <div className="avatar-recovery" role="status">The 3D view is unavailable. Voice and interview progression remain available.<Button variant="ghost" onClick={()=>{setAvatarStatus('loading');setAvatarRevision(value=>value+1);}}>Retry 3D view</Button></div>}<Status tone="cyan">{media.listening&&media.inputLevel>3?'You are speaking  -  Microphone input detected':labels[phase]}</Status><p className="avatar-connection" role="status">{media.speechMode === 'synchronized' ? (avatarStatus==='ready'?'Local voice connected · audio-synchronized facial animation':`Local voice connected · 3D view ${avatarStatus==='loading'?'loading':'unavailable'}`) : media.speechMode === 'browser' ? media.speechNotice : '3D interviewer · voice connects when you start'}</p><h1>{question?.prompt ?? 'A conversation about your experience.'}</h1><p>{plan?.roleTitle} · {plan?.candidateName}</p>{phase!=='ready'&&<section className="voice-console" aria-label="Voice answer controls">
          <div className="voice-console-status"><strong>{media.listening?(media.inputLevel>3?'You are speaking':'Listening'):['transcribing','evaluating','preparing'].includes(phase)?'Processing':phase==='speaking'?'AI Speaking':userPaused?'Interview paused':phase==='playback'?'Preparing question':phase==='connecting'?'Connecting microphone':'Microphone paused'}</strong><span>{media.listening?'Speak naturally. Pause for five seconds or choose Done speaking.':phase==='speaking'?'Choose Interrupt and answer to respond now.':userPaused?'Nothing is being played or recorded. Resume when you are ready.':media.micPending?'Waiting for microphone permission and capture - ':'Your microphone opens after the question finishes.'}</span></div>
          <meter aria-label="Microphone input level" min="0" max="100" value={media.listening?media.inputLevel:0} />
          <div className="actions"><Button variant={media.listening?'secondary':'primary'} disabled={['preparing','transcribing','evaluating','complete'].includes(phase)} aria-pressed={media.listening} onClick={()=>{if(media.listening||media.micPending){clearVoiceTimers();media.stopMicrophone();setPhase('paused');}else listenRef.current();}}><Icon icon={media.listening||media.micPending ? MicOff : Mic} />{media.listening?'Pause microphone':media.micPending?'Cancel microphone capture':['speaking','playback'].includes(phase)?'Interrupt and answer':'Start microphone'}</Button>
          {(userPaused||['speaking','playback','listening','connecting'].includes(phase))&&<Button variant="secondary" aria-pressed={!!userPaused} onClick={userPaused?resumeInterview:pauseInterview}>{userPaused?'Resume interview':'Pause interview'}</Button>}
          <Button variant="ghost" disabled={['preparing','transcribing','evaluating','complete'].includes(phase)} onClick={speakCurrent}>Replay question</Button>
          {media.listening&&<Button variant="secondary" onClick={()=>{clearVoiceTimers();media.stopMicrophone();words.current='';setTranscript('');setReview('');listenRef.current();}}>Record answer again</Button>}</div>
        </section>}



        {phase === 'ready' && <div className="voice-start"><p>The interviewer speaks each question, then listens. After a five-second pause, completed speech is evaluated and the next question follows. You can also choose Done speaking. No typed answers are required.</p><p className="fine-print">Local English dictation sends one short answer recording to this backend and discards the audio after transcription. Browser recognition is also available; its vendor may process audio. This application does not save candidate audio. Local Windows question playback includes audio-synchronized mouth animation; browser playback is a fallback without lip synchronization. Capture permissions and successful transcription are separate checks.</p><label>Speech transcription<select aria-label="Speech transcription" value={recognitionMode} onChange={event=>setRecognitionMode(event.target.value as 'local'|'browser')}><option value="local">Local English dictation (Windows)</option><option value="browser">Browser speech service</option></select></label><details><summary>Monitoring and warning policy</summary><p>After a {integrityPolicy.monitoringGracePeriodMs / 1000}-second grace period, a hidden tab lasting {integrityPolicy.minimumTabHiddenDurationMs / 1000} seconds may add one warning. Two warnings are allowed; the third distinct qualifying incident terminates the interview. A new incident requires at least {integrityPolicy.minimumTabVisibleDurationMs / 1000} seconds visibly back in this tab and a {integrityPolicy.duplicateSuppressionMs / 1000}-second cooldown after the previous warning. Continuous absence counts once. Focus/fullscreen changes and technical failures are recorded without automatic cheating penalties. Visual observations do not prove intent or external AI use. Event metadata is retained for 30 days; raw frames are discarded.</p></details><label><input type="checkbox" aria-describedby="tracking-consent-hint" checked={consent} onChange={(e) => { setConsent(e.target.checked); setCheckingFace(false); vision.invalidate(); }} /> Allow sampled Python visual monitoring with my camera</label><p id="tracking-consent-hint" className={`tracking-hint ${consent ? 'is-on' : 'is-off'}`} role="status">{consent ? 'Face, eye and hand tracking will run on camera samples (a few per second) once the interview starts.' : 'Face, eye and hand tracking are off. They only run if you tick this box before starting; the camera preview on its own is never analysed.'}</p>{consent && <section className="face-readiness-panel" aria-label="Face readiness"><h3>Face readiness · not identity verification</h3><p>Be the only person in view. Face the camera, move closer if needed and use even lighting. Two clear samples are required; no reference photo or biometric identity is created.</p><Button variant="secondary" disabled={checkingFace || media.cameraPending} onClick={() => { setError(null); void (async () => { await vision.invalidate(); if (!media.camera && !await media.toggleCamera()) return; setCheckingFace(true); })(); }}>{checkingFace ? 'Checking face readiness…' : 'Check face readiness'}</Button>{vision.faceReadiness && <p role="status" className="ds-cluster">{vision.faceReadiness.ready && <CheckDrawIcon />}{vision.faceReadiness.message}</p>}{vision.notice && <p role="status">{vision.notice}</p>}<p className="fine-print">Identity verification: not implemented. Face readiness expires after 30 seconds. Unchecking stops capture and requests deletion of readiness metadata.</p></section>}<p className="fine-print">With consent, still frames are sent to this backend a few times per second and discarded after analysis. The backend, not Python, controls warnings. Camera/model failures add no cheating penalty.</p><details open={checks} onToggle={(e) => setChecks(e.currentTarget.open)}><summary>Optional camera, microphone and sound check</summary>{checks && <DeviceCheck camera={media.camera} cameraPending={media.cameraPending} onCamera={media.toggleCamera} />}</details><Button disabled={media.cameraPending || checkingFace} onClick={() => void start()}>Start voice interview</Button></div>}



        {phase !== 'ready' && <><div className="voice-transcript" role="log" aria-label="Interview transcript" aria-live="polite"><span>YOUR TRANSCRIPT</span><p>{transcript || 'Your completed spoken words will appear here.'}</p>{media.interim && <em>{media.interim}</em>}</div>{review && <p role="status">{review}</p>}{conversation.length > 0 && <details className="voice-conversation"><summary>Conversation so far ({conversation.length})</summary><ol>{conversation.map((item, index) => <li key={index}><span>INTERVIEWER</span><p>{item.question}</p><span>YOU</span><p>{item.answer}</p></li>)}</ol></details>}<div className="actions">{media.listening && <Button onClick={() => { setPhase('transcribing'); media.finishMicrophone(); }}>Done speaking</Button>}{failure === 'next' ? <Button onClick={() => void advance()}>Retry next question</Button> : failure === 'report' ? <Button onClick={() => { void completeInterview(interviewId).then((result) => { if (mounted.current && !terminal.current) { if (document.fullscreenElement) void document.exitFullscreen(); onInterviewCompleted(result); } }).catch((caught: Error) => setError(caught.message)); }}>Open completed assessment</Button> : (phase === 'error' || (phase === 'paused' && !userPaused)) && <><Button onClick={() => { inFlight.current = false; words.current = ''; setTranscript(''); listenRef.current(); }}>Retry spoken answer</Button>{recognitionMode==='local'&&<Button variant="secondary" onClick={()=>{setRecognitionMode('browser');continuation.current=setTimeout(()=>listenRef.current(),150);}}>Try browser speech instead</Button>}{transcript && <Button variant="secondary" onClick={() => finishRef.current()}>Retry evaluation</Button>}</>}</div></>}



      </section><aside className="voice-candidate"><div className="camera-preview"><video ref={video} width={640} height={480} autoPlay muted playsInline aria-label="Local camera preview" className={media.camera ? '' : 'hidden-video'} />{media.camera && consent && showOverlays && vision.observation && <VisionOverlay observation={vision.observation} size={vision.frameSize} />}{!media.camera && <div className="camera-placeholder"><p>Camera off</p></div>}{media.camera && (consent && vision.observation ? <small className={`camera-tracking-badge face-status-${faceStatus(vision.observation).tone}`} role="status">{faceStatus(vision.observation).label}</small> : <small className={`camera-tracking-badge ${consent ? 'is-on' : 'is-off'}`}>{consent ? 'Sampled for face, eye and hand tracking' : 'Preview only · not analysed'}</small>)}</div><div className="media-buttons"><Button variant="secondary" disabled={media.cameraPending} onClick={() => { setCheckingFace(false); vision.invalidate(); void media.toggleCamera(); }}>{media.camera ? 'Turn camera off' : 'Request camera'}</Button><Button variant="secondary" disabled={['ready','preparing','transcribing','evaluating','complete'].includes(phase)} onClick={() => { if (media.listening || media.micPending) { clearVoiceTimers(); media.stopMicrophone(); setPhase('paused'); } else listenRef.current(); }}>{media.listening ? 'Mute microphone' : media.micPending ? 'Cancel microphone' : 'Unmute microphone'}</Button></div><p role="status">{media.camera ? 'Camera capture active' : 'Camera capture off'} · {media.listening ? 'Microphone capture active' : 'Microphone not listening'}</p><p className={`tracking-state ${consent ? 'is-on' : 'is-off'}`}>Face, eye and hand tracking: <strong>{consent ? 'on' : 'off'}</strong>{!consent && phase !== 'ready' ? ' · visual monitoring was not enabled before this interview started' : ''}</p><MonitoringStatus camera={media.camera} cameraPending={media.cameraPending} consent={consent} checking={checkingFace} observation={vision.observation} observedAt={vision.observedAt} readiness={vision.faceReadiness} warnings={state.integrity.warningCount} maximumWarnings={integrityPolicy.maximumWarnings} cameraWarnings={state.integrity.visionWarningCount ?? 0} cameraNotice={vision.notice} overlays={showOverlays} onOverlays={setShowOverlays} />

      <details className="proctoring-diagnostics"><summary>Technical details</summary>

        <Button variant="ghost" onClick={()=>{getInterviewDiagnostics(interviewId).then(value=>{setDiagnostics(value);setDiagnosticsError('');}).catch((caught:Error)=>setDiagnosticsError(caught.message));}}>Refresh diagnostics</Button>

        {diagnosticsError&&<p role="alert">{diagnosticsError}</p>}

        {diagnostics&&<><p>Python: {diagnostics.python.service} · Frames analyzed: {diagnostics.python.framesAnalyzed} · Failures: {diagnostics.python.failures}</p><p>{diagnostics.python.lastDecision}</p></>}

        <p>{consent?vision.status:'Visual monitoring off — consent not enabled'}</p>

        {consent&&<p>Samples analyzed: {vision.diagnostics.analyzed} · failures {vision.diagnostics.failures}</p>}
        {consent&&vision.transport&&<p className="vision-transport" data-match={vision.transport.matches}>Last sample: sent {vision.transport.sent.width}×{vision.transport.sent.height} JPEG, {Math.round(vision.transport.sent.bytes/1024)} KB → Python decoded {vision.transport.decoded ? `${vision.transport.decoded.width}×${vision.transport.decoded.height}, ${Math.round(vision.transport.decoded.bytes/1024)} KB (${vision.transport.matches ? 'matches' : 'MISMATCH'}) · analysed in ${Math.round(vision.transport.decoded.processingMs)} ms` : 'no frame report'} · round trip {vision.transport.roundTripMs} ms</p>}

        {vision.notice&&<p>{vision.notice}</p>}

        {integrity.error&&<p role="alert">{integrity.error}</p>}

        <p>Landmarks estimate position only; they do not identify you or prove intent.</p>

      </details></aside></div>



    </>}{exit && <Modal title="Leave this interview?" onClose={() => setExit(false)}>{(close) => <><p>Capture and playback stop on exit. Unfinished interviews cannot be resumed.</p><Button variant="secondary" onClick={close}>Keep practicing</Button><Button variant="danger" onClick={leave}>Leave interview</Button></>}</Modal>}



  </main>;



}



