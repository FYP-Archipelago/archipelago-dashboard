"""Prepare static Result files offline using the installed archipelago Python module.

Run with the backend virtualenv's Python. No backend service or browser computation
is needed. These clustering settings describe this export, not the original run.
"""
import argparse
import csv
import json
import math
from importlib.metadata import version
from pathlib import Path
import re


RUN_ID = re.compile(r'run-\d{8}T\d{6}Z-[a-f0-9]{8}')
INTEGER_FIELDS = ('island_id', 'seq', 'eval_index', 'generation')
FLOAT_FIELDS = ('fitness', 't_wall')
STRING_FIELDS = ('individual_id', 'genome_encoding', 'genome_hash', 'genome_repr', 'genome_repr_mode')


def convert_evaluation(row, line):
    """CSV is textual; archipelago intentionally requires typed numeric values."""
    converted = {}
    for field in INTEGER_FIELDS + FLOAT_FIELDS:
        raw = row.get(field)
        try:
            if not isinstance(raw, str) or not raw.strip():
                raise ValueError('missing value')
            value = int(raw) if field in INTEGER_FIELDS else float(raw)
            if field in FLOAT_FIELDS and not math.isfinite(value):
                raise ValueError('non-finite value')
        except (TypeError, ValueError) as error:
            raise ValueError(f'CSV line {line}: invalid {field}: {raw!r}') from error
        converted[field] = value
    for field in STRING_FIELDS:
        if not isinstance(row.get(field), str) or not row[field]:
            raise ValueError(f'CSV line {line}: missing {field}')
        converted[field] = row[field]
    # CSV's schema stores full vectors as JSON text. The module's full-mode
    # decoder expects the decoded vector; compact base64 and trees stay text.
    composite = row['genome_encoding'] in ('real_vector_velocity', 'real_vector_sigma')
    if row['genome_encoding'] != 'expression_tree' and (row['genome_repr_mode'] == 'full' or composite):
        try:
            converted['genome_repr'] = json.loads(row['genome_repr'])
        except json.JSONDecodeError as error:
            raise ValueError(f'CSV line {line}: invalid genome_repr JSON') from error
    parents = row.get('parent_ids')
    if not isinstance(parents, str):
        raise ValueError(f'CSV line {line}: missing parent_ids')
    converted['parent_ids'] = [parent.strip() for parent in parents.split(';') if parent.strip()]
    return converted


def load_run(directory):
    with (directory / 'run.jsonl').open(encoding='utf-8-sig') as stream:
        events = [json.loads(line) for line in stream if line.strip()]
    start = next((event for event in events if event.get('type') == 'run_start'), None)
    if not start or start.get('run_id') != directory.name:
        raise ValueError(f'{directory.name}: missing or mismatched run_start')
    if not isinstance((start.get('datasets') or {}).get('maximising'), bool):
        raise ValueError(f'{directory.name}: missing explicit datasets.maximising')
    with (directory / 'evaluations.csv').open(newline='', encoding='utf-8-sig') as stream:
        rows = []
        for line, row in enumerate(csv.DictReader(stream), 2):
            if row.get('run_id') != directory.name:
                raise ValueError(f'CSV line {line}: run_id does not match {directory.name}')
            rows.append(convert_evaluation(row, line))
    if not rows:
        raise ValueError(f'{directory.name}: no evaluations')
    return start, rows, events


def recording_metadata(start, config):
    """Publish only runner settings needed to describe the saved recording."""
    migration = start.get('migration') or {}
    overrides = {field: start[field] for field in ('num_islands', 'evaluation_budget', 'target_generations')}
    overrides['migration'] = {field: migration[field] for field in ('enabled', 'topology', 'interval', 'num_migrants')}
    topology = str(migration['topology']).replace('_', ' ')
    label = f"{start['num_islands']} islands · {start['algorithm'].upper()} on {str(start['benchmark']).title()} · {topology}"
    return dict(run_id=start['run_id'], label=label, recorded_at=start['started_at'],
                configuration=dict(preset=label, stream=False, overrides=overrides,
                                   clustering=config.model_dump(mode='json')))


def write_json(path, value):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, allow_nan=False, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    temporary.replace(path)


def export(data_root, output, *, analyzer=None, analysis_version=None):
    from archipelago import Config, cluster_run
    from archipelago.models import Result

    data_root, output = Path(data_root).resolve(), Path(output).resolve()
    if not data_root.is_dir():
        raise ValueError(f'Missing data directory: {data_root}')
    if output == data_root or data_root in output.parents or output in data_root.parents:
        raise ValueError('Keep public artifacts separate from source logs.')
    config = Config(lsh=True, birch=True, detail=1)
    analyzer = analyzer or cluster_run
    index = dict(schema_version=1, runs=[], analysis_module_version=analysis_version or version('archipelago'),
                 note='Final Results prepared offline with the current Python archipelago module; clustering configuration describes this export. Original convergence and migration timing histories are not included.')
    artifacts = []
    for directory in sorted(data_root.iterdir()):
        if not directory.is_dir() or directory.is_symlink() or not RUN_ID.fullmatch(directory.name):
            continue
        start, rows, events = load_run(directory)
        result = analyzer(rows, events, config)
        # Revalidation strips fields outside the public Result schema, including
        # accidental raw logs, genomes, host details or future analyzer extras.
        public = Result.model_validate(result.model_dump(mode='json')).model_dump(mode='json')
        if public['run']['run_id'] != directory.name:
            raise ValueError(f'{directory.name}: analyzer returned a different run ID')
        artifacts.append((directory.name, public))
        index['runs'].append(recording_metadata(start, config))
    if not artifacts:
        raise ValueError('No recorded runs found.')
    output.mkdir(parents=True, exist_ok=True)
    for run_id, result in artifacts:
        write_json(output / f'{run_id}.json', result)
        graph = result['graph']
        print(f"{run_id}: {result['clustering']['counts']['evaluations']} evaluations, "
              f"{len(graph['nodes']['id'])} nodes, {len(graph['edges']['id'])} edges, "
              f"{len(graph['migrations']['id'])} migration routes")
    write_json(output / 'index.json', index)
    return index


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', default='data')
    parser.add_argument('--output', default='public/recorded-runs')
    args = parser.parse_args()
    export(args.data_root, args.output)
