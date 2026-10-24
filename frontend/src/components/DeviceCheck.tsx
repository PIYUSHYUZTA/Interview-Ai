import { useEffect, useRef, useState } from 'react';
import type { Recognition, SpeechWindow } from './useInterviewMedia';
import { Button, ErrorNotice, Status } from './ui';

/** Local preflight. No scores, recordings, backend uploads or automatic permission grants. */
export function DeviceCheck({ camera, cameraPending, onCamera }: { camera: boolean; cameraPending: boolean; onCamera: () => Promise<boolean | undefined> }) {
  const [capturing, setCapturing] = useState(false);
  const [level, setLevel] = useState(0);
  const [signal, setSignal] = useState(false);
  const [pending, setPending] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speechStatus, setSpeechStatus] = useState('Not tested');
  const [playback, setPlayback] = useState('Not tested');
  const [heard, setHeard] = useState(false);
  const [playbackStarted, setPlaybackStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const frame = useRef(0);
  const generation = useRef(0);
  const recognition = useRef<Recognition | null>(null);
  const recognitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const stop = () => {
    generation.current++;
    if (recognitionTimer.current) clearTimeout(recognitionTimer.current);
    if (playbackTimer.current) clearTimeout(playbackTimer.current);
    const current = recognition.current; recognition.current = null;
    if (current) { current.onstart = null; current.onaudiostart = null; current.onend = null; current.onerror = null; current.onresult = null; try { current.abort(); } catch { /* already stopped */ } }
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
    cancelAnimationFrame(frame.current);
    if (audio.current) void audio.current.close().catch(() => {}); audio.current = null;
    window.speechSynthesis?.cancel();
    if (mounted.current) { setCapturing(false); setPending(false); setLevel(0); setSpeechStatus((status) => status.startsWith('Listening') || status.startsWith('Connecting') ? 'Stopped' : status); setPlayback((status) => status.startsWith('Preparing') || status.startsWith('Playback started') ? 'Playback stopped' : status); }
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, []);
  const checkMicrophone = async (): Promise<boolean> => {
    stop(); setError(null); setSignal(false); setPending(true);
    const token = generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone capture requires localhost or HTTPS and a supported browser.');
      const next = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!mounted.current || token !== generation.current) { next.getTracks().forEach((track) => track.stop()); return false; }
      stream.current = next; setCapturing(true); setPending(false);
      next.getAudioTracks().forEach((track) => { track.onended = () => { if (token === generation.current) { stop(); setError('The microphone disconnected. Reconnect it and check again.'); } }; });
      const context = new AudioContext(); audio.current = context; await context.resume();
      if (!mounted.current || token !== generation.current) return false;
      const source = context.createMediaStreamSource(next); const analyser = context.createAnalyser(); analyser.fftSize = 512; source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      let lastUpdate = 0;
      const measure = (time: number) => {
        if (!mounted.current || token !== generation.current) return;
        if (time - lastUpdate > 100) {
          analyser.getByteTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, sample) => sum + ((sample - 128) / 128) ** 2, 0) / samples.length);
          setLevel(Math.min(100, Math.round(rms * 350))); if (rms > .015) setSignal(true); lastUpdate = time;
        }
        frame.current = requestAnimationFrame(measure);
      };
      frame.current = requestAnimationFrame(measure); return true;
    } catch (caught) {
      if (mounted.current && token === generation.current) {
        stop(); const name = (caught as Error).name;
        setError(name === 'NotAllowedError' ? 'Microphone permission denied. Allow it in browser site settings and retry.' : name === 'NotFoundError' ? 'No microphone was found. Connect one and retry.' : 'Microphone check failed. Check the device, permissions and whether another app is using it. Retry after reconnecting the device.');
      }
      return false;
    }
  };
  const checkSpeech = async () => {
    const Constructor = (window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition;
    if (!Constructor) { setSpeechStatus('Unavailable in this browser'); setError('Browser speech recognition is unavailable. Try a supported browser with speech recognition to continue.'); return; }
    if (!await checkMicrophone()) return;
    const token = generation.current;
    setSpeechStatus('Connecting to browser speech service'); setTranscript('');
    const engine = new Constructor(); recognition.current = engine; engine.lang = 'en-US'; engine.continuous = true; engine.interimResults = true;
    engine.onstart = () => { if (token === generation.current) setSpeechStatus('Speech service connected — waiting for audio capture'); };
    engine.onaudiostart = () => { if (token === generation.current && stream.current?.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled && !track.muted)) setSpeechStatus('Listening — say a short sentence'); };
    engine.onresult = (event) => {
      if (token !== generation.current || !mounted.current) return;
      let words = ''; for (let i = 0; i < event.results.length; i++) words += event.results[i][0].transcript + ' ';
      setTranscript(words.trim());
      const completed = Array.from(event.results).some((result) => result.isFinal && result[0].transcript.trim());
      if (completed) { stop(); setSpeechStatus('Completed transcript received — review the recognized words'); }
      else if (words.trim()) setSpeechStatus('Interim words received — waiting for completed transcription');
    };
    engine.onerror = (event) => {
      if (token !== generation.current || !mounted.current) return;
      setSpeechStatus(`Speech service failed: ${event.error}`); stop();
      setError(`Browser transcription failed (${event.error}). Microphone capture and speech recognition are separate checks. Check browser/network permissions then retry.`);
    };
    engine.onend = () => { if (token === generation.current && mounted.current) { stop(); setSpeechStatus((status) => status.startsWith('Completed transcript') ? status : 'Speech test ended without a confirmed completed transcript. Retry when ready.'); } };
    recognitionTimer.current = setTimeout(() => {
      if (token === generation.current && mounted.current) { stop(); setSpeechStatus('Test ended'); setError('Speech test stopped after 30 seconds. If no transcript appeared, recognition is not verified; retry speech recognition.'); }
    }, 30000);
    try { engine.start(); } catch { stop(); setSpeechStatus('Could not start'); setError('The browser speech service could not start. Retry when ready.'); }
  };
  const checkSpeaker = () => {
    stop(); setError(null); setHeard(false); setPlaybackStarted(false);
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { setPlayback('Unavailable'); setError('Speech playback is unavailable. Questions remain visible as text.'); return; }
    const token = generation.current; const sentence = new SpeechSynthesisUtterance('Your interview audio check is ready. Please confirm if you can hear this sentence.');
    sentence.lang = 'en-US'; sentence.rate = .96; setPlayback('Preparing playback');
    sentence.onstart = () => { if (token === generation.current && mounted.current) { if (playbackTimer.current) clearTimeout(playbackTimer.current); setPlaybackStarted(true); setPlayback('Playback started — confirm whether you heard it'); } };
    sentence.onend = () => { if (token === generation.current && mounted.current) setPlayback('Playback ended — confirm whether you heard it'); };
    sentence.onerror = () => { if (token === generation.current && mounted.current) { setPlayback('Playback failed'); setError('Question playback failed. Check browser audio settings, volume and output device.'); } };
    playbackTimer.current = setTimeout(() => { if (token === generation.current && mounted.current) { stop(); setPlayback('Playback did not start'); setError('No playback-start event was received. Check browser audio settings then retry.'); } }, 10000);
    try { window.speechSynthesis.speak(sentence); } catch { stop(); setPlayback('Playback failed'); setError('Speech playback could not start. Questions remain readable.'); }
  };
  return <section className="device-check" aria-labelledby="device-check-heading"><h3 id="device-check-heading">Check your devices before starting</h3><p>Optional checks use browser permissions. The microphone level meter runs locally without recording or uploading audio. Browser speech recognition may use its vendor’s online service.</p><ErrorNotice message={error} /><p className="fine-print">Microphone capture: {'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices ? 'supported' : 'unavailable'} · Speech recognition: {((window as SpeechWindow).SpeechRecognition ?? (window as SpeechWindow).webkitSpeechRecognition) ? 'available to test' : 'unavailable'} · Question playback: {'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window ? 'available to test' : 'unavailable'}. Availability alone is not a successful test.</p><Button variant="secondary" disabled={pending || cameraPending} onClick={() => { void (async () => { if (!camera) await onCamera(); if (mounted.current) await checkMicrophone(); })(); }}>Check camera and microphone</Button>{camera && capturing && signal && <p role="status">Camera capture and microphone signal detected. You can start your interview now; no manual confirmation is required. Speech recognition and question playback are separate checks.</p>}
    <div className="device-check-grid"><article><h4>Camera preview</h4><Status tone={camera ? 'success' : ''}>{camera ? 'Capture active — inspect your preview' : 'Camera off'}</Status><p>Use the camera preview in this room to check framing and lighting.</p><Button variant="secondary" disabled={cameraPending} onClick={() => void onCamera()}>{cameraPending ? 'Requesting camera…' : camera ? 'Stop camera check' : 'Check camera'}</Button></article>
    <article><h4>Microphone input</h4><Status tone={capturing ? 'cyan' : ''}>{capturing ? 'Microphone capture active' : 'Microphone capture off'}</Status><progress aria-label="Microphone input level" max={100} value={level} /><p>{signal ? 'An input signal was detected. This alone does not verify transcription.' : 'Start the check and speak. The meter should respond to your voice.'}</p><div className="actions"><Button variant="secondary" disabled={pending} onClick={() => void checkMicrophone()}>{pending ? 'Requesting microphone…' : 'Check microphone'}</Button><Button variant="ghost" disabled={!capturing && !pending} onClick={stop}>Stop device audio</Button></div></article>
    <article><h4>Speaker playback</h4><p role="status">{playback}</p><Button variant="secondary" onClick={checkSpeaker}>Play test sentence</Button><label><input type="checkbox" disabled={!playbackStarted} checked={heard} onChange={(e) => setHeard(e.target.checked)} /> I heard the test sentence</label>{heard && <p>Audibility confirmed by you for this device check.</p>}</article>
    <article><h4>Spoken transcription</h4><p role="status">{speechStatus}</p><Button variant="secondary" onClick={() => void checkSpeech()}>Test spoken transcription</Button><p className="preserve-lines">{transcript || 'No recognized words yet. A microphone signal is not a transcription result.'}</p></article></div><p className="fine-print">Starting the interview or closing these checks stops the test audio stream. Camera controls remain available in the room. These checks do not change scores or warnings.</p></section>;
}
