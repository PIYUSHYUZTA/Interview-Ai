import type { SetupOptions, InterviewPreferences, SessionSummary, CandidateAuthResponse, CandidateProfileResponse } from './types';
import type { VisionFrameResponse } from './types';
import type {
  ResumeUploadResponse,
  InterviewCreateResponse,
  InterviewStartResponse,
  InterviewAnswerResponse,
  InterviewNextQuestionResponse,
  InterviewCompleteResponse,
  InterviewResultsResponse,
  IntegrityEventResponse,
  PublicInterviewState,
} from './types';

const API_BASE = import.meta.env?.VITE_API_URL ?? '';

export class ApiError extends Error {
  readonly status:number;
  readonly code?:string;
  readonly publicState?:PublicInterviewState;
  constructor(message:string, status:number, code?:string, publicState?:PublicInterviewState) { super(message);this.status=status;this.code=code;this.publicState=publicState; }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    signal: options.signal ?? AbortSignal.timeout(45000),
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }).catch(() => { throw new Error('Unable to reach the interview API. Check your connection and that the backend is running, then retry.'); });

  const data = await res.json().catch(() => null);
  if (!data) throw new Error('The API returned an unreadable response. Check that the backend is running and retry.');
  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `HTTP ${res.status}: ${res.statusText}`;
    throw new ApiError(errorMsg,res.status,data.code,data.publicState);
  }

  return data as T;
}

export function getCurrentCandidate(): Promise<CandidateProfileResponse> { return request('/auth/me'); }

export function registerCandidate(input: { name: string; email: string; password: string }): Promise<CandidateAuthResponse> {
  return request('/auth/register', { method: 'POST', body: JSON.stringify(input) });
}

export function loginCandidate(input: { email: string; password: string }): Promise<CandidateAuthResponse> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify(input) });
}

export function logoutCandidate(): Promise<{ ok: true }> {
  return request('/auth/logout', { method: 'POST' });
}

