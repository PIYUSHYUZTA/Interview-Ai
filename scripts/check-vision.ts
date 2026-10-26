// Vision self-check through the API's own launcher (same interpreter discovery, same worker process).
// Real fixture photos: a portrait (face, landmarks, head pose, then gaze on the second sample),
// two hands, and a blank frame. Exits non-zero on any failure. Run: npm run check:vision
import fs from 'node:fs';
import path from 'node:path';
import { ProctoringWorker, visionPython, VISION_WORKER } from '../src/api/ProctoringWorker.js';

const fixtures = path.join(path.dirname(VISION_WORKER), 'fixtures');
const image = (name: string) => fs.readFileSync(path.join(fixtures, `${name}.jpg`)).toString('base64');
const python = visionPython();
const worker = new ProctoringWorker();
const failures: string[] = [];
const check = (condition: boolean, message: string) => { if (!condition) failures.push(message); };
console.log(`Interpreter: ${python.source === 'project-venv' ? '.venv-proctoring' : python.source === 'environment' ? 'PROCTORING_PYTHON' : 'system python (fallback)'}`);
try {
  const started = Date.now();
  const first = await worker.analyze('vision-self-check', image('portrait'));
  const loadMs = Date.now() - started;
  check(first.faceCount === 1, `portrait: expected 1 face, got ${first.faceCount}`);
  check((first.faceTracks[0]?.landmarks.length ?? 0) >= 14, 'portrait: facial landmarks missing');
  check(first.headPoseDegrees !== null, 'portrait: head pose missing');
  check(Object.values(first.moduleStatus ?? {}).every((status) => status === 'ready' || status === 'disabled'), `modules: ${JSON.stringify(first.moduleStatus)}`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const second = await worker.analyze('vision-self-check', image('portrait'));
  check(second.gazeReliable === true && second.gazeDirection !== 'unavailable', `gaze: expected a reliable estimate on the second sample, got ${second.gazeDirection}`);
  const hands = await worker.analyze('vision-self-check-hands', image('right_hands'));
  check(hands.handCount >= 1, `hands: expected at least one hand, got ${hands.handCount}`);
  const blank = await worker.analyze('vision-self-check-blank', image('blank'));
  check(blank.faceCount === 0, `blank: expected no face, got ${blank.faceCount}`);
  console.log(`Models: ${JSON.stringify(first.moduleStatus)} · first frame ${loadMs} ms (includes model load)`);
  console.log(`Face: ${first.faceCount} · landmarks ${first.faceTracks[0]?.landmarks.length ?? 0} · head pose ${JSON.stringify(first.headPoseDegrees)} · state ${first.faceState}`);
  console.log(`Gaze (2nd sample): ${second.gazeDirection} (reliable ${second.gazeReliable}) · Hands: ${hands.handCount} · Blank frame faces: ${blank.faceCount}`);
} catch (error) {
  failures.push(`worker: ${(error as Error).message}`);
} finally {
  worker.close();
}
if (failures.length) { console.error(`FAIL vision self-check:\n - ${failures.join('\n - ')}`); process.exit(1); }
console.log('PASS vision self-check: face detection, facial landmarks, head pose, gaze and hand tracking work through the API launcher.');
