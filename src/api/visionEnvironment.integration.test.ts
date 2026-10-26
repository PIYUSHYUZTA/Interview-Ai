import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ProctoringWorker, VISION_WORKER, visionPython } from './ProctoringWorker.js';

// Requirements 1-3 against the real machine: the interpreter the API launches, the libraries it imports,
// and the Python worker starting and answering. No mocks.
const lock = Object.fromEntries(readFileSync('requirements-proctoring.lock.txt', 'utf8').split(/\r?\n/)
  .map((line) => line.trim().match(/^([A-Za-z0-9_.-]+)==([^\s;]+)/)).filter(Boolean).map((m) => [m![1].toLowerCase(), m![2]]));

describe('vision environment (real interpreter, no mocks)', () => {
  it('uses the project virtual environment, Python 3.10-3.13, with the locked libraries importable', () => {
    const python = visionPython();
    expect(python.source).toBe(process.env.PROCTORING_PYTHON ? 'environment' : 'project-venv'); // never the system fallback
    const report = JSON.parse(execFileSync(python.command, ['-I', '-c', [
      'import json, sys, importlib.metadata as m',
      'import mediapipe, cv2, numpy',
      'print(json.dumps({"prefix": sys.prefix, "base": sys.base_prefix, "version": list(sys.version_info[:3]),',
      ' "mediapipe": m.version("mediapipe"), "opencv": m.version("opencv-contrib-python"), "numpy": m.version("numpy"),',
      ' "cv2": cv2.__version__, "duplicateOpenCV": [d for d in ("opencv-python","opencv-python-headless","opencv-contrib-python-headless") if __import__("importlib.util").util.find_spec("cv2") and d in {x.metadata["Name"].lower() for x in m.distributions()}]}))',
    ].join('\n')], { encoding: 'utf8', timeout: 60_000 }));
    if (python.source === 'project-venv') expect(path.resolve(report.prefix)).toBe(path.resolve('.venv-proctoring'));
    expect(report.prefix).not.toBe(report.base); // a virtual environment, not the system interpreter
    expect(report.version[0]).toBe(3); expect(report.version[1]).toBeGreaterThanOrEqual(10); expect(report.version[1]).toBeLessThanOrEqual(13);
    expect({ mediapipe: report.mediapipe, opencv: report.opencv, numpy: report.numpy }).toEqual({ mediapipe: lock.mediapipe, opencv: lock['opencv-contrib-python'], numpy: lock.numpy });
    expect(lock['opencv-contrib-python'].startsWith(report.cv2)).toBe(true);
    expect(report.duplicateOpenCV).toEqual([]); // exactly one OpenCV distribution
  }, 90_000);

  it('starts the real Python worker, loads every model, and analyses a frame', async () => {
    const worker = new ProctoringWorker(60_000);
    try {
      const image = readFileSync('proctoring/fixtures/portrait.jpg');
      const small = execFileSync(visionPython().command, ['-I', '-c', 'import sys,cv2,numpy as n,base64;i=cv2.imdecode(n.frombuffer(sys.stdin.buffer.read(),n.uint8),1);i=cv2.resize(i,(480,600));sys.stdout.write(base64.b64encode(cv2.imencode(".jpg",i,[cv2.IMWRITE_JPEG_QUALITY,70])[1]).decode())'], { input: image, encoding: 'utf8' });
      const observation = await worker.analyze('environment-check', small);
      expect(observation.moduleStatus).toEqual({ face: 'ready', pose: 'ready', hands: 'ready', phone: 'ready' });
      expect(observation.faceCount).toBe(1);
      expect(observation.frame).toMatchObject({ format: 'jpeg', width: 480, height: 600 });
      expect(observation.runtime?.acceleration.active).toMatch(/^(cpu|gpu|mixed)$/);
      expect(VISION_WORKER.endsWith(path.join('proctoring', 'worker.py'))).toBe(true);
    } finally { worker.close(); }
  }, 90_000);
});
