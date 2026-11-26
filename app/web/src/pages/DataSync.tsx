import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../store/auth';
import { errorMessage } from '../utils/errors';
import './Support.css';

interface SyncStatus {
  entitled: boolean;
  configured: boolean;
  lastSyncedAt: string | null;
}

function DataSyncWorkspace({ tenantId, userId }: { tenantId?: string; userId?: string }) {
  const status = useQuery({
    queryKey: ['support', 'data-sync', tenantId, userId],
    queryFn: ({ signal }) => api.get<{ backup: { sync: SyncStatus } }>('/support', { signal })
      .then(({ data }) => data.backup.sync),
  });
  const sync = useMutation({
    mutationFn: () => api.post<{ syncedAt: string }>('/support/backup/sync')
      .then(({ data }) => data),
  });
  const lastSyncedAt = sync.data?.syncedAt ?? status.data?.lastSyncedAt;

  return (
    <div className="support-page space-y-5">
      <section className="support-hero" aria-labelledby="data-sync-title">
        <h1 id="data-sync-title" className="support-title">Data Sync</h1>
        <p className="support-copy">Upload a snapshot of local business records to your cloud destination.</p>
        <Link className="support-button mt-4" to="/backup">Business Backup</Link>
      </section>

      <section className="support-card" aria-labelledby="sync-status-title">
        <h2 id="sync-status-title">Cloud snapshot</h2>
        {status.isPending && <p role="status">Checking sync availability…</p>}
        {status.isError && <p role="alert">Could not check sync availability. <button type="button" className="underline" onClick={() => void status.refetch()}>Retry</button></p>}
        {status.isSuccess && !status.data?.entitled && <p>Data Sync is unavailable for this business.</p>}
        {status.data?.entitled && !status.data.configured && <p>Ask your operator to configure the cloud destination.</p>}
        {status.data?.entitled && status.data.configured && (
          <>
            <p role="status">{lastSyncedAt
              ? <>Last confirmed upload <time dateTime={lastSyncedAt}>{new Date(lastSyncedAt).toLocaleString()}</time></>
              : 'No confirmed uploads yet.'}</p>
            <button type="button" className="support-button support-button--primary" disabled={sync.isPending}
              onClick={() => sync.mutate()}>
              {sync.isPending ? 'Uploading snapshot…' : 'Sync to cloud'}
            </button>
            {sync.isError && <p className="support-error mt-3" role="alert">{errorMessage(sync.error)}</p>}
          </>
        )}
      </section>
    </div>
  );
}

export default function DataSync() {
  const user = useAuth((state) => state.user);
  return <DataSyncWorkspace key={`${user?.tenantId}:${user?._id}`} tenantId={user?.tenantId} userId={user?._id} />;
}
