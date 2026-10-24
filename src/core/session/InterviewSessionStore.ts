import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  InterviewStateMachine,
  type SerializedStateMachine,
  type StateMachineDeps,
} from './InterviewStateMachine.js';

/**
 * Session persistence store interface.
 *
 * Current drivers:
 *  - InMemorySessionStore: fast, in-memory Map for unit tests and local dev
 *  - FileSessionStore: disk-persisted JSON files for process restarts and multi-tab reconnects
 *
 * Note: When a production DB (PostgreSQL / Redis) is wired up, implementing this
 * interface requires ZERO changes to InterviewStateMachine or business logic.
 */
export interface InterviewSessionStore {
  save(session: InterviewStateMachine): Promise<void>;
  load(sessionId: string): Promise<InterviewStateMachine | null>;
  has(sessionId: string): Promise<boolean>;
  delete(sessionId: string): Promise<boolean>;
  list(): Promise<string[]>;
}

/**
 * In-Memory session store.
 */
export class InMemorySessionStore implements InterviewSessionStore {
  private readonly storage = new Map<string, SerializedStateMachine>();

  constructor(private readonly deps: StateMachineDeps) {}

  async save(session: InterviewStateMachine): Promise<void> {
    this.storage.set(session.sessionId, session.serialize());
  }

  async load(sessionId: string): Promise<InterviewStateMachine | null> {
    const data = this.storage.get(sessionId);
    if (!data) return null;
    return InterviewStateMachine.deserialize(data, this.deps);
  }

  async has(sessionId: string): Promise<boolean> {
    return this.storage.has(sessionId);
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.storage.delete(sessionId);
  }

  async list(): Promise<string[]> {
    return [...this.storage.keys()];
  }

  clear(): void {
    this.storage.clear();
  }
}

/**
 * File-backed session store for survivability across backend restarts and page refreshes.
 */
export class FileSessionStore implements InterviewSessionStore {
  private readonly baseDir: string;

  constructor(
    private readonly deps: StateMachineDeps,
    customDir?: string,
  ) {
    this.baseDir = customDir ?? path.resolve(process.cwd(), '.sessions');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private filePath(sessionId: string): string {
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDir, `${safeId}.json`);
  }

  async save(session: InterviewStateMachine): Promise<void> {
    const file = this.filePath(session.sessionId);
    const content = JSON.stringify(session.serialize(), null, 2);
    const temporary = `${file}.${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  async load(sessionId: string): Promise<InterviewStateMachine | null> {
    const file = this.filePath(sessionId);
    if (!fs.existsSync(file)) return null;

    try {
      const raw = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(raw) as SerializedStateMachine;
      if (data.integrity) {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const events = data.integrity.events.filter((event) => event.occurredAt >= cutoff);
        if (events.length !== data.integrity.events.length) {
          const retained = { ...data, integrity: { ...data.integrity, events } };
          const temporary = `${file}.${randomUUID()}.tmp`;
          fs.writeFileSync(temporary, JSON.stringify(retained, null, 2), { encoding: 'utf8', mode: 0o600 });
          fs.renameSync(temporary, file);
          return InterviewStateMachine.deserialize(retained, this.deps);
        }
      }
      return InterviewStateMachine.deserialize(data, this.deps);
    } catch {
      return null;
    }
  }

  async has(sessionId: string): Promise<boolean> {
    return fs.existsSync(this.filePath(sessionId));
  }

  async delete(sessionId: string): Promise<boolean> {
    const file = this.filePath(sessionId);
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  }

  async list(): Promise<string[]> {
    if (!fs.existsSync(this.baseDir)) return [];
    const files = fs.readdirSync(this.baseDir);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5));
  }
}
