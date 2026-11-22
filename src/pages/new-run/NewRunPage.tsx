import { useEffect, useState, type ReactNode } from 'react';

import { isNotFound } from '@/api/client.ts';
import { useCreateRun, usePresets, useRun } from '@/api/queries.ts';
import Unavailable from '@/components/Unavailable.tsx';
import { navigate, runHref } from '@/route.ts';
import type { Preset, Presets, Run } from '@/types.ts';

// The page's shared styles load before the sections' own, which build on them.
import './newrun.css';

import {
  DEFAULT_CLUSTERING,
  clusteringSettings,
  populationOf,
  presetSettings,
  randomName,
  toNewRun,
  validate,
  type AdvancedKey,
  type ClusterForm,
  type Form,
  type ScheduleKey,
  type SettingKey,
} from './form.ts';
import ClusteringSection from './sections/ClusteringSection.tsx';
import MigrationSection from './sections/MigrationSection.tsx';
import ModeSection from './sections/ModeSection.tsx';
import ProblemSection from './sections/ProblemSection.tsx';
import SearchSection from './sections/SearchSection.tsx';
import type { StartPhase } from './summary/StartButton.tsx';
import Summary from './summary/Summary.tsx';

function NewRunForm({ presets, preset, source }: { presets: Presets; preset: Preset; source?: Run }) {
  const createRun = useCreateRun();
  const [form, setForm] = useState<Form>(() => ({
    ...presetSettings(preset, source?.run_settings),
    clustering: source ? clusteringSettings(source.clustering) : DEFAULT_CLUSTERING,
    stream: source?.stream ?? true,
    name: randomName(),
  }));
  const [submit, setSubmit] = useState<{ phase: StartPhase; error: string; runId: string }>({ phase: 'idle', error: '', runId: '' });

  const patch = (change: Partial<Form>) => setForm((prev) => ({ ...prev, ...change }));
  const setText = (key: SettingKey) => (value: string) => setForm((prev) => ({ ...prev, text: { ...prev.text, [key]: value } }));

  // Both schedule values stay at least 1; the interval may not pass the target generations, and the migrants
  // must stay below the island's population.
  const step = (key: ScheduleKey, delta: number) =>
    setForm((prev) => {
      const generations = Number(prev.text.target_generations);
      const population = populationOf(prev);
      let max = Infinity;
      if (key === 'migration.interval' && Number.isInteger(generations) && generations > 0) max = generations;
      if (key === 'migration.num_migrants' && population !== null) max = population - 1;
      const current = Number(prev.text[key]);
      const next = Math.min(max, Math.max(1, (Number.isFinite(current) ? Math.round(current) : 1) + delta));
      return { ...prev, text: { ...prev.text, [key]: String(next) } };
    });

  const patchCluster = (change: Partial<ClusterForm>) => setForm((prev) => ({ ...prev, clustering: { ...prev.clustering, ...change } }));
  const setClusterText = (key: AdvancedKey) => (value: string) =>
    setForm((prev) => ({ ...prev, clustering: { ...prev.clustering, text: { ...prev.clustering.text, [key]: value } } }));

  const errors = validate(form, presets.overrides);

  const start = async () => {
    setSubmit({ phase: 'busy', error: '', runId: '' });
    try {
      const run = await createRun.mutateAsync(toNewRun(form));
      setSubmit({ phase: 'done', error: '', runId: run.run_id });
    } catch (reason) {
      setSubmit({ phase: 'failed', error: (reason as Error).message, runId: '' });
    }
  };

  // "Run started" only shows once the backend has accepted the run, for 1.1 s before moving on to the run's page.
  // "Couldn't start" shows for 1.6 s, then the button can be held again; the error note stays until the next try.
  useEffect(() => {
    if (submit.phase === 'done') {
      const timer = window.setTimeout(() => navigate(runHref(submit.runId)), 1100);
      return () => window.clearTimeout(timer);
    }
    if (submit.phase === 'failed') {
      const timer = window.setTimeout(() => setSubmit((prev) => ({ ...prev, phase: 'idle' })), 1600);
      return () => window.clearTimeout(timer);
    }
  }, [submit.phase, submit.runId]);

  return (
    <div className="new-run-layout">
      <div className="new-run-steps">
        <ProblemSection presets={presets.presets} form={form} patch={patch} />
        <SearchSection form={form} errors={errors} overrides={presets.overrides} patch={patch} setText={setText} />
        <MigrationSection form={form} errors={errors} overrides={presets.overrides} patch={patch} setText={setText} step={step} />
        <ClusteringSection clustering={form.clustering} errors={errors} patchCluster={patchCluster} setClusterText={setClusterText} />
        <ModeSection stream={form.stream} setStream={(stream) => patch({ stream })} />
      </div>
      <Summary form={form} errors={errors} submit={submit} patch={patch} onLaunch={start} />
    </div>
  );
}

function RerunForm({ id, presets }: { id: string; presets: Presets }) {
  const source = useRun(id);
  const run = source.data;
  if (!run) {
    if (source.isError)
      return <div className="page-state">{isNotFound(source.error) ? 'The original run could not be found.' : <Unavailable />}</div>;
    return (
      <div className="page-state" role="status">
        <span className="page-spinner" aria-hidden="true" />
        Loading original run settings…
      </div>
    );
  }

  const preset = presets.presets.find(({ preset }) => preset === run.preset);
  if (!preset) return <div className="page-state">The runner no longer offers the original preset ({run.preset}).</div>;
  return <NewRunForm presets={presets} preset={preset} source={run} />;
}

export default function NewRunPage({ sourceId }: { sourceId?: string }) {
  const presets = usePresets();

  let body: ReactNode;
  if (presets.data?.presets.length)
    body = sourceId ? (
      <RerunForm key={sourceId} id={sourceId} presets={presets.data} />
    ) : (
      <NewRunForm presets={presets.data} preset={presets.data.presets[0]!} />
    );
  else if (presets.data) body = <div className="page-state">The runner has no presets to start from.</div>;
  else if (presets.isError)
    body = (
      <div className="page-state">
        <Unavailable />
      </div>
    );
  else
    body = (
      <div className="page-state" role="status">
        <span className="page-spinner" aria-hidden="true" />
        Fetching Run Presets…
      </div>
    );

  return (
    <div className="page">
      <div className="page-header">
        <h1>New Run</h1>
      </div>
      {body}
    </div>
  );
}
