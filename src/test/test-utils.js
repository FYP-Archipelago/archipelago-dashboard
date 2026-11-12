import { act, fireEvent, render as renderView } from '@testing-library/react';
import { expect } from 'vitest';
import { catalog } from './fixtures/presets.js';

export const runId = 'run-20261102T120000Z-aabbccdd';
export const makeApi = (extra = {}) => ({
  baseUrl: 'http://localhost:8000',
  health: async () => ({ status: 'ok', db: true, redis: true }),
  presets: async () => catalog,
  createRun: async (body) => ({ run_id: runId, status: 'queued', ...body, error: null }),
  ...extra,
});

export async function render(ui) {
  let view;
  await act(async () => {
    view = renderView(ui);
  });
  return { ...view, rerender: (next) => act(async () => view.rerender(next)) };
}
export const find = (name) => document.querySelector(`[name="${name}"]`) || document.getElementById(name);
export const button = (text) => [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === text);
export async function click(el) {
  expect(el, 'control exists').toBeTruthy();
  await act(async () => fireEvent.click(el));
}
export async function input(name, value) {
  const el = find(name);
  expect(el, `Input ${name} exists`).toBeTruthy();
  await act(async () => (el.tagName === 'SELECT' ? fireEvent.change : fireEvent.input)(el, { target: { value } }));
}
export const submit = (selector = '.new-run-form') => act(async () => fireEvent.submit(document.querySelector(selector)));
export { act, catalog };
