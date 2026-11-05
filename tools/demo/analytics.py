"""Export saved generation summaries and chart coordinates without running analytics in JS.

All series values come directly from generation_end events: std_fitness becomes
fitness_std and evaluations_total becomes evaluations. best_fitness is the recorded
generation best; best_so_far_fitness is separately copied only when provided. No
missing generations, metrics, wall-clock timings or convergence values are inferred.
"""
import argparse
import json
import math
from pathlib import Path
import re


RUN_ID = re.compile(r'run-\d{8}T\d{6}Z-[a-f0-9]{8}')
OPTIONAL_FIELDS = {
    'best_so_far_fitness': 'best_so_far_fitness',
    'mean_fitness': 'mean_fitness',
    'fitness_std': 'std_fitness',
    'diversity': 'diversity',
    'evaluations': 'evaluations_total',
}


def number(value, field, *, integer=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f'{field} must be numeric.')
    if not math.isfinite(value):
        raise ValueError(f'{field} must be finite.')
    if integer and (not isinstance(value, int) or value < 0):
        raise ValueError(f'{field} must be a nonnegative integer.')
    return value


def build_chart(islands):
    """Prepare drawing geometry on shared numeric axes; preserve objective direction."""
    samples = [point for island in islands for point in island['series']]
    metric = 'best_so_far_fitness' if all('best_so_far_fitness' in point for point in samples) else 'best_fitness'
    xs = [point['generation'] for point in samples]
    ys = [point[metric] for point in samples]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    if x_min == x_max:
        padding = max(abs(x_min) * 0.05, 1)
        x_min, x_max = x_min - padding, x_max + padding
    if y_min == y_max:
        padding = max(abs(y_min) * 0.05, 1)
        y_min, y_max = y_min - padding, y_max + padding
    x = lambda value: 65.0 + (value - x_min) / (x_max - x_min) * 635.0
    y = lambda value: 220.0 - (value - y_min) / (y_max - y_min) * 200.0
    x_values = [x_min + (x_max - x_min) * i / 4 for i in range(5)]
    y_values = [y_min + (y_max - y_min) * i / 4 for i in range(5)]
    return dict(width=720, height=260, metric=metric,
                x_ticks=[dict(x=x(value), label=f'{value:.6g}') for value in x_values],
                y_ticks=[dict(y=y(value), label=f'{value:.6g}') for value in y_values],
                lines=[dict(island_id=island['island_id'],
                            points=[dict(x=x(point['generation']), y=y(point[metric])) for point in island['series']])
                       for island in islands])


def collect(events, run_id):
    if not RUN_ID.fullmatch(run_id):
        raise ValueError('Invalid recording run_id.')
    relevant = [event for event in events if event.get('type') in ('run_start', 'generation_end')]
    if any(event.get('run_id') != run_id for event in relevant):
        raise ValueError('Recorded event run_id does not match its directory.')
    starts = [event for event in relevant if event['type'] == 'run_start']
    if not starts:
        raise ValueError('Missing run_start metadata.')
    maximising = (starts[0].get('datasets') or {}).get('maximising')
    if not isinstance(maximising, bool):
        raise ValueError('Missing explicit datasets.maximising.')
    if any((event.get('datasets') or {}).get('maximising') is not maximising for event in starts):
        raise ValueError('Conflicting run_start objective direction.')
    points, diversity_metrics = {}, set()
    for event in relevant:
        if event['type'] != 'generation_end':
            continue
        if 'maximising' in event and event['maximising'] is not maximising:
            raise ValueError('Conflicting generation objective direction.')
        island = number(event.get('island_id'), 'island_id', integer=True)
        generation = number(event.get('generation'), 'generation', integer=True)
        point = dict(generation=generation, best_fitness=number(event.get('best_fitness'), 'best_fitness'))
        for output, source in OPTIONAL_FIELDS.items():
            if event.get(source) is not None:
                point[output] = number(event[source], source, integer=output == 'evaluations')
        if event.get('diversity_metric') is not None:
            metric = event['diversity_metric']
            if not isinstance(metric, str) or not metric:
                raise ValueError('Invalid diversity_metric.')
            diversity_metrics.add(metric)
        key = island, generation
        if key in points and points[key] != point:
            raise ValueError(f'Conflicting generation summaries for island {island}, generation {generation}.')
        points[key] = point
    if not points:
        raise ValueError('No recorded generation summaries are available.')
    if len(diversity_metrics) > 1:
        raise ValueError('Conflicting diversity metrics cannot share a chart label.')
    islands = [dict(island_id=island, series=[points[key] for key in sorted(points) if key[0] == island])
               for island in sorted({key[0] for key in points})]
    result = dict(schema_version=1, run_id=run_id, maximising=maximising,
                  source='recorded-generation-summaries',
                  note='Values copied from saved generation_end events. Each island ends at its last recorded generation; missing generations are not filled.',
                  islands=islands, chart=build_chart(islands))
    if diversity_metrics:
        result['diversity_metric'] = next(iter(diversity_metrics))
    return result


def export(data_root, output):
    data_root, output = Path(data_root).resolve(), Path(output).resolve()
    if not data_root.is_dir():
        raise ValueError(f'Missing data directory: {data_root}')
    if output == data_root or data_root in output.parents or output in data_root.parents:
        raise ValueError('Keep public summaries separate from source logs.')
    artifacts = []
    for directory in sorted(data_root.iterdir()):
        if not directory.is_dir() or directory.is_symlink() or not RUN_ID.fullmatch(directory.name):
            continue
        with (directory / 'run.jsonl').open(encoding='utf-8-sig') as stream:
            events = [json.loads(line) for line in stream if line.strip()]
        artifacts.append(collect(events, directory.name))
    if not artifacts:
        raise ValueError('No recorded runs found.')
    output.mkdir(parents=True, exist_ok=True)
    for artifact in artifacts:
        path = output / (artifact['run_id'] + '.json')
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(artifact, allow_nan=False, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        temporary.replace(path)
        print(f"{artifact['run_id']}: " + ', '.join(f"island {island['island_id']}: {len(island['series'])} generations" for island in artifact['islands']))
    return artifacts


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-root', default='data')
    parser.add_argument('--output', default='public/recorded-analytics')
    args = parser.parse_args()
    export(args.data_root, args.output)
