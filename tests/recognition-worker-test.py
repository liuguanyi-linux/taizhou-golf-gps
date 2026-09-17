"""Mask geometry tests use synthetic arrays, NOT evidence of recognition quality."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location('worker', Path(__file__).resolve().parents[1]/'scripts/recognition-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class GeometryTests(unittest.TestCase):
    def test_mercator_endpoints_and_non_linear_latitude(self):
        bounds = [120, 70, 120.01, 70.02]
        self.assertAlmostEqual(worker.coordinate(0, 0, 100, 200, bounds)[1], 70.02, 10)
        self.assertAlmostEqual(worker.coordinate(100, 200, 100, 200, bounds)[1], 70, 10)
        self.assertNotEqual(worker.coordinate(50, 100, 100, 200, bounds)[1], 70.01)

    def test_separate_components_and_closed_rings(self):
        mask = np.zeros((80, 80), np.uint8)
        mask[10:25, 15:35] = 1
        mask[40:60, 45:65] = 1
        rings, rejected = worker.polygons(mask, [120, 30, 120.01, 30.01])
        self.assertEqual(len(rings), 2)
        self.assertEqual(sum(rejected.values()), 0)
        for ring in rings:
            self.assertEqual(ring[0], ring[-1])
            self.assertTrue(all(120 < p[0] < 120.01 and 30 < p[1] < 30.01 for p in ring))

    def test_holes_border_and_tiny_regions_rejected(self):
        mask = np.zeros((80, 80), np.uint8)
        mask[10:30, 10:30] = 1
        mask[15:20, 15:20] = 0
        mask[0:10, 40:60] = 1
        mask[60:62, 60:62] = 1
        rings, rejected = worker.polygons(mask, [120, 30, 120.01, 30.01])
        self.assertEqual(rings, [])
        self.assertEqual(rejected['holes'], 1)
        self.assertEqual(rejected['edge'], 1)
        self.assertEqual(rejected['small'], 1)

    def test_bounds_and_threshold_validation(self):
        data = {'kind': 'green', 'bounds': [120, 30, 120.01, 30.01], 'provider': 'synthetic', 'threshold': .5}
        worker.validate(data)
        for patch in [{'kind': 'flag'}, {'bounds': [120, 30, 120, 31]}, {'bounds': [120, 30, 121, 31]}, {'threshold': float('nan')}, {'threshold': True}]:
            with self.assertRaises(ValueError):
                worker.validate({**data, **patch})


if __name__ == '__main__':
    unittest.main()
