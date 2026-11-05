import importlib.util
import json
import math
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).with_name('analytics.py')
spec = importlib.util.spec_from_file_location('recorded_analytics', SCRIPT) if SCRIPT.exists() else None
analytics = importlib.util.module_from_spec(spec) if spec else None
if analytics:
    spec.loader.exec_module(analytics)

RUN_ID = 'run-20260903T230838Z-4891f68f'


def start(**changes):
    return dict(type='run_start', run_id=RUN_ID, datasets=dict(maximising=False), **changes)


def summary(**changes):
    event = dict(type='generation_end', run_id=RUN_ID, island_id=1, generation=2,
                 best_fitness=7.5, best_so_far_fitness=6.5, mean_fitness=12.0,
                 std_fitness=2.5, diversity=0.3, evaluations_total=72,
                 diversity_metric='mean_pairwise_euclidean_normalised', maximising=False)
    return {**event, **changes}


class RecordedAnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(analytics, 'The recorded generation-summary exporter must exist.')

    def test_whitelists_recorded_metrics_and_preserves_actual_values(self):
        event = summary(hostname='PRIVATE-HOST', best_genome_hash='PRIVATE-GENOME', node_id='PRIVATE-NODE')
        result = analytics.collect([start(), event], RUN_ID)
        self.assertEqual(result['islands'], [dict(island_id=1, series=[dict(generation=2,
                         best_fitness=7.5, best_so_far_fitness=6.5, mean_fitness=12.0,
                         fitness_std=2.5, diversity=0.3, evaluations=72)])])
        self.assertEqual(result['diversity_metric'], 'mean_pairwise_euclidean_normalised')
        self.assertEqual(result['source'], 'recorded-generation-summaries')
        self.assertFalse(result['maximising'])
        self.assertNotIn('PRIVATE', json.dumps(result))

    def test_sorts_islands_and_generations_deduplicating_identical_samples(self):
        result = analytics.collect([start(), summary(), summary(generation=0),
                                    summary(island_id=0, generation=5), summary()], RUN_ID)
        self.assertEqual([island['island_id'] for island in result['islands']], [0, 1])
        self.assertEqual([point['generation'] for point in result['islands'][1]['series']], [0, 2])
        with self.assertRaisesRegex(ValueError, 'Conflicting'):
            analytics.collect([start(), summary(), summary(best_fitness=99)], RUN_ID)

    def test_missing_optional_metrics_are_omitted_instead_of_fabricated(self):
        result = analytics.collect([start(), dict(type='generation_end', run_id=RUN_ID,
                                    island_id=0, generation=3, best_fitness=0.0)], RUN_ID)
        self.assertEqual(result['islands'], [dict(island_id=0, series=[dict(generation=3, best_fitness=0.0)])])
        self.assertNotIn('diversity_metric', result)

    def test_chart_uses_consistent_recorded_metric_and_shared_axes(self):
        result = analytics.collect([start(), summary(island_id=0, generation=0, best_so_far_fitness=10),
                                     summary(island_id=1, generation=4, best_so_far_fitness=2)], RUN_ID)
        chart = result['chart']
        self.assertEqual((chart['width'], chart['height'], chart['metric']), (720, 260, 'best_so_far_fitness'))
        self.assertEqual(chart['lines'], [dict(island_id=0, points=[dict(x=65.0, y=20.0)]),
                                         dict(island_id=1, points=[dict(x=700.0, y=220.0)])])
        self.assertEqual([tick['label'] for tick in chart['x_ticks']], ['0', '1', '2', '3', '4'])
        self.assertEqual([tick['label'] for tick in chart['y_ticks']], ['2', '4', '6', '8', '10'])
        without_best_so_far = dict(type='generation_end', run_id=RUN_ID,
                                   island_id=0, generation=3, best_fitness=2.0)
        fallback = analytics.collect([start(), summary(), without_best_so_far], RUN_ID)
        self.assertEqual(fallback['chart']['metric'], 'best_fitness')

    def test_chart_handles_constant_fitness_and_single_point_without_nonfinite_coordinates(self):
        for events in [[start(), summary(generation=0, best_so_far_fitness=0)],
                       [start(), summary(generation=0, best_so_far_fitness=-3),
                        summary(generation=1, best_so_far_fitness=-3)]]:
            chart = analytics.collect(events, RUN_ID)['chart']
            self.assertEqual(len(chart['x_ticks']), 5)
            self.assertEqual(len(chart['y_ticks']), 5)
            for line in chart['lines']:
                for point in line['points']:
                    self.assertTrue(all(math.isfinite(value) for value in point.values()))
                    self.assertGreaterEqual(point['x'], 65)
                    self.assertLessEqual(point['x'], 700)
                    self.assertGreaterEqual(point['y'], 20)
                    self.assertLessEqual(point['y'], 220)

    def test_rejects_unreliable_identity_direction_and_numerical_fields(self):
        cases = [summary(run_id='another-run'), summary(best_fitness=float('nan')),
                 summary(mean_fitness=float('inf')), summary(generation=2.5),
                 summary(island_id=True), summary(evaluations_total=-1),
                 summary(best_fitness='7.5'), summary(maximising=True), summary(diversity=False)]
        for event in cases:
            with self.subTest(event=event), self.assertRaises(ValueError):
                analytics.collect([start(), event], RUN_ID)
        for events in [[], [summary()], [dict(type='run_start', run_id=RUN_ID), summary()]]:
            with self.subTest(events=events), self.assertRaises(ValueError):
                analytics.collect(events, RUN_ID)

    def test_export_reads_only_saved_generation_summaries(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as temporary:
            base = Path(temporary)
            directory = base / 'data' / RUN_ID
            directory.mkdir(parents=True)
            events = [start(), summary(), dict(type='diagnostic', run_id=RUN_ID, message='PRIVATE-LOG')]
            (directory / 'run.jsonl').write_text('\n'.join(json.dumps(e) for e in events), encoding='utf-8')
            analytics.export(base / 'data', base / 'public')
            text = (base / 'public' / f'{RUN_ID}.json').read_text(encoding='utf-8')
            self.assertNotIn('PRIVATE', text)
            self.assertEqual(json.loads(text)['islands'][0]['series'][0]['evaluations'], 72)

    def test_public_artifacts_preserve_both_recordings_without_padding_generations(self):
        expected = {
            RUN_ID: {0: 13, 1: 20, 2: 20, 3: 20},
            'run-20260903T230942Z-c7f38cc1': {0: 17, 1: 17, 2: 17, 3: 18, 4: 17},
        }
        for run_id, lengths in expected.items():
            path = ROOT / 'public' / 'recorded-analytics' / f'{run_id}.json'
            self.assertTrue(path.exists(), f'Generate the saved summaries for {run_id}.')
            result = json.loads(path.read_text(encoding='utf-8'))
            self.assertEqual(result['schema_version'], 1)
            self.assertEqual(result['run_id'], run_id)
            self.assertEqual({island['island_id']: len(island['series']) for island in result['islands']}, lengths)
            originals = [json.loads(line) for line in (ROOT / 'data' / run_id / 'run.jsonl').read_text(encoding='utf-8-sig').splitlines()]
            samples = {(e['island_id'], e['generation']): e for e in originals if e['type'] == 'generation_end'}
            for island in result['islands']:
                for point in island['series']:
                    original = samples[(island['island_id'], point['generation'])]
                    for output, source in [('best_fitness', 'best_fitness'), ('best_so_far_fitness', 'best_so_far_fitness'),
                                           ('mean_fitness', 'mean_fitness'), ('fitness_std', 'std_fitness'),
                                           ('diversity', 'diversity'), ('evaluations', 'evaluations_total')]:
                        self.assertEqual(point[output], original[source])
            for secret in ['genome', 'hostname', 'node_id', 'diagnostic']:
                self.assertNotIn(secret, json.dumps(result))


if __name__ == '__main__':
    unittest.main()
