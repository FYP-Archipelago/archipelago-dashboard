import { test, expect } from 'vitest';
import { readRoute, runHash } from './navigation.js';
const id = 'run-20261102T120000Z-aabbccdd';
test('backend IDs survive refresh and current-run tabs', () => {
  expect(readRoute(runHash(id))).toStrictEqual({ page: 'archipelago', runId: id });
  expect(readRoute(runHash(id, 'configuration'))).toStrictEqual({ page: 'run', runId: id });
  expect(readRoute(`#configuration?run_id=${id}`)).toStrictEqual({ page: 'run', runId: id });
  expect(readRoute('#library')).toStrictEqual({ page: 'library', runId: null });
  expect(readRoute('')).toStrictEqual({ page: 'library', runId: null });
  expect(readRoute('#archipelago?run_id=%ZZ')).toStrictEqual({ page: 'archipelago', runId: null });
  expect(() => runHash('bad/id')).toThrow(/run ID/);
  expect(() => runHash(id, 'study')).toThrow(/view/);
});
test('retired Scale route falls back to Runs while About remains standalone', () => {
  expect(readRoute('#study')).toStrictEqual({ page: 'library', runId: null });
  expect(readRoute('#about')).toStrictEqual({ page: 'about', runId: null });
  for (const page of ['migration', 'convergence', 'diagnostics', 'run']) expect(readRoute(runHash(id, page))).toStrictEqual({ page, runId: id });
});

test('Explainability opens without a backend selection and preserves an explicit run ID', () => {
  expect(readRoute('#explainability')).toStrictEqual({ page: 'explainability', runId: null });
  expect(readRoute(runHash(id, 'explainability'))).toStrictEqual({ page: 'explainability', runId: id });
});
