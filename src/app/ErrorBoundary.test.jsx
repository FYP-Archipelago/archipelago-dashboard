import { useEffect } from 'react';
import { test, expect, vi } from 'vitest';
import { render, click, button } from '../test/test-utils.js';
import ErrorBoundary from './ErrorBoundary.jsx';

test('a render error is logged, shown with its message and retry remounts the view', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  let broken = true;
  const View = () => {
    if (broken) throw new Error('bad separation table');
    return <p>View ready</p>;
  };
  await render(
    <ErrorBoundary>
      <View />
    </ErrorBoundary>
  );
  expect(document.querySelector('[role="alert"]').textContent).toMatch(/This view failed: bad separation table/);
  const logged = log.mock.calls.find(([label]) => label === 'View failed:');
  expect(logged[1].message).toBe('bad separation table');
  expect(logged[2]).toMatch(/View/);
  broken = false;
  await click(button('Retry'));
  expect(document.body.textContent).toMatch(/View ready/);
  expect(document.querySelector('[role="alert"]')).toBe(null);
});

test('a new reset key clears the error, and healthy views are not remounted by key changes', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let mounts = 0;
  const View = ({ fail }) => {
    useEffect(() => {
      mounts++;
    }, []);
    if (fail) throw new Error('broken view');
    return <p>View ready</p>;
  };
  const view = await render(
    <ErrorBoundary resetKey="diagnostics">
      <View fail />
    </ErrorBoundary>
  );
  expect(document.querySelector('[role="alert"]')).toBeTruthy();
  await view.rerender(
    <ErrorBoundary resetKey="migration">
      <View />
    </ErrorBoundary>
  );
  expect(document.querySelector('[role="alert"]')).toBe(null);
  expect(mounts).toBe(1);
  await view.rerender(
    <ErrorBoundary resetKey="convergence">
      <View />
    </ErrorBoundary>
  );
  expect(mounts).toBe(1);
});
