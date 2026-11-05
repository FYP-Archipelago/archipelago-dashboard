import csv
import json
from pathlib import Path
import tempfile
import unittest

from export import export


class ExportTests(unittest.TestCase):
    def test_raw_log_adapter_exports_real_values_without_genomes(self):
        root = Path(__file__).resolve().parents[2]
        cache = (root / '.superpowers' / 'explainability-tests').resolve()
        self.assertTrue(cache.is_relative_to(root))
        cache.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=cache) as temp:
            base = Path(temp)
            self.assertTrue(base.resolve().is_relative_to(cache))
            id = 'run-20261103T120000Z-11223344'
            run = base / 'raw' / id
            run.mkdir(parents=True)
            (run / 'run.jsonl').write_text(json.dumps(dict(type='run_start', datasets=dict(maximising=False),
                                                         algorithm='de', benchmark='sphere', migration=dict(topology='ring'))))
            columns = ['run_id', 'island_id', 'individual_id', 'parent_ids', 'operator', 'fitness', 'genome_repr']
            with (run / 'evaluations.csv').open('w', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=columns)
                writer.writeheader()
                writer.writerow(dict(run_id=id, island_id=0, individual_id='a', operator='init', fitness=10, genome_repr='private-genome'))
                writer.writerow(dict(run_id=id, island_id=0, individual_id='b', parent_ids='a', operator='trial', fitness=3, genome_repr='private-genome'))
            report = export(base / 'raw', base / 'artifacts')
            self.assertEqual(len(report['runs']), 1)
            text = (base / 'artifacts' / f'{id}.json').read_text(encoding='utf-8')
            self.assertNotIn('private-genome', text)
            artifact = json.loads(text)
            self.assertEqual(artifact['games']['islands']['full_value'], 7)
            self.assertEqual(artifact['source']['benchmark'], 'sphere')
            # Missing direction must never quietly assume minimisation.
            (run / 'run.jsonl').write_text('{"type":"run_start"}')
            report = export(base / 'raw', base / 'artifacts')
            self.assertEqual(report['runs'], [])
            self.assertIn('maximising', report['errors'][0]['detail'])


if __name__ == '__main__':
    unittest.main()