export async function uploadResume(
  input: string | { resumeText?: string; candidateName?: string; fileBase64?: string; fileName?: string },
  candidateName?: string,
): Promise<ResumeUploadResponse> {
  const payload = typeof input === 'string'
    ? { resumeText: input, candidateName }
    : { candidateName, ...input };

  return request<ResumeUploadResponse>('/resumes/upload', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getRecentInterviews(): Promise<{ interviews: Array<any> }> {
  return request<{ interviews: Array<any> }>('/interviews/recent').catch(() => ({ interviews: [] }));
}

export async function getResume(resumeId: string): Promise<ResumeUploadResponse> {
  return request<ResumeUploadResponse>(`/resumes/${resumeId}`);
}

export async function createInterview(
  resumeId: string,
  role?: { title: string; skills?: Array<{ skillId: string; weight?: number }> },
  numRounds = 4,
  jobDescription?: string,
  preferences: InterviewPreferences = {},
): Promise<InterviewCreateResponse> {
  return request<InterviewCreateResponse>('/interviews', {
    method: 'POST',
    body: JSON.stringify({ resumeId, role, numRounds, jobDescription: jobDescription?.trim() || undefined, answerMode: 'text', ...preferences }),
  });
}

export async function startInterview(interviewId: string, proctored = false): Promise<InterviewStartResponse> {
  return request<InterviewStartResponse>(`/interviews/${interviewId}/start`, {
    method: 'POST', body: JSON.stringify({ proctored }),
  });
}

export async function submitAnswer(
  interviewId: string,
  answer: { text: string; elapsedSec?: number; questionId?: string },
): Promise<InterviewAnswerResponse> {
  return request<InterviewAnswerResponse>(`/interviews/${interviewId}/answer`, {
    method: 'POST',
    body: JSON.stringify(answer),
  });
}

export async function getNextQuestion(interviewId: string): Promise<InterviewNextQuestionResponse> {
  return request<InterviewNextQuestionResponse>(`/interviews/${interviewId}/next-question`, {
    method: 'POST',
  });
}

export async function completeInterview(interviewId: string): Promise<InterviewCompleteResponse> {
  return request<InterviewCompleteResponse>(`/interviews/${interviewId}/complete`, {
    method: 'POST',
  });
}

export async function submitIntegrityEvent(
  interviewId: string,
  token: string,
  event: { eventId: string; eventType: 'tab_hidden' | 'tab_visible' | 'window_unfocused' | 'fullscreen_exited' | 'camera_interrupted' | 'microphone_interrupted' | 'connection_interrupted'; occurredAt: string; durationMs: number },
): Promise<IntegrityEventResponse> {
  return request<IntegrityEventResponse>(`/interviews/${interviewId}/integrity-events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(event),
  });
}

export async function getInterviewResults(interviewId: string): Promise<InterviewResultsResponse> {
  return request<InterviewResultsResponse>(`/interviews/${interviewId}/results`);
}

export function submitVisionFrame(interviewId: string, token: string, image: string, signal: AbortSignal, preflight = false): Promise<VisionFrameResponse> {
  return request(`/interviews/${interviewId}/${preflight ? 'face-check' : 'proctoring-frame'}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal,
    body: JSON.stringify({ consent: true, image, capturedAt: new Date().toISOString() }),
  });
}

export function getSetupOptions(): Promise<SetupOptions> { return request('/interviews/options'); }
export function getSessions(): Promise<{ storage: 'memory' | 'file' | 'sqlite'; interviews: SessionSummary[] }> { return request('/interviews'); }
export async function uploadResumeFile(file: File): Promise<ResumeUploadResponse> {
  return uploadResumeFileWithProgress(file);
}

export type ResumeUploadProgress = (status: { stage: 'reading' | 'uploading' | 'processing'; percent: number | null }) => void;

export async function uploadResumeFileWithProgress(file: File, onProgress?: ResumeUploadProgress): Promise<ResumeUploadResponse> {
  if (!/\.(pdf|docx)$/i.test(file.name)) throw new Error('Choose a PDF or DOCX file. You can also paste text.');
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('Choose a non-empty file smaller than 5 MB.');
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    onProgress?.({ stage: 'reading', percent: 0 });
    reader.onprogress = (event) => onProgress?.({ stage: 'reading', percent: event.lengthComputable ? Math.round(event.loaded / event.total * 100) : null });
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Unable to read this file. Try choosing it again.'));
    reader.readAsDataURL(file);
  });
  onProgress?.({ stage: 'uploading', percent: 0 });
  return new Promise<ResumeUploadResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/resumes/file`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.upload.onprogress = (event) => onProgress?.({ stage: 'uploading', percent: event.lengthComputable ? Math.round(event.loaded / event.total * 100) : null });
    xhr.upload.onload = () => onProgress?.({ stage: 'processing', percent: null });
    xhr.onerror = () => reject(new Error('Unable to reach the interview API. Check your connection and that the backend is running, then retry.'));
    xhr.onload = () => {
      let data: any;
      try { data = JSON.parse(xhr.responseText); } catch { reject(new Error('The API returned an unreadable response. Try again.')); return; }
      if (xhr.status < 200 || xhr.status >= 300) { reject(new Error(data?.error || data?.message || `HTTP ${xhr.status}: ${xhr.statusText}`)); return; }
      resolve(data as ResumeUploadResponse);
    };
    xhr.send(JSON.stringify({ fileName: file.name, contentBase64 }));
  });
}
export function getCandidateProgress(): Promise<import('./types').CandidateProgress> { return request('/interviews/progress'); }

export interface InterviewDiagnostics { python: { framesReceived: number; framesAnalyzed: number; failures: number; service: string; lastFrameAt: string | null; lastObservationAt: string | null; lastDecision: string }; warningCount: number; state: string; policy: { penaltySignals: string[]; contextualSignals: string[] }; events: Array<{ eventType: string; policyDecision?:string; eventId?:string; occurredAt:number; confidence?:number|null; severity?:'info'|'technical';details?:{source:string;signal:string;trackingState:string;phase:string}; warningNumber: number; durationMs: number }> }
export function getInterviewDiagnostics(id: string): Promise<InterviewDiagnostics> { return request(`/interviews/${id}/diagnostics`); }

export function clearFaceReadiness(id: string, token: string): Promise<import('./types').FaceReadinessStatus> {
  return request(`/interviews/${id}/face-check`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

export type InterviewSpeech = { questionId:string; mimeType:'audio/wav'; source:'windows-sapi'; audioBase64:string; voice:string; visemes:Array<{time:number;id:number}> };
export function getInterviewSpeech(sessionId:string, questionId:string, signal:AbortSignal):Promise<InterviewSpeech> {
  return request(`/interviews/${sessionId}/speech`, {method:'POST', body:JSON.stringify({questionId}), signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
}

export function transcribeInterviewAudio(sessionId:string,questionId:string,audioBase64:string,signal:AbortSignal):Promise<{text:string;confidence:number}> {
  return request(`/interviews/${sessionId}/transcribe`,{method:'POST',body:JSON.stringify({questionId,audioBase64}),signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
}
