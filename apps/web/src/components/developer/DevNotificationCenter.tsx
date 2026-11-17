import { useEffect, useRef, useState } from 'react';

interface DevAlert {
  id: string;
  tone: 'warning' | 'danger';
  title: string;
  detail: string;
  actionLabel: string;
  onAction: () => void;
}

/**
 * Notification center built exclusively from real developer-API records:
 * license expiry dates and suspended tenants. Shows an explicit empty state
 * rather than invented metrics.
 */
export default function DevNotificationCenter({
  alerts,
}: {
  alerts: DevAlert[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dev-icon-btn relative"
        aria-label={`Notifications${alerts.length ? `, ${alerts.length} active` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {alerts.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white shadow-sm">
            {alerts.length > 99 ? '99+' : alerts.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <h2 className="text-sm font-semibold">License & status alerts</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">{alerts.length}</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {alerts.length === 0 ? (
              <p className="px-4 py-5 text-xs text-slate-500 dark:text-slate-400">
                No license or subscription alerts. All tenant licenses are current and no tenants are suspended.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {alerts.map((alert) => (
                  <li key={alert.id}>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 focus:bg-slate-50 dark:hover:bg-slate-800 dark:focus:bg-slate-800"
                      onClick={() => { alert.onAction(); setOpen(false); }}
                    >
                      <span className="min-w-0">
                        <span className={`block truncate text-xs font-semibold ${alert.tone === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {alert.title}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500 dark:text-slate-400">{alert.detail}</span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{alert.actionLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
