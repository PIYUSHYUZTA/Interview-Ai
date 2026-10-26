import { describe, expect, it, vi } from 'vitest';
import { captureSettings, encodeCameraFrame } from '../../frontend/src/components/visionCapture.js';

describe('bounded asynchronous camera capture', () => {
  it('accepts safe sampling settings and rejects unsafe values', () => {
    expect(captureSettings({})).toEqual({ intervalMs: 400, maxEdge: 640 });
    expect(captureSettings({ VITE_PROCTORING_INTERVAL_MS: '3000', VITE_PROCTORING_MAX_EDGE: '480' })).toEqual({ intervalMs: 3000, maxEdge: 480 });
    expect(captureSettings({ VITE_PROCTORING_INTERVAL_MS: '1', VITE_PROCTORING_MAX_EDGE: '1920' })).toEqual({ intervalMs: 400, maxEdge: 640 });
  });
  it('retries compression once and rejects oversized frames before transmission', async () => {
    const toBlob = vi.fn((callback: (blob: Blob) => void) => callback(new Blob([new Uint8Array(180001)], { type: 'image/jpeg' })));
    await expect(encodeCameraFrame({ toBlob } as unknown as HTMLCanvasElement)).rejects.toThrow('too large');
    expect(toBlob).toHaveBeenCalledTimes(2);
  });
  it('reports unsupported JPEG encoding instead of sending another format', async () => {
    const toBlob = (callback: (blob: Blob | null) => void) => callback(null);
    await expect(encodeCameraFrame({ toBlob } as unknown as HTMLCanvasElement)).rejects.toThrow('unavailable');
  });
});
