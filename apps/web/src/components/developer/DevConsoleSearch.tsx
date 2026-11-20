import { useEffect, useMemo, useRef, useState } from 'react';
import type { BusinessPlanTarget, SubscriptionPlan } from '@pos/shared-types';
import { IconSearch } from '../Icons';

interface SearchHit {
  id: string;
  kind: 'Business' | 'Plan';
  title: string;
  subtitle: string;
  action: () => void;
}

/**
 * Global developer-console search across businesses and plans already loaded
 * from authorized developer endpoints. Renders nothing decorative: results are
 * real records and every result navigates or opens a detail view.
 */
export default function DevConsoleSearch({
  businesses,
  plans,
  onOpenBusiness,
  onOpenPlan,
}: {
  businesses: BusinessPlanTarget[];
  plans: SubscriptionPlan[];
  onOpenBusiness: (business: BusinessPlanTarget) => void;
  onOpenPlan: (plan: SubscriptionPlan) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const businessHits: SearchHit[] = businesses
      .filter((b) => b.name.toLowerCase().includes(q) || b.businessId.toLowerCase().includes(q) || (b.domainType ?? '').toLowerCase().includes(q))
      .slice(0, 6)
      .map((b) => ({
        id: `biz-${b.businessId}`,
        kind: 'Business',
        title: b.name,
        subtitle: `${b.businessId} · ${b.domainType ?? 'custom'} · ${b.status}`,
        action: () => onOpenBusiness(b),
      }));
    const planHits: SearchHit[] = plans
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map((p) => ({
        id: `plan-${p._id}`,
        kind: 'Plan',
        title: p.name,
        subtitle: `${p.isActive ? 'Active' : 'Archived'} plan`,
        action: () => onOpenPlan(p),
      }));
    return [...businessHits, ...planHits];
  }, [query, businesses, plans, onOpenBusiness, onOpenPlan]);

  return (
    <div className="relative min-w-0 flex-1 max-w-md" ref={containerRef}>
      <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && query.trim().length >= 2}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[selected] ? hits[selected].id : undefined}
        onKeyDown={(event) => {
          if (!hits.length) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setSelected((index) => event.key === 'ArrowDown' ? (index + 1) % hits.length : (index <= 0 ? hits.length - 1 : index - 1));
          } else if (open && event.key === 'Enter' && hits[selected]) {
            event.preventDefault();
            hits[selected].action();
            setOpen(false);
            setQuery('');
          }
        }}
        aria-controls="dev-global-search-results"
        aria-label="Search businesses and plans"
        placeholder="Search tenants, plans…"
        className="input !min-h-[38px] w-full pl-9 text-[13px]"
        value={query}
        onChange={(event) => { setSelected(-1); setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && query.trim().length >= 2 && (
        <div
          id="dev-global-search-results"
          role="listbox"
          aria-label="Search results"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">No matching businesses or plans.</p>
          ) : (
            hits.map((hit, index) => (
              <button
                key={hit.id}
                type="button"
                role="option"
                id={hit.id}
                aria-selected={index === selected}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left aria-selected:bg-slate-100 dark:aria-selected:bg-slate-800 hover:bg-slate-50 focus:bg-slate-50 dark:hover:bg-slate-800 dark:focus:bg-slate-800"
                onClick={() => { hit.action(); setOpen(false); setQuery(''); }}
              >
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  {hit.kind}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{hit.title}</span>
                  <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">{hit.subtitle}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
