import { useState } from 'react';

import { useDeleteRun, useRenameRun } from '@/api/queries.ts';
import { isFinished, NAME_MAX } from '@/api/runs.ts';
import { navigate, runsHref, useRoute } from '@/route.ts';
import type { Run } from '@/types.ts';

import Dialog from './Dialog.tsx';

export function deleteBlockedBy(status: Run['status']): string | undefined {
  if (isFinished(status)) return undefined;
  return status === 'cancelling' ? 'Run is still cancelling' : 'Cancel the run first to delete it';
}

export function RenameRunDialog({ run, onClose }: { run: Run; onClose: () => void }) {
  const rename = useRenameRun(run.run_id);
  const [name, setName] = useState(run.run_name);
  const trimmed = name.trim();
  const canSave = trimmed !== '' && trimmed !== run.run_name && !rename.isPending;

  return (
    <Dialog title="Rename run" busy={rename.isPending} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) rename.mutate(trimmed, { onSuccess: onClose });
        }}
      >
        <input
          autoFocus
          className="input dialog-input"
          aria-label="Run name"
          value={name}
          maxLength={NAME_MAX}
          spellCheck={false}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setName(event.target.value)}
        />
        {rename.isError && <p className="dialog-error">{rename.error.message}</p>}
        <div className="dialog-actions">
          <button type="button" className="button" disabled={rename.isPending} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button button-primary" disabled={!canSave}>
            {rename.isPending && <span className="button-spinner" />}
            {rename.isPending ? 'Saving' : 'Save'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// Deleting the run that is open leaves its page for the runs list.
export function DeleteRunDialog({ run, onClose }: { run: Run; onClose: () => void }) {
  const remove = useDeleteRun(run.run_id);
  const route = useRoute();
  const viewing = route.name === 'run' && route.id === run.run_id;

  const onDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        onClose();
        if (viewing) navigate(runsHref);
      },
    });

  return (
    <Dialog title="Delete run?" busy={remove.isPending} onClose={onClose}>
      <p className="dialog-text">
        <strong>{run.run_name}</strong> and all its data will be permanently deleted. This can&apos;t be undone.
      </p>
      {remove.isError && <p className="dialog-error">{remove.error.message}</p>}
      <div className="dialog-actions">
        <button autoFocus className="button" disabled={remove.isPending} onClick={onClose}>
          Cancel
        </button>
        <button className="button button-destructive" disabled={remove.isPending} onClick={onDelete}>
          {remove.isPending && <span className="button-spinner" />}
          {remove.isPending ? 'Deleting' : 'Delete run'}
        </button>
      </div>
    </Dialog>
  );
}
