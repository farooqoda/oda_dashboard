import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { MAX_ROWS } from '../lib/constants';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from '../lib/supabase';
import type { Lead, LeadPatch } from '../lib/types';

interface LeadsContextValue {
  leads: Lead[];
  /** True only before the first successful load — refetches keep the old rows. */
  loading: boolean;
  /** True while a background refresh is in flight over existing rows. */
  refreshing: boolean;
  error: FriendlyError | null;
  /** Set once the first load resolves, so "empty" and "not loaded yet" differ. */
  loaded: boolean;
  lastLoadedAt: Date | null;
  refresh: () => void;
  /**
   * Optimistically patch a lead, then write to Supabase. Returns an error when
   * the write fails, having already rolled the row back.
   */
  updateLead: (id: number, patch: LeadPatch) => Promise<FriendlyError | null>;
}

const LeadsContext = createContext<LeadsContextValue | null>(null);

// ---------------------------------------------------------------------------
// Diffing
// ---------------------------------------------------------------------------
//
// Every screen renders straight off `leads`, so replacing the array wholesale
// re-renders every row even when nothing about them changed — which is what
// made a realtime event flash the list and lose the user's scroll position.
// The helpers below let a refetch or a realtime payload land as the smallest
// possible state change: rows that did not change keep their exact object
// identity, and when nothing at all changed the array itself is kept, so React
// re-renders nothing.

/** Deep-ish equality: `traits` is jsonb, everything else is a scalar. */
function sameLead(a: Lead, b: Lead): boolean {
  if (a === b) return true;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = (a as unknown as Record<string, unknown>)[key];
    const right = (b as unknown as Record<string, unknown>)[key];
    if (left === right) continue;
    const composite =
      (left !== null && typeof left === 'object') || (right !== null && typeof right === 'object');
    if (composite) {
      if (JSON.stringify(left ?? null) !== JSON.stringify(right ?? null)) return false;
      continue;
    }
    return false;
  }
  return true;
}

/** Sort weight: newest `created_at` first, id as the tie-break. */
function sortsBefore(a: Lead, b: Lead): boolean {
  const at = a.created_at ? Date.parse(a.created_at) : NaN;
  const bt = b.created_at ? Date.parse(b.created_at) : NaN;
  const left = Number.isNaN(at) ? 0 : at;
  const right = Number.isNaN(bt) ? 0 : bt;
  return left === right ? a.id > b.id : left > right;
}

/**
 * Fold a freshly fetched set into the rows already on screen, preserving the
 * identity of every row whose contents are unchanged. Returns `current`
 * untouched when the two sets are equivalent.
 */
function mergeLeads(current: Lead[], incoming: Lead[]): Lead[] {
  const byId = new Map(current.map((lead) => [lead.id, lead]));
  let changed = current.length !== incoming.length;

  const next = incoming.map((row, index) => {
    const existing = byId.get(row.id);
    if (existing && sameLead(existing, row)) {
      if (current[index] !== existing) changed = true;
      return existing;
    }
    changed = true;
    return row;
  });

  return changed ? next : current;
}

/**
 * Apply one realtime row. An update replaces just that row, in place; an
 * insert is spliced into its sorted position so a new lead appears without the
 * list rebuilding around it.
 *
 * Realtime payloads carry only what the table's replica identity exposes, so
 * an existing row is merged over rather than replaced — a partial payload must
 * never blank out columns the initial fetch already gave us.
 */
function upsertLead(current: Lead[], incoming: Lead): Lead[] {
  const index = current.findIndex((lead) => lead.id === incoming.id);

  if (index >= 0) {
    const merged = { ...current[index], ...incoming };
    if (sameLead(current[index], merged)) return current;
    const next = current.slice();
    next[index] = merged;
    return next;
  }

  const at = current.findIndex((lead) => sortsBefore(incoming, lead));
  const next = current.slice();
  next.splice(at < 0 ? next.length : at, 0, incoming);
  return next.length > MAX_ROWS ? next.slice(0, MAX_ROWS) : next;
}

