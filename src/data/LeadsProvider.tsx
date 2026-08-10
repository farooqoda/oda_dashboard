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

  const load = useCallback(async () => {
    if (!supabase) {
      setLoaded(true);
      return;
    }
    setRefreshing(true);
    const { data, error: queryError } = await supabase
      .from('gab_leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);

    if (!mounted.current) return;

    if (queryError) {
      setError(toFriendlyError(queryError));
    } else {
      setLeads((data ?? []) as Lead[]);
      setError(null);
      setLastLoadedAt(new Date());
    }
    setLoaded(true);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
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

  const value = useMemo<LeadsContextValue>(
    () => ({
      leads,
      loading: !loaded,
      refreshing,
      error,
      loaded,
      lastLoadedAt,
      refresh: () => void load(),
      updateLead,
    }),
    [leads, loaded, refreshing, error, lastLoadedAt, load, updateLead],
  );

  return <LeadsContext.Provider value={value}>{children}</LeadsContext.Provider>;
}

export function useLeads(): LeadsContextValue {
  const ctx = useContext(LeadsContext);
  if (!ctx) throw new Error('useLeads must be used inside <LeadsProvider>');
  return ctx;
}
