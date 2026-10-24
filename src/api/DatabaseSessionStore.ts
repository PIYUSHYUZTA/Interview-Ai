import { InterviewStateMachine, type SerializedStateMachine, type StateMachineDeps } from '../core/session/InterviewStateMachine.js';
import type { InterviewSessionStore } from '../core/session/InterviewSessionStore.js';
import type { DocumentStore } from './SQLiteDocuments.js';

export class DatabaseSessionStore implements InterviewSessionStore {
  constructor(private readonly documents: DocumentStore, private readonly deps: StateMachineDeps) {}
  async save(session: InterviewStateMachine): Promise<void> { this.documents.put('interviews', session.sessionId, session.serialize()); }
  async load(id: string): Promise<InterviewStateMachine | null> {
    const data = this.documents.get('interviews', id) as SerializedStateMachine | null;
    if (!data) return null;
    // Retain the existing metadata retention policy in either persistence mode.
    if (data.integrity) {
      const events = data.integrity.events.filter((e) => e.occurredAt >= Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (events.length !== data.integrity.events.length) { const retained = { ...data, integrity: { ...data.integrity, events } }; this.documents.put('interviews', id, retained); return InterviewStateMachine.deserialize(retained, this.deps); }
    }
    return InterviewStateMachine.deserialize(data, this.deps);
  }
  async has(id: string): Promise<boolean> { return this.documents.get('interviews', id) !== null; }
  async delete(id: string): Promise<boolean> { return this.documents.remove('interviews', id); }
  async list(): Promise<string[]> { return this.documents.ids('interviews'); }
}
