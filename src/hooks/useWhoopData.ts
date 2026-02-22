import { useState, useEffect, useCallback } from 'react';
import { syncWhoopData, getValidAccessToken } from '../services/whoopApi';
import { getLatestWhoopData, getWhoopDataRange } from '../services/supabase';
import type { WhoopData } from '../types';

export function useWhoopData(userId: string | null) {
  const [latestData, setLatestData] = useState<WhoopData | null>(null);
  const [weeklyData, setWeeklyData] = useState<WhoopData[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const loadStoredData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [latest, weekly] = await Promise.all([
        getLatestWhoopData(userId),
        getWhoopDataRange(userId, 7),
      ]);
      setLatestData(latest);
      setWeeklyData(weekly);
      if (latest?.synced_at) setLastSynced(new Date(latest.synced_at));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Whoop data');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const sync = useCallback(async () => {
    if (!userId) return;
    setSyncing(true);
    setError(null);
    try {
      const token = await getValidAccessToken(userId);
      if (!token) throw new Error('No valid Whoop token. Please reconnect Whoop.');
      await syncWhoopData(userId, token);
      await loadStoredData();
      setLastSynced(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [userId, loadStoredData]);

  useEffect(() => {
    if (userId) loadStoredData();
  }, [userId, loadStoredData]);

  return { latestData, weeklyData, loading, syncing, error, lastSynced, sync, reload: loadStoredData };
}
