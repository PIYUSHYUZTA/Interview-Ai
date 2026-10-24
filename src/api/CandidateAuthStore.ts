import { z } from 'zod';
import type { DocumentStore } from './SQLiteDocuments.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';

const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1_000;
const PASSWORD_BYTES = 64;
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export interface CandidateAccount {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface StoredCandidateResume {
  resumeId: string;
  candidateName: string;
  resumeText: string;
  profile: unknown;
  audit: unknown;
  careerPath?: unknown;
  insights?: unknown;
  updatedAt: string;
}

interface CandidateRecord extends CandidateAccount {
  passwordSalt: string;
  passwordHash: string;
}

interface SessionRecord {
  candidateId: string;
  expiresAt: number;
}

interface CandidateData {
  candidates: Record<string, CandidateRecord>;
  emailIndex: Record<string, string>;
  sessions: Record<string, SessionRecord>;
  resumes: Record<string, StoredCandidateResume & { candidateId: string }>;
  interviewOwners: Record<string, string>;
}

export class CandidateAuthError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'CandidateAuthError';
  }
}

export const CandidateDataSchema = z.object({
  candidates: z.record(z.string(), z.object({ id: z.string(), name: z.string(), email: z.string(), createdAt: z.string(), passwordSalt: z.string().min(1), passwordHash: z.string().min(1) })),
  emailIndex: z.record(z.string(), z.string()),
  sessions: z.record(z.string(), z.object({ candidateId: z.string(), expiresAt: z.number() })),
  resumes: z.record(z.string(), z.object({ candidateId: z.string(), resumeId: z.string(), candidateName: z.string(), resumeText: z.string(), profile: z.unknown(), audit: z.unknown(), careerPath: z.unknown().optional(), insights: z.unknown().optional(), updatedAt: z.string() })),
  interviewOwners: z.record(z.string(), z.string()),
});

export class CandidateAuthStore {
  private readonly dataFile: string;
  private data: CandidateData;

  constructor(dataDirectory = path.resolve(process.cwd(), '.data'), private readonly documents?: DocumentStore) {
    fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
    this.dataFile = path.join(dataDirectory, 'candidates.json');
    this.data = this.readData();
  }

  async register(input: { name: string; email: string; password: string }): Promise<{ candidate: CandidateAccount; token: string }> {
    const email = input.email.trim().toLowerCase();
    if (this.data.emailIndex[email]) throw new CandidateAuthError('An account with this email already exists.', 409);
    const passwordSalt = randomBytes(16).toString('base64url');
    const passwordHash = (await derivePassword(input.password, Buffer.from(passwordSalt, 'base64url'))).toString('base64url');
    if (this.data.emailIndex[email]) throw new CandidateAuthError('An account with this email already exists.', 409);
    const candidate: CandidateRecord = {
      id: randomUUID(), name: input.name.trim(), email, passwordSalt, passwordHash,
      createdAt: new Date().toISOString(),
    };
    this.data.candidates[candidate.id] = candidate;
    this.data.emailIndex[email] = candidate.id;
    const token = this.issueSession(candidate.id);
    this.persist();
    return { candidate: publicCandidate(candidate), token };
  }

  async login(input: { email: string; password: string }): Promise<{ candidate: CandidateAccount; token: string }> {
    const email = input.email.trim().toLowerCase();
    const candidateId = this.data.emailIndex[email];
    const candidate = candidateId ? this.data.candidates[candidateId] : undefined;
    const salt = candidate ? Buffer.from(candidate.passwordSalt, 'base64url') : Buffer.alloc(16, 7);
    const actual = await derivePassword(input.password, salt);
    const expected = candidate ? Buffer.from(candidate.passwordHash, 'base64url') : Buffer.alloc(PASSWORD_BYTES);
    const valid = actual.length === expected.length && timingSafeEqual(actual, expected);
    if (!candidate || !valid) throw new CandidateAuthError('Email or password is incorrect.', 401);
    const token = this.issueSession(candidate.id);
    this.persist();
    return { candidate: publicCandidate(candidate), token };
  }

  candidateForToken(token: string | undefined): CandidateAccount | null {
    if (!token) return null;
    const digest = tokenDigest(token);
    const session = this.data.sessions[digest];
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      delete this.data.sessions[digest];
      this.persist();
      return null;
    }
    const candidate = this.data.candidates[session.candidateId];
    return candidate ? publicCandidate(candidate) : null;
  }

  logout(token: string | undefined): void {
    if (!token) return;
    const digest = tokenDigest(token);
    if (this.data.sessions[digest]) {
      delete this.data.sessions[digest];
      this.persist();
    }
  }

  saveResume(candidateId: string, resume: StoredCandidateResume): void {
    this.data.resumes[resume.resumeId] = { ...resume, candidateId };
    this.persist();
  }

  getResume(candidateId: string, resumeId: string): StoredCandidateResume | null {
    const resume = this.data.resumes[resumeId];
    if (!resume || resume.candidateId !== candidateId) return null;
    const { candidateId: _owner, ...publicResume } = resume;
    return publicResume;
  }

  resumeSummaries(candidateId: string): Array<{ resumeId: string; candidateName: string; skillIds: string[]; updatedAt: string }> {
    return Object.values(this.data.resumes)
      .filter((resume) => resume.candidateId === candidateId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((resume) => {
        const profile = resume.profile as { skills?: Array<{ skillId?: string }> };
        return { resumeId: resume.resumeId, candidateName: resume.candidateName, skillIds: (profile.skills ?? []).flatMap((skill) => skill.skillId ? [skill.skillId] : []), updatedAt: resume.updatedAt };
      });
  }

  linkInterview(candidateId: string, interviewId: string): void {
    this.data.interviewOwners[interviewId] = candidateId;
    this.persist();
  }

  ownsInterview(candidateId: string, interviewId: string): boolean {
    return this.data.interviewOwners[interviewId] === candidateId;
  }

  private issueSession(candidateId: string): string {
    const now = Date.now();
    for (const [digest, session] of Object.entries(this.data.sessions)) {
      if (session.expiresAt <= now) delete this.data.sessions[digest];
    }
    const token = randomBytes(32).toString('base64url');
    this.data.sessions[tokenDigest(token)] = { candidateId, expiresAt: now + SESSION_LIFETIME_MS };
    return token;
  }

  private readData(): CandidateData {
    const stored = this.documents ? this.documents.get('accounts', 'state') : fs.existsSync(this.dataFile) ? JSON.parse(fs.readFileSync(this.dataFile, 'utf8')) : null;
    if (!stored) return emptyData();
    const parsed = CandidateDataSchema.parse({ sessions: {}, resumes: {}, interviewOwners: {}, ...stored as object });
    return {
      candidates: parsed.candidates ?? {}, emailIndex: parsed.emailIndex ?? {},
      sessions: parsed.sessions ?? {}, resumes: parsed.resumes ?? {}, interviewOwners: parsed.interviewOwners ?? {},
    };
  }

  private persist(): void {
    if (this.documents) { this.documents.put('accounts', 'state', this.data); return; }
    const temporary = `${this.dataFile}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.data), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, this.dataFile);
  }
}

function emptyData(): CandidateData {
  return { candidates: {}, emailIndex: {}, sessions: {}, resumes: {}, interviewOwners: {} };
}

function publicCandidate(candidate: CandidateRecord): CandidateAccount {
  const { passwordSalt: _salt, passwordHash: _hash, ...publicRecord } = candidate;
  return publicRecord;
}

function tokenDigest(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

function derivePassword(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_BYTES, SCRYPT_OPTIONS, (error, key) => error ? reject(error) : resolve(key as Buffer));
  });
}
