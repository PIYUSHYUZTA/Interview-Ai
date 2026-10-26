import { LocalRecognition } from './LocalRecognition';

import { getInterviewSpeech, ApiError } from '../api';

import { speechEnvelope, type AvatarSpeechClock } from './avatar-speech';

import { useCallback, useEffect, useRef, useState } from 'react';

const LOST_CAMERA_MESSAGE = 'The camera disconnected. Reconnecting automatically; you can also turn the camera on again or continue without it.';



export interface Recognition {

  continuous: boolean; interimResults: boolean; lang: string;

  onstart: (() => void) | null; onaudiostart: (() => void) | null; onend: (() => void) | null;

  onerror: ((event: { error: string }) => void) | null;

  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;

  onprocessing?: (()=>void)|null;onactivity?: (()=>void)|null;

  start(): void; stop?(): void; abort(): void;

}

export type SpeechWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };



export function useInterviewMedia(questionId: string | undefined, appendTranscript: (text: string) => void, events?: { onPlaybackStart?: () => void; onPlaybackEnd?: () => void; onRecognitionEnd?: () => void;onTranscriptionStart?:()=>void;onSpeechActivity?:()=>void }, sessionId?: string, recognitionMode:'local'|'browser'='local') {

  const avatarSpeech = useRef<AvatarSpeechClock>({audio:null,cues:[]});

  const [speechMode, setSpeechMode] = useState<'preparing'|'synchronized'|'browser'>('preparing');

  const [speechNotice, setSpeechNotice] = useState('');

  const speechAbort = useRef<AbortController|null>(null);

  const speechAudio = useRef<HTMLAudioElement|null>(null);

  const speechUrl = useRef<string|null>(null);

  const [camera, setCamera] = useState(false);

  const [cameraPending, setCameraPending] = useState(false);

  const [listening, setListening] = useState(false);

  const [micPending, setMicPending] = useState(false);

  const [speaking, setSpeaking] = useState(false);
  const [speechPaused, setSpeechPaused] = useState(false);

  const [inputLevel,setInputLevel]=useState(0);

  const captureContext=useRef<AudioContext|null>(null);

  const meterSource=useRef<MediaStreamAudioSourceNode|null>(null);

  const meterFrame=useRef(0);

  const permissionGeneration=useRef(0);

  // Open/resume from an explicit click, before playback or network awaits.

  const unlockCapture=()=>{

    if(!captureContext.current||captureContext.current.state==='closed')captureContext.current=new AudioContext({sampleRate:16000});

    return captureContext.current.resume();

  };

  const releaseMicrophone=useCallback(()=>{

    permissionGeneration.current++;

    const context=captureContext.current;captureContext.current=null;

    if(context&&context.state!=='closed')void context.close().catch(()=>{});

  },[]);

  const prepareMicrophone=async()=>{

    const token=++permissionGeneration.current;

    if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires localhost or HTTPS.');

    const ready=unlockCapture();

    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});

    stream.getTracks().forEach(track=>track.stop());

    await ready;

    if(!mounted.current||token!==permissionGeneration.current)throw new Error('Microphone preparation cancelled.');

  };

  const [interim, setInterim] = useState('');

  const [error, setError] = useState<string | null>(null);

  const video = useRef<HTMLVideoElement>(null);

  const cameraGeneration = useRef(0);
  /** Set when the camera stopped without the candidate asking (unplugged, taken by another app); cleared on a
   * deliberate turn-off or a successful start. While set, the camera is reopened automatically. */
  const cameraLost = useRef(false);

  const cameraStream = useRef<MediaStream | null>(null);

  const audioStream = useRef<MediaStream | null>(null);

  const recognition = useRef<Recognition | null>(null);

  const generation = useRef(0);

  const mounted = useRef(true);

  const playbackGeneration = useRef(0);

  // Keep the native utterance alive until completion; some browsers otherwise lose its callbacks.

  const playback = useRef<SpeechSynthesisUtterance | null>(null);

  const playbackEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recognitionEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recognitionStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playbackStartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callbacks = useRef(events);

  useEffect(() => { callbacks.current = events; }, [events]);

  const append = useRef(appendTranscript);

  useEffect(() => { append.current = appendTranscript; }, [appendTranscript]);



  const stopSpeaking = useCallback(() => { speechAbort.current?.abort(); speechAbort.current=null; if(speechAudio.current) { speechAudio.current.onplaying=null; speechAudio.current.onended=null; speechAudio.current.onerror=null; speechAudio.current.pause(); speechAudio.current.removeAttribute('src'); speechAudio.current.load(); speechAudio.current=null; } if(speechUrl.current) URL.revokeObjectURL(speechUrl.current); speechUrl.current=null; avatarSpeech.current={audio:null,cues:[]}; if (playbackStartTimer.current) clearTimeout(playbackStartTimer.current); if (playbackEndTimer.current) clearTimeout(playbackEndTimer.current); playback.current = null; playbackGeneration.current++; window.speechSynthesis?.cancel(); setSpeaking(false); setSpeechPaused(false); }, []);
  // Pausing keeps the WAV position and cues, so resuming continues the same synchronized playback.
  const pauseSpeaking = useCallback(() => {
    const audio = speechAudio.current;
    const browserVoice = !audio && window.speechSynthesis?.speaking && !window.speechSynthesis.paused;
    if (!(audio && !audio.paused) && !browserVoice) return false;
    if (playbackEndTimer.current) clearTimeout(playbackEndTimer.current);
    if (audio) audio.pause(); else window.speechSynthesis.pause();
    setSpeaking(false); setSpeechPaused(true);
    return true;
  }, []);
  const resumeSpeaking = useCallback(() => {
    const audio = speechAudio.current;
    setSpeechPaused(false);
    if (audio && audio.paused && !audio.ended) { void audio.play().catch(() => { stopSpeaking(); setError('Question audio could not resume. Replay the question to retry.'); }); return true; }
    if (!audio && window.speechSynthesis?.paused) { window.speechSynthesis.resume(); setSpeaking(true); callbacks.current?.onPlaybackStart?.(); return true; }
    return false;
  }, [stopSpeaking]);

  const stopMicrophone = useCallback(() => {

    if (recognitionStartTimer.current) clearTimeout(recognitionStartTimer.current);

    if (recognitionEndTimer.current) clearTimeout(recognitionEndTimer.current);

    generation.current++;

    cancelAnimationFrame(meterFrame.current);meterSource.current?.disconnect();meterSource.current=null;setInputLevel(0);

    const current = recognition.current; recognition.current = null;

    if (current) { current.onresult = null; current.onend = null; current.onerror = null; current.onstart = null; current.onaudiostart = null; current.onprocessing=null;current.onactivity=null; try { current.abort(); } catch { /* already ended */ } }

    audioStream.current?.getTracks().forEach((track) => { track.onended = null; track.onmute = null; track.onunmute = null; track.stop(); }); audioStream.current = null;

    setListening(false); setMicPending(false); setInterim('');

  }, []);

  const stopCamera = useCallback(() => {

    cameraGeneration.current++;

    setCameraPending(false);

    cameraStream.current?.getTracks().forEach((track) => track.stop()); cameraStream.current = null;

    if (video.current) video.current.srcObject = null;

    setCamera(false);

  }, []);

  useEffect(() => { stopMicrophone(); stopSpeaking(); }, [questionId, stopMicrophone, stopSpeaking]);

  // Reopen a lost camera without asking again (permission was already granted): every 3 s and on any device
  // change, at most 20 attempts. The interview continues meanwhile; the outage is reported as technical, not a warning.
  const toggleCameraRef = useRef<() => Promise<boolean | undefined>>(async () => false);
  const reconnectNow = useRef<(() => void) | null>(null);
  const reconnectAttempts = useRef(0);
  useEffect(() => {
    if (camera || cameraPending || !cameraLost.current) { reconnectNow.current = null; if (camera) reconnectAttempts.current = 0; return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      timer = undefined; reconnectNow.current = null;
      if (!cameraLost.current || !mounted.current) return;
      if (reconnectAttempts.current >= 20) { cameraLost.current = false; reconnectAttempts.current = 0; setError('The camera could not be reconnected. Turn it on again when it is available, or continue without it.'); return; }
      const attemptNumber = ++reconnectAttempts.current;
      const ok = await toggleCameraRef.current();
      // A failed start leaves cameraPending false again, which re-runs this effect and schedules the next attempt.
      if (!ok && mounted.current && cameraLost.current) setError(`${LOST_CAMERA_MESSAGE} (attempt ${attemptNumber} of 20)`);
    };
    reconnectNow.current = () => { if (timer) clearTimeout(timer); void attempt(); };
    timer = setTimeout(() => void attempt(), 3000);
    return () => { if (timer) clearTimeout(timer); };
  }, [camera, cameraPending]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stopMicrophone(); stopSpeaking(); stopCamera(); releaseMicrophone(); }; }, [stopMicrophone, stopSpeaking, stopCamera, releaseMicrophone]);

  useEffect(() => {

    const onDevicesChanged = () => {

      if (cameraStream.current && cameraStream.current.getVideoTracks().every((track) => track.readyState !== 'live')) {

        stopCamera(); cameraLost.current = true;

        setError(LOST_CAMERA_MESSAGE);

      }
      // A device came back: try at once instead of waiting for the next retry.
      if (cameraLost.current && !cameraStream.current) reconnectNow.current?.();

      if (audioStream.current && audioStream.current.getAudioTracks().every((track) => track.readyState !== 'live')) {

        stopMicrophone();

        setError('The microphone disconnected. Reconnect it and retry your spoken answer.');

      }

    };

    navigator.mediaDevices?.addEventListener?.('devicechange', onDevicesChanged);

    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onDevicesChanged);

  }, [stopCamera, stopMicrophone]);



  const toggleCamera = async () => {

    if (cameraPending) return false;

    setError(null);

    if (camera) { cameraLost.current = false; stopCamera(); return false; }

    const cameraToken = ++cameraGeneration.current;

    setCameraPending(true);

    try {

      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access is unavailable. Use localhost or HTTPS.');

      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });

      if (!mounted.current || cameraToken !== cameraGeneration.current) { stream.getTracks().forEach((track) => track.stop()); return; }

      cameraStream.current = stream;
      // Capture is already live. Reveal the video before awaiting playback;
      // hidden video playback can be deferred indefinitely by the browser.
      setCamera(true);

      if (video.current) { video.current.srcObject = stream; await video.current.play(); }

      if (!mounted.current || cameraToken !== cameraGeneration.current) { stream.getTracks().forEach((track) => track.stop()); return; }

      stream.getVideoTracks().forEach((track) => {

        track.onended = () => {

          if (cameraToken !== cameraGeneration.current) return;

          stopCamera(); cameraLost.current = true;

          setError(LOST_CAMERA_MESSAGE);

        };

      });

      cameraLost.current = false;
      setCamera(true); return true;

    } catch (e) {

      if (!mounted.current || cameraToken !== cameraGeneration.current) return;

      stopCamera();

      if (mounted.current) {

        const name = (e as Error).name;

        setError(name === 'NotAllowedError' || name === 'SecurityError'

          ? 'Camera permission denied. Allow camera access in your browser to retry, or continue without it.'

          : name === 'NotFoundError' ? 'No camera was found. Connect a camera or continue without video.'

            : name === 'NotReadableError' ? 'The camera is already in use by another app. Close that app and retry, or continue without video.'

              : 'Camera unavailable. Check your device and browser permissions. You can retry camera access separately from voice.');

      }

      return false;

    } finally { if (mounted.current && cameraToken === cameraGeneration.current) setCameraPending(false); }

  };



  const toggleMicrophone = async (restart=false) => {

    if (!restart && (listening || micPending)) { stopMicrophone(); return; }

    if (!questionId) return;

    setError(null); stopSpeaking(); stopMicrophone();

    const Constructor = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;

    const local=recognitionMode==='local'&&!!sessionId;

    if (!Constructor&&!local) { setError('Voice transcription is not supported in this browser. Use a browser with speech recognition to continue.'); return; }

    const token = ++generation.current;

    setMicPending(true);

    try {

      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');

      const contextReady=unlockCapture();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: {echoCancellation:true,noiseSuppression:true,autoGainControl:true}, video: false });

      await contextReady;

      if (!mounted.current || token !== generation.current) { stream.getTracks().forEach((track) => track.stop()); return; }

      audioStream.current = stream;

      stream.getAudioTracks().forEach((track) => {

        track.onended = () => {

          if (token !== generation.current) return;

          stopMicrophone();

          setError('The microphone disconnected. Reconnect it and retry your spoken answer.');

        };

      });

      const engine:Recognition = local ? new LocalRecognition(stream,sessionId!,questionId,captureContext.current!) : new Constructor!(); recognition.current = engine;

      engine.continuous = true; engine.interimResults = true; engine.lang = 'en-US';

      const context=captureContext.current!;

      const analyser=context.createAnalyser();analyser.fftSize=1024;

      const source=context.createMediaStreamSource(stream);meterSource.current=source;source.connect(analyser);

      const samples=new Float32Array(analyser.fftSize);let lastLevel=0;

      const measure=(time:number)=>{

        if(token!==generation.current||!mounted.current)return;

        if(time-lastLevel>=100){

          analyser.getFloatTimeDomainData(samples);

          const rms=Math.sqrt(samples.reduce((sum,sample)=>sum+sample*sample,0)/samples.length);

          setInputLevel(Math.min(100,Math.round(rms*500)));lastLevel=time;

        }

        meterFrame.current=requestAnimationFrame(measure);

      };

      meterFrame.current=requestAnimationFrame(measure);

      let serviceStarted = false; let audioStarted = false;

      const finalResults = new Set<number>();

      const confirmCapture = () => {

        if (token !== generation.current || !mounted.current || !serviceStarted || !audioStarted) return;

        if (!stream.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled && !track.muted)) {

          return; // A temporarily muted track may recover; the startup watchdog remains active.

        }

        if (recognitionStartTimer.current) clearTimeout(recognitionStartTimer.current);

        setListening(true); setMicPending(false);

      };

      stream.getAudioTracks().forEach((track) => {

        track.onunmute = confirmCapture;

        track.onmute = () => { if (token === generation.current && serviceStarted && audioStarted) { stopMicrophone(); setError('Microphone capture was interrupted. Check the device and retry your spoken answer. Nothing was submitted.'); } };

      });

      engine.onprocessing=()=>{if(token===generation.current){setListening(false);setMicPending(false);callbacks.current?.onTranscriptionStart?.();}};

      engine.onactivity=()=>{if(token===generation.current)callbacks.current?.onSpeechActivity?.();};

      engine.onstart = () => { serviceStarted = true; confirmCapture(); };

      engine.onaudiostart = () => { audioStarted = true; confirmCapture(); };

      engine.onresult = (event) => {

        if (token !== generation.current || !mounted.current) return;

        let final = ''; let pending = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {

          const result = event.results[i];

          if (result.isFinal) { if (!finalResults.has(i) && result[0].transcript.trim()) { finalResults.add(i); final += `${result[0].transcript} `; } } else pending += result[0].transcript;

        }

        if (final.trim()) append.current(final.trim());

        setInterim(pending);

      };

      engine.onerror = (event) => {

        if (token !== generation.current) return;

        setError(local ? event.error : event.error === 'not-allowed' || event.error === 'service-not-allowed'

          ? 'Microphone or speech-service permission denied. Allow microphone and speech-service access, then retry.'

          : event.error === 'no-speech'

            ? 'No speech was detected. Your transcript is unchanged; retry your spoken answer.'

            : `Transcription unavailable (${event.error}). Your completed transcript is preserved. Retry speech recognition.`);

        stopMicrophone();

      };

      engine.onend = () => { if (token === generation.current) { stopMicrophone(); callbacks.current?.onRecognitionEnd?.(); } };

      recognitionStartTimer.current = setTimeout(() => {

        if (mounted.current && token === generation.current) { stopMicrophone(); setError('The browser speech service did not start. Audio capture was not confirmed. Your transcript is preserved. Check browser/network permissions, then retry speech recognition.'); }

      }, 12000);

      engine.start();

    } catch (e) {

      if (token === generation.current) {

        stopMicrophone();

        const name = (e as Error).name;

        setError(name === 'NotAllowedError' || name === 'SecurityError'

          ? 'Microphone permission denied. Allow access in your browser, then retry your spoken answer.'

          : name === 'NotFoundError' ? 'No microphone was found. Connect a microphone and retry your spoken answer.'

            : name === 'NotReadableError' ? 'The microphone is already in use by another app. Close that app and retry your spoken answer.'

              : 'Microphone unavailable. Check the device and permissions, then retry.');

      }

    }

  };

  const speakBrowser = useCallback((text: string) => {

    setError(null); stopMicrophone(); stopSpeaking();

    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) { setError('Spoken playback is unavailable in this browser. The full question is displayed below.'); return; }

    const playbackToken = ++playbackGeneration.current;

    const utterance = new SpeechSynthesisUtterance(text);

    playback.current = utterance;

    utterance.lang = 'en-US'; utterance.rate = 0.96;

    utterance.onstart = () => { if (mounted.current && playbackToken === playbackGeneration.current) { if (playbackStartTimer.current) clearTimeout(playbackStartTimer.current); setSpeaking(true); callbacks.current?.onPlaybackStart?.(); playbackEndTimer.current = setTimeout(() => { if (playbackToken === playbackGeneration.current) { stopSpeaking(); setError('Question playback did not finish. Retry playback or choose Retry spoken answer when ready.'); } }, Math.max(30000, text.split(/\s+/).length * 1000)); } };

    utterance.onend = () => { if (mounted.current && playbackToken === playbackGeneration.current) { if (playbackStartTimer.current) clearTimeout(playbackStartTimer.current); if (playbackEndTimer.current) clearTimeout(playbackEndTimer.current); playback.current = null; setSpeaking(false); callbacks.current?.onPlaybackEnd?.(); } };

    utterance.onerror = (event) => { if (!mounted.current || playbackToken !== playbackGeneration.current) return; if (playbackStartTimer.current) clearTimeout(playbackStartTimer.current); setSpeaking(false); if (playbackEndTimer.current) clearTimeout(playbackEndTimer.current); playback.current = null; setError(['canceled', 'interrupted'].includes(event.error) ? 'Question playback was interrupted. Replay the question or retry your spoken answer.' : 'Spoken playback could not start. Check your browser audio settings, or read the question.'); };

    playbackStartTimer.current = setTimeout(() => {

      if (mounted.current && playbackToken === playbackGeneration.current) { stopSpeaking(); setError('Question playback did not start. Check browser audio settings or read the displayed question.'); }

    }, 10000);

    try { window.speechSynthesis.speak(utterance); } catch { stopSpeaking(); setError('Spoken playback could not start. Read the displayed question or check browser audio settings.'); }

  }, [stopMicrophone, stopSpeaking]);

  const speak = useCallback((text:string) => {

    if (!sessionId || !questionId) { speakBrowser(text); return; }

    stopMicrophone(); stopSpeaking(); setError(null); setSpeechMode('preparing'); setSpeechNotice('');

    const token=++playbackGeneration.current;

    const abort=new AbortController(); speechAbort.current=abort;

    void (async()=>{

      try {

        const speech=await getInterviewSpeech(sessionId,questionId,abort.signal);

        if(abort.signal.aborted || !mounted.current || token!==playbackGeneration.current) return;

        const bytes=Uint8Array.from(atob(speech.audioBase64),c=>c.charCodeAt(0));

        const url=URL.createObjectURL(new Blob([bytes],{type:speech.mimeType}));speechUrl.current=url;

        const audio=new Audio(url);speechAudio.current=audio;avatarSpeech.current={audio,cues:speech.visemes,envelope:speechEnvelope(bytes)};

        playbackStartTimer.current=setTimeout(()=>{if(token===playbackGeneration.current&&mounted.current){stopSpeaking();setError('Question audio did not start. Replay the question to retry.');}},10000);

        audio.onplaying=()=>{if(token===playbackGeneration.current&&mounted.current){if(playbackStartTimer.current)clearTimeout(playbackStartTimer.current);playbackEndTimer.current=setTimeout(()=>{if(token===playbackGeneration.current){stopSpeaking();setError('Question audio did not finish. Replay the question to retry.');}},Math.max(30000,(audio.duration||30)*1000+10000));setSpeaking(true);setSpeechMode('synchronized');callbacks.current?.onPlaybackStart?.();}};

        audio.onended=()=>{if(token!==playbackGeneration.current||!mounted.current)return;stopSpeaking();callbacks.current?.onPlaybackEnd?.();};

        audio.onerror=()=>{if(token!==playbackGeneration.current||!mounted.current)return;stopSpeaking();setError('Question audio could not play. Replay the question to retry.');};

        await audio.play();

      } catch (caught) {

        if(abort.signal.aborted || !mounted.current || token!==playbackGeneration.current) return;

        if(caught instanceof ApiError&&[401,403,404,409].includes(caught.status)){stopSpeaking();setError(caught.message);return;}

        setSpeechMode('browser');setSpeechNotice('Browser voice fallback · synchronized mouth animation is unavailable.');speakBrowser(text);

      }

    })();

  },[questionId,sessionId,speakBrowser,stopMicrophone,stopSpeaking]);

  const finishMicrophone = () => {

    if (recognition.current?.stop) {

      if (recognitionEndTimer.current) clearTimeout(recognitionEndTimer.current);

      recognitionEndTimer.current = setTimeout(() => { stopMicrophone(); setError('Speech recognition did not finish. Your completed transcript is preserved. Retry evaluation or record your answer again.'); }, recognition.current instanceof LocalRecognition ? 30000 : 8000);

      try { recognition.current.stop(); } catch { stopMicrophone(); setError('Speech recognition stopped unexpectedly. Retry your spoken answer.'); }

    }

    else { stopMicrophone(); callbacks.current?.onRecognitionEnd?.(); }

  };

  toggleCameraRef.current = toggleCamera; // always the current render's version for automatic reconnection
  return { prepareMicrophone, releaseMicrophone, inputLevel, avatarSpeech, speechMode, speechNotice, finishMicrophone, video, camera, cameraPending, listening, micPending, speaking, speechPaused, interim, error, toggleCamera, toggleMicrophone, speak, stopMicrophone, stopSpeaking, pauseSpeaking, resumeSpeaking, stopCamera };

}

