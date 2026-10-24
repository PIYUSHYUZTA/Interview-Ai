import { createRequire } from 'node:module';
import { mkdirSync, openSync, writeFileSync, closeSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

export interface DocumentStore {
  get(namespace: string, id: string): unknown | null;
  put(namespace: string, id: string, value: unknown): void;
  ids(namespace: string): string[];
  remove(namespace: string, id: string): boolean;
}
/** Existing versioned domain snapshots in transactional SQLite; no competing domain model. */
export class SQLiteDocuments implements DocumentStore {
  private readonly database: DatabaseSync;
  private readonly lockPath: string;
  private closed = false;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.lockPath = path.join(directory, '.sqlite-writer.lock');
    let descriptor: number;
    try { descriptor = openSync(this.lockPath, 'wx', 0o600); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const pid = Number(readFileSync(this.lockPath, 'utf8'));
      if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid SQLite writer lock; operator intervention required.');
      let alive = true;
      try { process.kill(pid, 0); } catch (probe) { if ((probe as NodeJS.ErrnoException).code === 'ESRCH') alive = false; }
      if (alive) throw new Error('SQLite data directory already has an active writer. Run one API process per data directory.');
      unlinkSync(this.lockPath); descriptor = openSync(this.lockPath, 'wx', 0o600);
    }
    writeFileSync(descriptor, String(process.pid)); closeSync(descriptor);
    try {
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    this.database = new DatabaseSync(path.join(directory, 'platform.sqlite'));
    const version = this.database.prepare('PRAGMA user_version').get()!.user_version as number;
    if (version > 1) { this.database.close(); throw new Error('Database schema is newer than this application. Refusing to downgrade.'); }
    this.database.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS documents(namespace TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(namespace,id));
      PRAGMA user_version=1;`);
    } catch (error) { unlinkSync(this.lockPath); throw error; }
  }
  get(namespace: string, id: string): unknown | null {
    const row = this.database.prepare('SELECT data FROM documents WHERE namespace=? AND id=?').get(namespace, id);
    return row ? JSON.parse(row.data as string) : null;
  }
  put(namespace: string, id: string, value: unknown): void {
    this.database.prepare('INSERT INTO documents(namespace,id,data) VALUES(?,?,?) ON CONFLICT(namespace,id) DO UPDATE SET data=excluded.data').run(namespace, id, JSON.stringify(value));
  }
  ids(namespace: string): string[] { return this.database.prepare('SELECT id FROM documents WHERE namespace=? ORDER BY id').all(namespace).map((r) => r.id as string); }
  remove(namespace: string, id: string): boolean { return this.database.prepare('DELETE FROM documents WHERE namespace=? AND id=?').run(namespace, id).changes > 0; }
  transaction<T>(action: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try { const value = action(); this.database.exec('COMMIT'); return value; }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
  close(): void { if (this.closed) return; this.database.close(); unlinkSync(this.lockPath); this.closed = true; }
}