/** Realtime can be dropped or arrive partial; a quiet reconcile closes the gap. */
const RECONCILE_DELAY_MS = 3000;

export function LeadsProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(
    supabaseConfigError ? { message: supabaseConfigError, hint: null, code: 'CONFIG' } : null,
  );
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * `silent` fetches in the background: no "Refreshing…" state, no dimmed
   * panels. Realtime reconciles use it, because a user-visible refresh
   * indicator firing on every row change is half of the flicker.
   */
  const load = useCallback(async (silent = false) => {
    if (!supabase) {
      setLoaded(true);
      return;
    }
    if (!silent) setRefreshing(true);

    const { data, error: queryError } = await supabase
      .from('gab_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);

    if (!mounted.current) return;

    if (queryError) {
      // A silent reconcile that fails leaves the rows on screen alone: the
      // user is mid-task and the next event or manual refresh will retry.
      if (!silent) setError(toFriendlyError(queryError));
    } else {
      const rows = (data ?? []) as Lead[];
      setLeads((current) => mergeLeads(current, rows));
      setError(null);
      setLastLoadedAt(new Date());
    }
    setLoaded(true);
    if (!silent) setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime. Each payload is applied to the row it names instead of triggering
  // a whole-list refetch, with a debounced silent reconcile behind it to catch
  // anything the subscription missed or delivered partially.
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let reconcileTimer: number | undefined;

    const scheduleReconcile = () => {
      if (reconcileTimer !== undefined) window.clearTimeout(reconcileTimer);
      reconcileTimer = window.setTimeout(() => {
        reconcileTimer = undefined;
        void load(true);
      }, RECONCILE_DELAY_MS);
    };

    const channel = client
      .channel('gab_leads_live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gab_leads' },
        (payload) => {
          if (!mounted.current) return;

          const row = payload.new as Partial<Lead> | null;
          const previous = payload.old as Partial<Lead> | null;

          if (payload.eventType === 'DELETE') {
            const goneId = previous?.id;
            if (typeof goneId === 'number') {
              setLeads((current) =>
                current.some((lead) => lead.id === goneId)
                  ? current.filter((lead) => lead.id !== goneId)
                  : current,
              );
            }
            return;
          }

          if (row && typeof row.id === 'number') {
            setLeads((current) => upsertLead(current, row as Lead));
          }
          scheduleReconcile();
        },
      )
      .subscribe((status) => {
        // A reconnect may have missed events while the socket was down.
        if (status === 'SUBSCRIBED' && mounted.current) scheduleReconcile();
      });

    return () => {
      if (reconcileTimer !== undefined) window.clearTimeout(reconcileTimer);
      client.removeChannel(channel);
    };
  }, [load]);

  const updateLead = useCallback(
    async (id: number, patch: LeadPatch): Promise<FriendlyError | null> => {
      if (!supabase) {
        return {
          message: supabaseConfigError ?? 'Supabase is not configured.',
          hint: null,
          code: 'CONFIG',
        };
      }

      let previous: Lead | undefined;
      setLeads((current) =>
        current.map((lead) => {
          if (lead.id !== id) return lead;
          previous = lead;
          return { ...lead, ...patch };
        }),
      );

      const { error: writeError } = await supabase
        .from('gab_leads')
        .update(patch)
        .eq('id', id);

      if (writeError) {
        // Roll the optimistic change back so the UI never claims a save that
        // did not happen.
        if (previous) {
          const restore = previous;
          setLeads((current) => current.map((lead) => (lead.id === id ? restore : lead)));
        }
        return toFriendlyError(writeError);
      }
      return null;
    },
    [],
  );

  const refresh = useCallback(() => void load(), [load]);

  const value = useMemo<LeadsContextValue>(
    () => ({
      leads,
      loading: !loaded,
      refreshing,
      error,
      loaded,
      lastLoadedAt,
      refresh,
      updateLead,
    }),
    [leads, loaded, refreshing, error, lastLoadedAt, refresh, updateLead],
  );

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error('useLeads must be used inside <LeadsProvider>');
  return ctx;
}
