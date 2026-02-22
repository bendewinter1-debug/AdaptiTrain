// Supabase Edge Function: sync-whoop
// Schedule this via Supabase cron (pg_cron) to run 3x daily:
// e.g. "0 7,13,20 * * *" (7am, 1pm, 8pm UTC)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHOOP_BASE_URL = 'https://api.whoop.com';
const WHOOP_CLIENT_ID = 'ea7da3b6-fd0c-49ec-8763-9cf9ffdf226e';
const WHOOP_CLIENT_SECRET = Deno.env.get('WHOOP_CLIENT_SECRET') ?? '';

async function refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: WHOOP_CLIENT_ID,
    client_secret: WHOOP_CLIENT_SECRET,
  });

  const res = await fetch(`${WHOOP_BASE_URL}/oauth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  return res.json();
}

async function fetchWithAuth(path: string, token: string) {
  const res = await fetch(`${WHOOP_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

      // Fetch data
      const [recoveryData, sleepData, cycleData] = await Promise.allSettled([
        fetchWithAuth('/v1/recovery?limit=1', accessToken),
        fetchWithAuth('/v1/activity/sleep?limit=1', accessToken),
        fetchWithAuth('/v1/cycle?limit=1', accessToken),
      ]);

      const recovery = recoveryData.status === 'fulfilled' ? recoveryData.value?.records?.[0]?.score : null;
      const sleep = sleepData.status === 'fulfilled' ? sleepData.value?.records?.[0]?.score : null;
      const cycle = cycleData.status === 'fulfilled' ? cycleData.value?.records?.[0]?.score : null;

      const record = {
        user_id: user.id,
        date: today,
        recovery_score: recovery?.recovery_score ?? null,
        sleep_score: sleep?.sleep_performance_percentage ?? null,
        hrv_rmssd: recovery?.hrv_rmssd_milli ?? null,
        resting_heart_rate: recovery?.resting_heart_rate ?? null,
        strain: cycle?.strain ?? null,
        synced_at: new Date().toISOString(),
      };

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
