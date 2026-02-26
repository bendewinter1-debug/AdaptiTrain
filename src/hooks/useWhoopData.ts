import { useState, useEffect, useCallback } from 'react';
import { syncWhoopData, getValidAccessToken } from '../services/whoopApi';
import { getLatestWhoopData, getWhoopDataRange, getUserProfile, updateUserProfile, supabase } from '../services/supabase';
import type { WhoopData } from '../types';

export function useWhoopData(userId: string | null) {
  const [latestData, setLatestData] = useState<WhoopData | null>(null);
  const [weeklyData, setWeeklyData] = useState<WhoopData[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [whoopConnected, setWhoopConnected] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [missingScopes, setMissingScopes] = useState(false);

  const loadStoredData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [latest, weekly, profile] = await Promise.all([
        getLatestWhoopData(userId),
        getWhoopDataRange(userId, 7),
        getUserProfile(userId),
      ]);
      setLatestData(latest);
      setWeeklyData(weekly);
      setWhoopConnected(!!profile?.whoop_access_token);
      if (latest?.synced_at) setLastSynced(new Date(latest.synced_at));
    } catch {
      // silently ignore load errors
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const sync = useCallback(async () => {
    if (!userId) return;
    setSyncing(true);
    setError(null);
    setNeedsReconnect(false);
    try {
      const token = await getValidAccessToken(userId);
      if (!token) {
        setWhoopConnected(false);
        setNeedsReconnect(true);
        return;
      }
      await syncWhoopData(userId, token);
      await loadStoredData();
      setLastSynced(new Date());

      // After sync, check if recovery+sleep are STILL missing across the last 7 days.
      // Only flag as missing scopes if there's genuinely no recovery data at all —
      // today's row legitimately won't have recovery until after the cycle completes (after sleep).
      try {
        const since = new Date();
        since.setDate(since.getDate() - 7);
        const { data: recentRows } = await supabase
          .from('whoop_data')
          .select('recovery_score,sleep_score')
          .eq('user_id', userId)
          .gte('date', since.toISOString().split('T')[0])
          .order('date', { ascending: false })
          .limit(7);
        const hasAnyRecovery = recentRows && recentRows.some(r => r.recovery_score != null || r.sleep_score != null);
        // Only warn if we have multiple rows (account is syncing) but none have recovery/sleep
        const hasMultipleRows = recentRows && recentRows.length >= 2;
        setMissingScopes(hasMultipleRows && !hasAnyRecovery);
      } catch { setMissingScopes(false); }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      if (msg === 'WHOOP_MISSING_SCOPES') {
        // Only clear token on explicit scope denial (403), not on 404 no-data
        setNeedsReconnect(true);
        await updateUserProfile(userId, {
          whoop_access_token: null,
          whoop_refresh_token: null,
          whoop_token_expires_at: null,
        }).catch(() => {});
        setWhoopConnected(false);
      } else {
        // Any other error (network, 5xx, etc.) — don't touch the token
        setError('Sync failed — tap to retry');
      }
    } finally {
      setSyncing(false);
    }
  }, [userId, loadStoredData]);

  // On mount: load stored data, then auto-sync if token exists and data is missing or stale (>3h old)
  useEffect(() => {
    if (!userId) return;

    async function initLoad() {
      setLoading(true);
      try {
        const [latest, weekly, profile] = await Promise.all([
          getLatestWhoopData(userId!),
          getWhoopDataRange(userId!, 7),
          getUserProfile(userId!),
        ]);
        setLatestData(latest);
        setWeeklyData(weekly);

        const hasToken = !!profile?.whoop_access_token;
        setWhoopConnected(hasToken);

        if (latest?.synced_at) setLastSynced(new Date(latest.synced_at));

        // Auto-sync if: token exists AND (no data yet OR data is older than 3 hours)
        const isStale = !latest?.synced_at ||
          (Date.now() - new Date(latest.synced_at).getTime()) > 3 * 60 * 60 * 1000;

        if (hasToken && isStale) {
          setSyncing(true);
          const token = await getValidAccessToken(userId!);
          if (token) {
            try {
              await syncWhoopData(userId!, token);
              const [newLatest, newWeekly] = await Promise.all([
                getLatestWhoopData(userId!),
                getWhoopDataRange(userId!, 7),
              ]);
              setLatestData(newLatest);
              setWeeklyData(newWeekly);
              if (newLatest?.synced_at) setLastSynced(new Date(newLatest.synced_at));

              // Check for missing scopes across recent history — don't flag based on today alone
              // (today's cycle won't have recovery until after sleep)
              const hasAnyRecovery = newWeekly.some((r: { recovery_score: unknown; sleep_score: unknown }) => r.recovery_score != null || r.sleep_score != null);
              if (newWeekly.length >= 2 && !hasAnyRecovery) {
                setMissingScopes(true);
              }
            } catch (syncErr) {
              const msg = syncErr instanceof Error ? syncErr.message : '';
              // Only clear token on explicit 403 scope denial — not on 404 no-data
              if (msg === 'WHOOP_MISSING_SCOPES') {
                setNeedsReconnect(true);
                setWhoopConnected(false);
                await updateUserProfile(userId!, {
                  whoop_access_token: null,
                  whoop_refresh_token: null,
                  whoop_token_expires_at: null,
                }).catch(() => {});
              }
              // Otherwise silently ignore — strain still synced fine
            }
          } else {
            setWhoopConnected(false);
          }
          setSyncing(false);
        }
      } catch {
        // silently ignore init errors
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    }

    initLoad();
  }, [userId]);

  return { latestData, weeklyData, loading, syncing, error, lastSynced, whoopConnected, needsReconnect, missingScopes, sync, reload: loadStoredData };
}
