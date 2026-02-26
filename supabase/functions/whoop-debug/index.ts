const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHOOP_API_URL = 'https://api.prod.whoop.com/developer/v1';

async function get(path: string, token: string) {
  const r = await fetch(`${WHOOP_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let body: unknown;
  const text = await r.text();
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // Get first user with a token
  const usersRes = await fetch(
    `${supabaseUrl}/rest/v1/users?whoop_access_token=not.is.null&select=id,whoop_access_token&limit=1`,
    { headers },
  );
  const users = await usersRes.json();
  if (!users?.length) return new Response(JSON.stringify({ error: 'no users with token' }), { headers: corsHeaders });

  const token = users[0].whoop_access_token;

  // Decode JWT payload to see what scopes it actually contains
  let tokenPayload: Record<string, unknown> = {};
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(padded.padEnd(padded.length + (4 - padded.length % 4) % 4, '='));
      tokenPayload = JSON.parse(decoded);
    }
  } catch { tokenPayload = { error: 'could not decode' }; }

  const cycles         = await get('/cycle?limit=3', token);
  const sleepList      = await get('/activity/sleep?limit=3', token);
  const recoveryDirect = await get('/recovery?limit=3', token);
  const profile        = await get('/user/profile/basic', token);

  const recoveries: Record<string, unknown>[] = [];
  if (cycles.status === 200) {
    const recs = (cycles.body as { records?: { id: number; end: string | null }[] }).records ?? [];
    for (const c of recs) {
      const rec = await get(`/cycle/${c.id}/recovery`, token);
      recoveries.push({ cycleId: c.id, end: c.end, ...rec });
    }
  }

  return new Response(
    JSON.stringify({ tokenPayload, profile, cycles, sleepList, recoveryDirect, recoveries }, null, 2),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
