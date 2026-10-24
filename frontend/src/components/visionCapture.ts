/** Public build settings only; bounds preserve the backend's rate and continuity limits. */
export function captureSettings(env: Record<string, unknown>) {
  const bounded = (key: string, fallback: number, low: number, high: number) => {
    const value = Number(env[key]);
    return Number.isFinite(value) && value >= low && value <= high ? Math.round(value) : fallback;
  };
  return {
    intervalMs: bounded('VITE_PROCTORING_INTERVAL_MS', 2000, 1500, 3000),
    maxEdge: bounded('VITE_PROCTORING_MAX_EDGE', 640, 320, 640),
  };
}

/** Asynchronous browser JPEG encoder; CV inference runs in the Python worker. */
export async function encodeCameraFrame(canvas: HTMLCanvasElement): Promise<string> {
  const encode = (quality: number) => new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => blob && blob.type === 'image/jpeg' ? resolve(blob) : reject(new Error('JPEG camera encoding unavailable.')), 'image/jpeg', quality));
  let blob = await encode(.65);
  if (blob.size > 180000) blob = await encode(.4);
  if (blob.size > 180000) throw new Error('Camera sample is too large. Reduce camera resolution and retry.');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Camera sample encoding failed.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}
