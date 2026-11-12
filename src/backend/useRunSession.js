import { useEffect, useRef, useState } from 'react';
import { applyGraphDelta, emptyGraph, graphFromResult } from './graph-model.js';

const initial = (runId) => ({
  runId,
  status: 'loading',
  connection: 'connecting',
  graph: emptyGraph(),
  result: null,
  layout: null,
  clustering: null,
  malformedRows: 0,
  warnings: [],
  error: '',
  cancelPending: false,
  cancelError: '',
  cancelNotice: '',
});
const message = (error) => (error instanceof Error ? error.message : String(error));
const nativeEventSource = (target) => new EventSource(target);

const sameRequest = (a, b) => !!a && a.runId === b.runId && a.api === b.api && a.eventSourceFactory === b.eventSourceFactory && a.retry === b.retry;

export default function useRunSession({ runId, api, eventSourceFactory = nativeEventSource }) {
  const [state, setState] = useState(null);
  const [retry, setRetry] = useState(0);
  const cancelAction = useRef(null);
  useEffect(() => {
    const request = { runId, api, eventSourceFactory, retry };
    let active = true,
      source = null,
      attempts = 0,
      timer = null,
      cancelling = false;
    const abort = new AbortController();
    let graphState = emptyGraph(),
      acceptingEvents = true,
      failedStatus = false,
      terminal = false;
    const patch = (change) => {
      if (active)
        setState((tagged) => ({ request, value: { ...(sameRequest(tagged?.request, request) ? tagged.value : initial(runId)), ...change } }));
    };
    const finish = (result) => {
      if (!active) return;
      try {
        const graph = graphFromResult(result);
        patch({
          status: 'done',
          connection: 'closed',
          graph,
          result,
          layout: result.layout,
          clustering: result.clustering,
          malformedRows: result.malformed_rows,
          warnings: result.warnings || [],
          error: '',
        });
        acceptingEvents = false;
        terminal = true;
        source?.close();
      } catch (error) {
        acceptingEvents = false;
        patch({ connection: 'closed', error: message(error) });
        source?.close();
      }
    };
    const loadResult = async ({ terminal = false } = {}) => {
      try {
        finish(await api.result(runId, { signal: abort.signal }));
        return true;
      } catch (error) {
        if (!active || abort.signal.aborted) return true;
        if (error.status === 404 && /run not found/i.test(error.message)) {
          patch({ status: 'unknown', connection: 'closed', error: message(error) });
          source?.close();
          return true;
        }
        if (error.status === 404 && !terminal) return false;
        if (error.status === 404 && terminal && attempts++ < 60) {
          timer = setTimeout(() => loadResult({ terminal: true }), 1000);
          return true;
        }
        patch({ connection: 'closed', error: message(error) });
        source?.close();
        return true;
      }
    };
    const cancel = async () => {
      if (!active || cancelling || terminal) return;
      cancelling = true;
      patch({ cancelPending: true, cancelError: '', cancelNotice: '' });
      try {
        const response = await api.cancelRun(runId, { signal: abort.signal });
        if (!active) return;
        if (terminal) {
          patch({ cancelPending: false });
          return;
        }
        patch({ cancelPending: false });
        if (response.status === 'done') {
          acceptingEvents = false;
          terminal = true;
          source?.close();
          patch({ status: 'done', connection: 'loading result', error: '' });
          await loadResult({ terminal: true });
        } else if (response.status === 'cancelled' || response.status === 'failed') {
          acceptingEvents = false;
          terminal = true;
          failedStatus = false;
          clearTimeout(timer);
          source?.close();
          const failure = response.error;
          patch({
            status: response.status,
            connection: 'closed',
            error: response.status === 'failed' ? `${failure?.phase ? failure.phase + ': ' : ''}${failure?.message || 'Run failed.'}` : '',
          });
        } else if (response.status === 'cancelling') {
          // Recorded but not yet confirmed; the event stream reports cancelled once both runner and worker stop.
          patch({ status: 'cancelling' });
        } else patch({ cancelNotice: `Cancellation was not confirmed. Backend status: ${response.status}.` });
      } catch (error) {
        if (active) patch({ cancelPending: false, cancelError: terminal ? '' : message(error) });
      } finally {
        cancelling = false;
      }
    };
    cancelAction.current = cancel;
    const parse = (event, label) => {
      try {
        return JSON.parse(event.data);
      } catch {
        throw Error(`Backend sent an invalid ${label} event.`);
      }
    };
    const start = async () => {
      if ((await loadResult()) || !active) return;
      try {
        source = eventSourceFactory(api.url(`/runs/${encodeURIComponent(runId)}/events`));
      } catch (error) {
        patch({ connection: 'closed', error: message(error) });
        return;
      }
      source.onopen = () => {
        if (active && acceptingEvents) patch({ connection: 'connected', error: '' });
      };
      source.addEventListener('status', (event) => {
        if (!active || !acceptingEvents) return;
        try {
          const { status } = parse(event, 'status');
          patch({ status, connection: 'connected' });
          if (['done', 'failed', 'cancelled'].includes(status)) terminal = true;
          if (status === 'done') {
            acceptingEvents = false;
            source.close();
            patch({ connection: 'loading result' });
            loadResult({ terminal: true });
          }
          if (status === 'failed') {
            acceptingEvents = false;
            failedStatus = true;
            patch({ error: 'Run failed. Waiting for backend error details.' });
            // The backend sends the failure phase/message after its status.
            timer = setTimeout(() => {
              if (active && failedStatus) {
                failedStatus = false;
                source.close();
                patch({ connection: 'closed', error: 'Run failed. No additional error details were received.' });
              }
            }, 5000);
          }
          if (status === 'cancelled') {
            acceptingEvents = false;
            source.close();
            patch({ connection: 'closed' });
          }
        } catch (error) {
          acceptingEvents = false;
          patch({ error: message(error), connection: 'closed' });
          source.close();
        }
      });
      source.addEventListener('update', (event) => {
        if (!active || !acceptingEvents) return;
        try {
          const update = parse(event, 'update');
          // Apply before scheduling React state: updater exceptions are
          // otherwise raised later, outside this event handler's catch block.
          const graph = applyGraphDelta(graphState, update.graph);
          graphState = graph;
          patch({
            status: update.status,
            connection: 'connected',
            graph,
            clustering: update.clustering,
            malformedRows: update.malformed_rows,
            warnings: update.warnings || [],
            error: '',
          });
          if (update.layout) patch({ layout: update.layout });
        } catch (error) {
          acceptingEvents = false;
          patch({ error: message(error), connection: 'closed' });
          source.close();
        }
      });
      source.addEventListener('final', (event) => {
        if (!active || !acceptingEvents) return;
        try {
          finish(parse(event, 'final'));
        } catch (error) {
          acceptingEvents = false;
          patch({ error: message(error), connection: 'closed' });
          source.close();
        }
      });
      source.addEventListener('error', (event) => {
        if (!active || (!acceptingEvents && !failedStatus)) return;
        if (failedStatus) {
          clearTimeout(timer);
          failedStatus = false;
          acceptingEvents = false;
          if (!event.data) {
            source.close();
            patch({ connection: 'closed', error: 'Run failed. The event stream closed before error details arrived.' });
            return;
          }
        }
        if (event.data) {
          try {
            const failure = parse(event, 'error');
            terminal = true;
            patch({
              status: 'failed',
              connection: 'closed',
              error: `${failure.phase ? failure.phase + ': ' : ''}${failure.message || 'Run failed.'}`,
            });
          } catch (error) {
            patch({ error: message(error), connection: 'closed' });
          }
          acceptingEvents = false;
          source.close();
        } else if (source.readyState === 2) {
          acceptingEvents = false;
          patch({ connection: 'closed', error: 'Event stream closed. Retry the connection to reload this run.' });
        } else patch({ connection: 'reconnecting' }); // EventSource retries with Last-Event-ID.
      });
    };
    start();
    return () => {
      active = false;
      abort.abort();
      clearTimeout(timer);
      source?.close();
      if (cancelAction.current === cancel) cancelAction.current = null;
    };
  }, [runId, api, eventSourceFactory, retry]);
  return {
    ...(sameRequest(state?.request, { runId, api, eventSourceFactory, retry }) ? state.value : initial(runId)),
    retry: () => setRetry((value) => value + 1),
    cancelRun: () => cancelAction.current?.(),
  };
}
