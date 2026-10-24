import type { DocumentStore } from './SQLiteDocuments.js';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { InterviewResultsResponseSchema } from './schemas.js';

type Report = z.infer<typeof InterviewResultsResponseSchema>;

/** Immutable completed-report snapshots; access is authorized by session ownership. */
export class InterviewReportStore {
  private readonly memory = new Map<string, Report>();
  constructor(private readonly directory?: string, private readonly documents?: DocumentStore) {
    if (directory) mkdirSync(directory, { recursive: true });
  }
  private file(sessionId: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error('Invalid report session ID.');
    return path.join(this.directory!, `${sessionId}.json`);
  }
  get(sessionId: string): Report | null {
    if (this.documents) { const data = this.documents.get('reports', sessionId); return data ? InterviewResultsResponseSchema.parse(data) : null; }
    if (!this.directory) return this.memory.get(sessionId) ?? null;
    const file = this.file(sessionId);
    if (!existsSync(file)) return null;
    return InterviewResultsResponseSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  }
  save(report: Report): void {
    const validated = InterviewResultsResponseSchema.parse(report);
    if (this.documents) { this.documents.put('reports', report.sessionId, validated); return; }
    if (!this.directory) { this.memory.set(report.sessionId, validated); return; }
    const file = this.file(report.sessionId);
    const temp = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(validated, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(temp, file);
  }
}
