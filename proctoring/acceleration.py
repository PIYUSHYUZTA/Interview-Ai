"""Model delegate selection: use MediaPipe's GPU delegate where this build supports it, otherwise CPU.

GPU is never required. PROCTORING_ACCELERATION:
  auto (default) - try GPU once; if this MediaPipe build has no GPU support, every model uses CPU
  gpu            - same as auto, but a fallback is reported as a warning (still never fatal)
  cpu            - CPU only, no GPU attempt
The official MediaPipe wheels for Windows are built without GPU support, so on Windows this reports
CPU with that reason; Linux/macOS builds with GPU support use it automatically.
"""
import os

MODES = ('auto', 'gpu', 'cpu')


class Accelerator:
    def __init__(self, base_options, mode=None):
        self.base = base_options
        self.mode = (mode or os.environ.get('PROCTORING_ACCELERATION', 'auto')).strip().lower()
        if self.mode not in MODES:
            raise ValueError('Invalid PROCTORING_ACCELERATION: use auto, gpu or cpu')
        self.gpu_unavailable = None if self.mode != 'cpu' else 'CPU requested'
        self.delegates = {}

    def create(self, name, factory, options, model_path):
        """Build one model, GPU first when allowed, CPU as the fallback. Returns the model."""
        if self.gpu_unavailable is None:
            try:
                model = factory(options(base_options=self.base(model_asset_path=model_path, delegate=self.base.Delegate.GPU)))
                self.delegates[name] = 'gpu'
                return model
            except Exception as error:  # noqa: BLE001 - any GPU failure means CPU, never a crash
                message = str(error)
                # A build without GPU support fails the same way for every model: stop trying.
                self.gpu_unavailable = ('this MediaPipe build has no GPU support (official Windows wheels are CPU-only)'
                                        if 'disabled in build flags' in message else
                                        f'GPU delegate failed: {message.splitlines()[0][:160] if message else type(error).__name__}')
        model = factory(options(base_options=self.base(model_asset_path=model_path, delegate=self.base.Delegate.CPU)))
        self.delegates[name] = 'cpu'
        return model

    def report(self):
        used = sorted(set(self.delegates.values()))
        return {'requested': self.mode, 'delegates': dict(self.delegates),
                'active': used[0] if len(used) == 1 else 'mixed' if used else 'none',
                'gpuUnavailableReason': self.gpu_unavailable}
