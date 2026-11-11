import csv
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = Path(__file__).with_name('export.py')
spec = importlib.util.spec_from_file_location('demo_export', SCRIPT) if SCRIPT.exists() else None
exporter = importlib.util.module_from_spec(spec) if spec else None
if exporter:
    spec.loader.exec_module(exporter)


def evaluation(**changes):
    row = dict(run_id='run-20260903T230838Z-4891f68f', island_id='1', seq='12',
               eval_index='8', generation='2', t_wall='1788476919.5', individual_id='child',
               parent_ids='a;b', fitness='3.75', genome_encoding='real_vector',
               genome_hash='hash', genome_repr='[1,2]', genome_repr_mode='full')
    return {**row, **changes}


def result_fixture(run_id):
    nodes = {field: [] for field in ['id', 'island', 'x', 'y', 'z', 'visits', 'members',
             'mean_fitness', 'best_fitness', 'fitness_percentile', 'progress', 'first_eval',
             'last_eval', 'in_degree', 'out_degree', 'islands_sharing', 'island_best',
             'overall_best', 'migration_endpoint', 'genome_hash']}
    nodes['weight'] = None
    return dict(run=dict(run_id=run_id, algorithm='de', benchmark='rastrigin',
                        migration_topology='ring', islands=[1], maximising=False),
                layout=dict(method='none', variance_kept_2d=0, variance_kept_3d=0),
                graph=dict(nodes=nodes, edges=dict(id=[], source=[], target=[], weight=[]),
                           migrations=dict(id=[], source=[], target=[], count=[]), overlap=0),
                clustering=dict(stages=['lsh', 'birch'], counts=dict(evaluations=1, rows_clustered=1,
                                nodes=0, faded_nodes=None), resolved=dict(birch_threshold=None,
                                denstream_epsilon=None, denstream_half_life=None, lsh_bucket_width=None),
                                diagnostics={}, elapsed_seconds=0),
                separation=dict(method='mmd-random-fourier-features', typical_distance=None,
                    pairs=dict(a=[], b=[], mmd2=[], p=[]),
                    windows=dict(from_generation=[], typical_distance=[]),
                    window_pairs=dict(window=[], a=[], b=[], mmd2=[])),
                migration_routes=[],
                explainability=dict(shapley=dict(status='unavailable', detail='No lineage in this fixture.')),
                malformed_rows=0, warnings=[])


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(exporter, 'The recorded-result exporter must exist.')

    def test_csv_values_become_required_numeric_types_and_parent_lists(self):
        row = exporter.convert_evaluation(evaluation(), 1)
        self.assertEqual({key: row[key] for key in ['island_id', 'seq', 'eval_index', 'generation']},
                         dict(island_id=1, seq=12, eval_index=8, generation=2))
        self.assertTrue(all(type(row[key]) is int for key in ['island_id', 'seq', 'eval_index', 'generation']))
        self.assertEqual((row['fitness'], row['t_wall'], row['parent_ids']),
                         (3.75, 1788476919.5, ['a', 'b']))
        self.assertEqual(exporter.convert_evaluation(evaluation(parent_ids=''), 1)['parent_ids'], [])

    def test_bad_numeric_values_fail_before_scientific_processing(self):
        for key, value in [('island_id', '1.2'), ('seq', ''), ('generation', 'NaN'),
                           ('fitness', 'NaN'), ('fitness', 'inf'), ('t_wall', '')]:
            with self.subTest(key=key, value=value), self.assertRaisesRegex(ValueError, key):
                exporter.convert_evaluation(evaluation(**{key: value}), 3)

    def test_full_mode_json_genomes_reach_scientific_module_as_vectors(self):
        self.assertEqual(exporter.convert_evaluation(evaluation(), 1)['genome_repr'], [1, 2])
        self.assertEqual(exporter.convert_evaluation(evaluation(genome_repr_mode='compact',
                         genome_repr='YWJj'), 1)['genome_repr'], 'YWJj')
        self.assertEqual(exporter.convert_evaluation(evaluation(genome_encoding='expression_tree',
                         genome_repr='add(x,2)'), 1)['genome_repr'], 'add(x,2)')

    def test_export_preserves_recording_settings_and_excludes_private_metadata(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as temp:
            base = Path(temp)
            run_id = evaluation()['run_id']
            source = base / 'raw' / run_id
            source.mkdir(parents=True)
            start = dict(type='run_start', run_id=run_id, started_at='2026-09-03T23:08:38.432442Z',
                algorithm='de', benchmark='rastrigin', num_islands=1, evaluation_budget=20,
                target_generations=2, datasets=dict(maximising=False),
                migration=dict(enabled=True, topology='ring', interval=3, num_migrants=2),
                host=dict(hostname='PRIVATE-HOST'), config=dict(execution=dict(control_host='PRIVATE-HOST')))
            (source / 'run.jsonl').write_text(json.dumps(start) + '\n' + json.dumps(dict(type='diagnostic', message='PRIVATE-LOG')), encoding='utf-8')
            row = evaluation()
            with (source / 'evaluations.csv').open('w', newline='', encoding='utf-8') as stream:
                writer = csv.DictWriter(stream, fieldnames=row)
                writer.writeheader()
                writer.writerow(row)

            def cluster(rows, events, config):
                self.assertEqual(rows[0]['parent_ids'], ['a', 'b'])
                self.assertEqual(type(rows[0]['island_id']), int)
                self.assertEqual(events[0]['run_id'], run_id)
                value = result_fixture(run_id)
                value['host'] = 'PRIVATE-HOST'
                value['graph']['genome_repr'] = 'PRIVATE-GENOME'
                return SimpleNamespace(model_dump=lambda **_: value)

            index = exporter.export(base / 'raw', base / 'out', analyzer=cluster, analysis_version='test')
            metadata = index['runs'][0]
            self.assertEqual(metadata['recorded_at'], start['started_at'])
            self.assertEqual(metadata['configuration']['overrides'], dict(num_islands=1,
                evaluation_budget=20, target_generations=2,
                migration=dict(enabled=True, topology='ring', interval=3, num_migrants=2)))
            self.assertFalse(metadata['configuration']['stream'])
            self.assertTrue(metadata['configuration']['clustering']['lsh'])
            self.assertTrue(metadata['configuration']['clustering']['birch'])
            self.assertIsInstance(metadata['label'], str)
            text = ''.join(path.read_text(encoding='utf-8') for path in (base / 'out').glob('*.json'))
            for secret in ['PRIVATE-HOST', 'PRIVATE-LOG', 'PRIVATE-GENOME', 'control_host', 'genome_repr']:
                self.assertNotIn(secret, text)

    def test_exported_artifacts_cover_both_public_recordings_with_real_graphs(self):
        from archipelago.models import Result
        output = ROOT / 'public' / 'recorded-runs'
        self.assertTrue((output / 'index.json').exists(), 'Generate the recorded result library.')
        index = json.loads((output / 'index.json').read_text(encoding='utf-8'))
        self.assertEqual(index['schema_version'], 1)
        self.assertEqual({run['run_id'] for run in index['runs']},
                         {'run-20260903T230838Z-4891f68f', 'run-20260903T230942Z-c7f38cc1'})
        for run in index['runs']:
            artifact = json.loads((output / (run['run_id'] + '.json')).read_text(encoding='utf-8'))
            validated = Result.model_validate(artifact)
            self.assertEqual(validated.run.run_id, run['run_id'])
            self.assertGreater(len(validated.graph.nodes.id), 0)
            self.assertGreater(len(validated.graph.migrations.id), 0)
            self.assertEqual(validated.malformed_rows, 0)
            self.assertEqual(validated.clustering.counts.rows_clustered, validated.clustering.counts.evaluations)
            self.assertEqual(validated.clustering.stages, ['lsh', 'birch'])
            self.assertNotIn('genome_repr', json.dumps(artifact))
            self.assertNotIn('host', artifact)


if __name__ == '__main__':
    unittest.main()
