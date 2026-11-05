"""Local artifact adapter. Run from the dashboard with npm run explainability:prepare."""
import argparse
import csv
import json
from pathlib import Path
import re
import time

from lineage import explain

RUN_ID = re.compile(r'run-\d{8}T\d{6}Z-[a-f0-9]{8}')


def load_run(directory):
    start = None
    with (directory / 'run.jsonl').open(encoding='utf-8-sig') as stream:
        for line in stream:
            event = json.loads(line)
            if event.get('type') == 'run_start':
                start = event
                break
    if not start:
        raise ValueError('Missing run_start metadata.')
    maximising = (start.get('datasets') or {}).get('maximising')
    if not isinstance(maximising, bool):
        raise ValueError('Missing explicit datasets.maximising in run metadata.')
    rows = []
    with (directory / 'evaluations.csv').open(newline='', encoding='utf-8-sig') as stream:
        for row in csv.DictReader(stream):
            rows.append(row)
            if len(rows) > 100000:
                raise ValueError('Local prototype limit: 100,000 evaluations per run.')
    if any(row.get('run_id') != directory.name for row in rows):
        raise ValueError('Evaluation run IDs must match their directory.')
    return start, rows, maximising


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')), encoding='utf-8')
    temporary.replace(path)


def export(data_root, output):
    data_root, output = Path(data_root).resolve(), Path(output).resolve()
    if not data_root.is_dir():
        raise ValueError(f'Raw run directory does not exist: {data_root}')
    if output == data_root or data_root in output.parents or output in data_root.parents:
        raise ValueError('Keep the artifact output separate from source logs.')
    output.mkdir(parents=True, exist_ok=True)
    index = dict(schema_version=1, runs=[], errors=[])
    for directory in sorted(data_root.iterdir()):
        if not directory.is_dir() or directory.is_symlink() or not RUN_ID.fullmatch(directory.name):
            continue
        try:
            start, rows, maximising = load_run(directory)
            clock = time.perf_counter()
            result = explain(rows, maximising=maximising, run_id=directory.name)
            result['source'] = dict(kind='local-recorded-lineage', algorithm=start.get('algorithm'),
                                    benchmark=start.get('benchmark'),
                                    topology=(start.get('migration') or {}).get('topology'),
                                    elapsed_seconds=time.perf_counter()-clock)
            write_json(output / f'{directory.name}.json', result)
            index['runs'].append(dict(run_id=directory.name, algorithm=start.get('algorithm'),
                                      benchmark=start.get('benchmark'),
                                      islands=len(result['games']['islands']['players']),
                                      coverage_percent=result['coverage']['percent']))
            print(f'{directory.name}: {result["coverage"]["supported"]}/{len(rows)} supported; '
                  f'islands {result["games"]["islands"]["method"]}; routes {result["games"]["routes"]["method"]}')
        except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as error:
            detail = str(error)
            if isinstance(error, PermissionError):
                detail += ' Stop the local dev server before refreshing artifacts on Windows.'
            index['errors'].append(dict(run_id=directory.name, detail=detail))
            print(f'{directory.name}: unavailable ({detail})')
    write_json(output / 'index.json', index)
    return index


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', default='data')
    parser.add_argument('--output', default='public/sample-explanations')
    args = parser.parse_args()
    report = export(args.data_root, args.output)
    if not report['runs']:
        raise SystemExit('No runs could be explained. See the reported input errors.')
