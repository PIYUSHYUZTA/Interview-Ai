import fs from 'node:fs';
import path from 'node:path';
import { SQLiteDocuments } from './SQLiteDocuments.js';
import { CandidateDataSchema } from './CandidateAuthStore.js';
import { InterviewResultsResponseSchema } from './schemas.js';
import { InterviewStateMachine, type SerializedStateMachine } from '../core/session/InterviewStateMachine.js';
import { DeterministicProvider } from '../core/provider/DeterministicProvider.js';

/** Explicit offline migration: validate all snapshots, back up originals, then commit together. */
export function migrateFileStorage(directory: string): { imported: number; backupDirectory: string | null } {
  const accountFile = path.join(directory, 'candidates.json');
  const records: Array<{ namespace: string; id: string; data: unknown; file: string }> = [];
  if (fs.existsSync(accountFile)) records.push({ namespace: 'accounts', id: 'state', data: CandidateDataSchema.parse(JSON.parse(fs.readFileSync(accountFile, 'utf8'))), file: accountFile });
  for (const namespace of ['interviews', 'reports']) {
    const source = path.join(directory, namespace);
    if (!fs.existsSync(source)) continue;
    for (const fileName of fs.readdirSync(source).filter((name) => /^[a-zA-Z0-9_-]+\.json$/.test(name))) {
      const file = path.join(source, fileName); const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const id = fileName.slice(0, -5);
      if (namespace === 'reports') { InterviewResultsResponseSchema.parse(data); if (data.sessionId !== id) throw new Error('Report ID mismatch.'); }
      else { const session = InterviewStateMachine.deserialize(data as SerializedStateMachine, { provider: new DeterministicProvider(), seed: 42 }); if (session.sessionId !== id) throw new Error('Interview ID mismatch.'); }
      records.push({ namespace, id, data, file });
    }
  }
  const documents = new SQLiteDocuments(directory);
  try {
    if (documents.get('metadata', 'fileMigration')) return { imported: 0, backupDirectory: null };
    if (['accounts', 'interviews', 'reports'].some((n) => documents.ids(n).length)) throw new Error('Database already contains data; migration refuses to overwrite it.');
    const backupDirectory = path.join(directory, `file-backup-${Date.now()}`);
    fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    for (const record of records) { const target = path.join(backupDirectory, path.relative(directory, record.file)); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(record.file, target, fs.constants.COPYFILE_EXCL); }
    documents.transaction(() => {
      for (const record of records) documents.put(record.namespace, record.id, record.data);
      documents.put('metadata', 'fileMigration', { version: 1, completedAt: new Date().toISOString(), imported: records.length });
    });
    return { imported: records.length, backupDirectory };
  } finally { documents.close(); }
}
