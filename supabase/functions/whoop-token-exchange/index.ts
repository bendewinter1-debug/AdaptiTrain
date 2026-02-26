// Proxies the Whoop OAuth token exchange server-side to avoid CORS issues.
// The browser cannot call api.prod.whoop.com/oauth/oauth2/token directly —
// Whoop doesn't set CORS headers on that endpoint.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WHOOP_OAUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2';
const WHOOP_CLIENT_ID = 'ea7da3b6-fd0c-49ec-8763-9cf9ffdf226e';
const WHOOP_CLIENT_SECRET = Deno.env.get('WHOOP_CLIENT_SECRET') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code, redirectUri, codeVerifier, grantType, refreshToken } = await req.json();

    let body: URLSearchParams;

    if (grantType === 'refresh_token') {
      body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET,
      });
    } else {
      // authorization_code
      body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: WHOOP_CLIENT_ID,
        client_secret: WHOOP_CLIENT_SECRET,
        code_verifier: codeVerifier,
      });
    }

    // Log what we're sending (redact secret) for debugging
    console.log('[whoop-token-exchange] grant_type:', grantType, '| redirect_uri:', redirectUri ?? 'n/a');

    const response = await fetch(`${WHOOP_OAUTH_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[whoop-token-exchange] Whoop error:', JSON.stringify(data));
      return new Response(JSON.stringify({ error: data }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log the granted scopes so we can debug scope issues
    console.log('[whoop-token-exchange] success — granted scope:', data.scope);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
