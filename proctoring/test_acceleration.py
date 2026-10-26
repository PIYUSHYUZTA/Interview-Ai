import unittest
from types import SimpleNamespace
from unittest.mock import patch

from acceleration import Accelerator


class FakeBase:
    """Stands in for mediapipe.tasks.BaseOptions: records which delegate each model was built with."""
    Delegate = SimpleNamespace(GPU='GPU', CPU='CPU')

    def __init__(self, model_asset_path, delegate):
        self.path, self.delegate = model_asset_path, delegate


def factory(gpu_error=None):
    calls = []
    def create(options):
        calls.append(options.base_options.delegate)
        if options.base_options.delegate == 'GPU' and gpu_error:
            raise gpu_error
        return SimpleNamespace(delegate=options.base_options.delegate)
    return create, calls


options = lambda **kw: SimpleNamespace(**kw)


class AcceleratorTests(unittest.TestCase):
    def test_gpu_used_where_the_build_supports_it(self):
        create, calls = factory()
        accelerator = Accelerator(FakeBase, 'auto')
        self.assertEqual(accelerator.create('face', create, options, 'face.task').delegate, 'GPU')
        self.assertEqual(accelerator.report(), {'requested': 'auto', 'delegates': {'face': 'gpu'}, 'active': 'gpu', 'gpuUnavailableReason': None})

    def test_cpu_fallback_when_the_build_has_no_gpu_and_no_retry_per_model(self):
        create, calls = factory(NotImplementedError('ValidatedGraphConfig Initialization failed.\nImageCloneCalculator: GPU processing is disabled in build flags'))
        accelerator = Accelerator(FakeBase, 'auto')
        for name in ('face', 'pose', 'hands', 'phone'):
            self.assertEqual(accelerator.create(name, create, options, name).delegate, 'CPU')
        self.assertEqual(calls, ['GPU', 'CPU', 'CPU', 'CPU', 'CPU'])  # GPU tried once, not per model
        report = accelerator.report()
        self.assertEqual(report['active'], 'cpu')
        self.assertIn('no GPU support', report['gpuUnavailableReason'])

    def test_other_gpu_failures_are_reported_and_still_fall_back(self):
        create, _ = factory(RuntimeError('Could not create an OpenGL ES context'))
        accelerator = Accelerator(FakeBase, 'gpu')
        self.assertEqual(accelerator.create('face', create, options, 'f').delegate, 'CPU')
        self.assertEqual(accelerator.report()['gpuUnavailableReason'], 'GPU delegate failed: Could not create an OpenGL ES context')

    def test_cpu_mode_never_tries_gpu_and_invalid_mode_is_rejected(self):
        create, calls = factory()
        Accelerator(FakeBase, 'cpu').create('face', create, options, 'f')
        self.assertEqual(calls, ['CPU'])
        with patch.dict('os.environ', {'PROCTORING_ACCELERATION': 'cuda'}):
            with self.assertRaises(ValueError): Accelerator(FakeBase)


if __name__ == '__main__': unittest.main()
