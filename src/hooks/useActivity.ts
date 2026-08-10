import { useEffect, useState } from 'react';
import { supabase, supabaseConfigError, toFriendlyError, type FriendlyError } from '../lib/supabase';
import type { Activity } from '../lib/types';

/**
 * Activity for one lead, keyed by linkedin_url (the natural key). client_id is
 * added to the filter when known, because linkedin_url is only unique per
 * client.
 */
export function useActivity(linkedinUrl: string | null, clientId: string | null) {
  const [rows, setRows] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FriendlyError | null>(null);

  useEffect(() => {
    if (!linkedinUrl) {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (!supabase) {
      setError({ message: supabaseConfigError ?? 'Supabase is not configured.', hint: null, code: 'CONFIG' });
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      let query = supabase!
        .from('gab_activity')
        .select('*')
        .eq('linkedin_url', linkedinUrl)
        .order('created_at', { ascending: false })
        .limit(200);

      if (clientId) query = query.eq('client_id', clientId);

      const { data, error: queryError } = await query;
      if (cancelled) return;

      if (queryError) {
        setError(toFriendlyError(queryError));
        setRows([]);
      } else {
        setRows((data ?? []) as Activity[]);
      }
      setLoading(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [linkedinUrl, clientId]);

  return { rows, loading, error };
}
