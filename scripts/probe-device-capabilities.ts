// Read-only capability probe: no camera/microphone permission grant, capture, labels or IDs.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? 'C:/Users/piyus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
try {
  const page = await browser.newPage(); await page.goto(process.env.DEVICE_CHECK_ORIGIN ?? 'http://localhost:5173');
  const result = await page.evaluate(async () => {
    const devices = await navigator.mediaDevices?.enumerateDevices() ?? [];
    return { secureContext: isSecureContext, mediaCaptureAPI: !!navigator.mediaDevices?.getUserMedia, cameraInputsVisible: devices.filter((d) => d.kind === 'videoinput').length, microphoneInputsVisible: devices.filter((d) => d.kind === 'audioinput').length, browserRecognitionAPI: 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window, browserPlaybackAPI: 'speechSynthesis' in window, captureAttempted: false, physicalAudibilityVerified: false, actualSpeechTranscriptVerified: false };
  });
  mkdirSync('.browser-verification', { recursive: true }); writeFileSync('.browser-verification/physical-device-capabilities.json', JSON.stringify(result, null, 2)); console.log(result);
} finally { await browser.close(); }
