import { test, expect } from 'vitest';
import { migrationVisible, MIGRATION_VISIBILITY_DEFAULTS } from './visibility.js';
test('migrations for hidden islands or filtered paths are hidden by default', () => {
  expect(MIGRATION_VISIBILITY_DEFAULTS.includeHiddenPaths).toBe(false);
  expect(migrationVisible({})).toBe(true);
  for (const flag of ['sourceVisible', 'targetVisible', 'sourcePathVisible', 'targetPathVisible'])
    expect(migrationVisible({ [flag]: false })).toBe(false);
});
test('explicit hidden-path opt-in preserves route switches', () => {
  expect(migrationVisible({ sourceVisible: false, targetPathVisible: false, includeHiddenPaths: true })).toBe(true);
  expect(migrationVisible({ routeEnabled: false, includeHiddenPaths: true })).toBe(false);
});
