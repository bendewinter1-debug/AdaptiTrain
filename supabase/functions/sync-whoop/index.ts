// Supabase Edge Function: sync-whoop
// Schedule this via Supabase cron (pg_cron) to run 3x daily:
// e.g. "0 7,13,20 * * *" (7am, 1pm, 8pm UTC)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHOOP_OAUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2';
const WHOOP_API_URL = 'https://api.prod.whoop.com/developer/v1';
const WHOOP_CLIENT_ID = 'ea7da3b6-fd0c-49ec-8763-9cf9ffdf226e';
const WHOOP_CLIENT_SECRET = Deno.env.get('WHOOP_CLIENT_SECRET') ?? '';

async function refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: WHOOP_CLIENT_ID,
    client_secret: WHOOP_CLIENT_SECRET,
  });

  const res = await fetch(`${WHOOP_OAUTH_URL}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  return res.json();
}

async function fetchWithAuth(path: string, token: string) {
  const res = await fetch(`${WHOOP_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 means no data (e.g. recovery not yet calculated), treat as empty
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Whoop API ${path} failed: ${res.status}`);
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // Get all users with Whoop tokens
  const usersRes = await fetch(
    `${supabaseUrl}/rest/v1/users?whoop_access_token=not.is.null&select=id,whoop_access_token,whoop_refresh_token,whoop_token_expires_at`,
    { headers },
  );
  const users: Record<string, string>[] = await usersRes.json();

  const today = new Date().toISOString().split('T')[0];
  const results: { userId: string; status: string }[] = [];

  for (const user of users) {
    try {
      let accessToken = user.whoop_access_token;

      // Refresh token if expired
      const expiresAt = user.whoop_token_expires_at ? new Date(user.whoop_token_expires_at) : null;
      if (expiresAt && expiresAt <= new Date()) {
        const tokens = await refreshToken(user.whoop_refresh_token);
        accessToken = tokens.access_token;

        // Update stored tokens
        await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${user.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            whoop_access_token: tokens.access_token,
            whoop_refresh_token: tokens.refresh_token,
            whoop_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          }),
        });
      }

      // Fetch data from Whoop v1 API
      // Fetch last 3 cycles — current cycle (end:null) has no recovery yet,
      // so we find the most recent completed one for recovery score.
      const cycleRes = await fetchWithAuth('/cycle?limit=3', accessToken);
      const cycles: { id: number; end: string | null; score: Record<string, number> | null }[] =
        cycleRes?.records ?? [];

      // Most recent cycle (open or closed) for strain
      const latestCycleScore = cycles[0]?.score ?? null;
      // Most recently completed cycle for recovery
      const completedCycle = cycles.find((c) => c.end != null) ?? null;

      const [recoveryRes, sleepRes] = await Promise.allSettled([
        completedCycle
          ? fetchWithAuth(`/cycle/${completedCycle.id}/recovery`, accessToken)
          : Promise.resolve(null),
        fetchWithAuth('/activity/sleep?limit=2', accessToken),
      ]);

      const recoveryRaw = recoveryRes.status === 'fulfilled' ? recoveryRes.value : null;
      const recovery = recoveryRaw?.score_state === 'SCORED' ? recoveryRaw.score : null;

      // Use most recent scored non-nap sleep
      const sleepRecords: { score_state: string; nap?: boolean; score?: Record<string, number> }[] =
        (sleepRes.status === 'fulfilled' ? sleepRes.value?.records : null) ?? [];
      const bestSleep = sleepRecords.find(r => r.score_state === 'SCORED' && !r.nap)
        ?? sleepRecords.find(r => r.score_state === 'SCORED')
        ?? null;
      const sleep = bestSleep?.score ?? null;

      const cycle = latestCycleScore;

      // Build partial record — only include fields we actually have data for
      // so we don't overwrite previously stored values with nulls.
      const record: Record<string, unknown> = {
        user_id: user.id,
        date: today,
        synced_at: new Date().toISOString(),
      };
      if (recovery?.recovery_score != null) record.recovery_score = recovery.recovery_score;
      if (recovery?.hrv_rmssd_milli != null) record.hrv_rmssd = recovery.hrv_rmssd_milli;
      if (recovery?.resting_heart_rate != null) record.resting_heart_rate = recovery.resting_heart_rate;
      if (sleep?.sleep_performance_percentage != null) record.sleep_score = sleep.sleep_performance_percentage;
      if (cycle?.strain != null) record.strain = cycle.strain;

      await fetch(`${supabaseUrl}/rest/v1/whoop_data`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(record),
      });

      results.push({ userId: user.id, status: 'synced' });
    } catch (err) {
      results.push({ userId: user.id, status: `error: ${err instanceof Error ? err.message : 'unknown'}` });
    }
  }

  return new Response(JSON.stringify({ synced: results.length, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
