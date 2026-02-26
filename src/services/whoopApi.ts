import { Platform } from 'react-native';
import { supabase, updateUserProfile } from './supabase';

const WHOOP_CLIENT_ID = 'ea7da3b6-fd0c-49ec-8763-9cf9ffdf226e';
const WHOOP_OAUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2';
const WHOOP_API_URL = 'https://api.prod.whoop.com/developer/v2';

// ─── PKCE helpers (web-native crypto, available on localhost + https) ─────────

async function generateCodeVerifier(): Promise<string> {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// ─── OAuth — manual popup flow (web) ─────────────────────────────────────────
// expo-auth-session on web is unreliable: its postMessage relay requires the
// popup to resolve through expo-auth-session's own redirect page, which breaks
// when Whoop goes directly to our app origin. We implement a direct popup +
// postMessage approach instead.

export function getRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Redirect back to the app itself — App.tsx detects ?code= and posts back to parent
    return window.location.origin + '/';
  }
  return 'adaptitrain://whoop-callback';
}

export async function startWhoopOAuth(): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();
  const redirectUri = getRedirectUri();

  // Store verifier + state so we can verify when popup returns
  sessionStorage.setItem('whoop_code_verifier', verifier);
  sessionStorage.setItem('whoop_state', state);

  const params = new URLSearchParams({
    client_id: WHOOP_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'read:recovery read:cycles read:sleep read:workout offline',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // NOTE: Do NOT add prompt=consent — it breaks Whoop's session mid-flow
    // causing NotAuthorizedException on their consent endpoint.
    // We handle stale/partial scopes by detecting WHOOP_MISSING_SCOPES after sync.
  });

  const authUrl = `${WHOOP_OAUTH_URL}/auth?${params.toString()}`;

  return new Promise((resolve, reject) => {
    // Open popup
    const width = 520;
    const height = 680;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      authUrl,
      'whoop_auth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`,
    );

    if (!popup) {
      reject(new Error('Popup blocked — please allow popups for this site.'));
      return;
    }

    // Listen for the callback message from the OAuth popup
    const handler = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data?.type) return;

      if (event.data.type === 'WHOOP_AUTH_SUCCESS') {
        window.removeEventListener('message', handler);
        clearInterval(pollTimer);
        popup.close();

        const { code, state: returnedState } = event.data;
        const storedState = sessionStorage.getItem('whoop_state');
        const storedVerifier = sessionStorage.getItem('whoop_code_verifier');
        sessionStorage.removeItem('whoop_state');
        sessionStorage.removeItem('whoop_code_verifier');

        if (returnedState !== storedState) {
          reject(new Error('OAuth state mismatch — possible CSRF attack.'));
          return;
        }

        try {
          const tokens = await exchangeCodeForTokens(code, redirectUri, storedVerifier!);
          resolve(tokens);
        } catch (err) {
          reject(err);
        }
      } else if (event.data.type === 'WHOOP_AUTH_ERROR') {
        window.removeEventListener('message', handler);
        clearInterval(pollTimer);
        popup.close();
        reject(new Error(event.data.error ?? 'Whoop authorisation failed.'));
      }
    };

    window.addEventListener('message', handler);

    // Detect if user closes popup manually
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        window.removeEventListener('message', handler);
        reject(new Error('cancelled'));
      }
    }, 500);
  });
}

// ─── Token exchange (via edge function to avoid CORS) ────────────────────────
// Use plain fetch instead of supabase.functions.invoke so we own the Response
// object and can always read the JSON body — invoke wraps errors in
// FunctionsHttpError and the body stream is already consumed by the time we
// see the error object.

const SUPABASE_URL = 'https://anshlxckmednqmptcgla.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuc2hseGNrbWVkbnFtcHRjZ2xhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MDYwNzksImV4cCI6MjA4NzM4MjA3OX0.9fZmmBxyDwA-BffxaLvZjgVcOSgpi1YpkjCSkt5Y10k';

async function callTokenExchange(body: Record<string, string>): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/whoop-token-exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    // Edge function returns { error: { error, error_description, status_code } }
    // when Whoop returns an error, or { error: string } for internal errors
    const whoopErr = data?.error;
    const detail =
      whoopErr?.error_description ??
      whoopErr?.error ??
      (typeof whoopErr === 'string' ? whoopErr : JSON.stringify(whoopErr ?? data));
    throw new Error(`WHOOP_TOKEN_ERROR:${detail}`);
  }

  return data as { access_token: string; refresh_token: string; expires_in: number };
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  return callTokenExchange({ grantType: 'authorization_code', code, redirectUri, codeVerifier });
}

export async function refreshWhoopToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  return callTokenExchange({ grantType: 'refresh_token', refreshToken });
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function whoopGet(path: string, accessToken: string) {
  const response = await fetch(`${WHOOP_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('WHOOP_UNAUTHORIZED');
    // 403 = permission denied (missing scope). 404 = no data, NOT a scope error.
    if (response.status === 403) throw new Error('WHOOP_MISSING_SCOPES');
    if (response.status === 404) return { records: [] }; // treat as empty, not an error
    throw new Error(`Whoop API error: ${response.status}`);
  }
  return response.json();
}

// ─── Data fetching ────────────────────────────────────────────────────────────

// Extract a YYYY-MM-DD date from a Whoop record using end/start/created_at fields
function whoopRecordDate(record: { end?: string; start?: string; created_at?: string }): string | null {
  const raw = record.end ?? record.start ?? record.created_at;
  if (!raw) return null;
  // Whoop timestamps are ISO strings in UTC — use the date portion as-is
  return raw.split('T')[0];
}

export async function fetchLatestRecovery(accessToken: string) {
  // v2 API: /recovery returns a list of recovery records directly (no need to look up cycle first)
  const data = await whoopGet('/recovery?limit=2', accessToken);
  const records: { score_state: string; end?: string; start?: string; created_at?: string; score?: { recovery_score?: number; hrv_rmssd_milli?: number; resting_heart_rate?: number } }[] =
    data?.records ?? [];

  // Find the most recent scored recovery
  const scored = records.find(r => r.score_state === 'SCORED');
  if (!scored) return null;

  return {
    date: whoopRecordDate(scored),
    recovery_score: scored.score?.recovery_score ?? null,
    hrv_rmssd: scored.score?.hrv_rmssd_milli ?? null,
    resting_heart_rate: scored.score?.resting_heart_rate ?? null,
  };
}

export async function fetchLatestSleep(accessToken: string) {
  // Fetch last 2 sleep records and return the most recent SCORED one
  // (the latest may still be PENDING if the user just woke up)
  const data = await whoopGet('/activity/sleep?limit=2', accessToken);
  const records: { score_state: string; nap?: boolean; end?: string; start?: string; created_at?: string; score?: { sleep_performance_percentage?: number } }[] =
    data?.records ?? [];

  // Prefer the most recent non-nap scored sleep
  const scored = records.find(r => r.score_state === 'SCORED' && !r.nap)
    ?? records.find(r => r.score_state === 'SCORED');
  if (!scored) return null;

  return {
    date: whoopRecordDate(scored),
    sleep_score: scored.score?.sleep_performance_percentage ?? null,
  };
}

export async function fetchLatestStrain(accessToken: string) {
  // v2 cycle endpoint — same shape as v1 for strain
  const data = await whoopGet('/cycle?limit=1', accessToken);
  const record = data?.records?.[0];
  if (!record) return null;

  return {
    date: whoopRecordDate(record),
    strain: record.score?.strain ?? null,
  };
}

// ─── Full sync ────────────────────────────────────────────────────────────────

export async function syncWhoopData(userId: string, accessToken: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Fetch all three endpoints — capture errors individually so one failure doesn't kill the rest
  const [recoveryResult, sleepResult, strainResult] = await Promise.allSettled([
    fetchLatestRecovery(accessToken),
    fetchLatestSleep(accessToken),
    fetchLatestStrain(accessToken),
  ]);

  // Only throw if we get an actual 403 scope error (not 404 no-data, not network errors)
  // A 403 means the token genuinely lacks permissions and must be re-issued.
  const hasScopeError = [recoveryResult, sleepResult, strainResult].some(
    r => r.status === 'rejected' && r.reason?.message === 'WHOOP_MISSING_SCOPES'
  );
  if (hasScopeError) {
    throw new Error('WHOOP_MISSING_SCOPES');
  }
  // If ALL three failed with non-scope errors (network, 5xx, etc.) surface it
  const allFailed = [recoveryResult, sleepResult, strainResult].every(r => r.status === 'rejected');
  if (allFailed) {
    const firstErr = (recoveryResult as PromiseRejectedResult).reason;
    throw firstErr instanceof Error ? firstErr : new Error('Whoop sync failed');
  }

  const recovery = recoveryResult.status === 'fulfilled' ? recoveryResult.value : null;
  const sleep = sleepResult.status === 'fulfilled' ? sleepResult.value : null;
  const strain = strainResult.status === 'fulfilled' ? strainResult.value : null;

  // Use the actual date from the Whoop record where available, falling back to today.
  // This ensures yesterday's recovery (which Whoop scores after sleep) is stored
  // against the correct date rather than always being overwritten as today.
  const recoveryDate = recovery?.date ?? today;
  const sleepDate = sleep?.date ?? today;
  const strainDate = strain?.date ?? today;

  const now = new Date().toISOString();

  // Upsert each data type against its own correct date.
  // We do three separate upserts so that recovery (yesterday) and strain (today's cycle)
  // don't clobber each other's rows.
  const upserts: Record<string, unknown>[] = [];

  // Recovery + HRV + RHR — keyed by recoveryDate
  if (recovery?.recovery_score != null || recovery?.hrv_rmssd != null || recovery?.resting_heart_rate != null) {
    const row: Record<string, unknown> = { user_id: userId, date: recoveryDate, synced_at: now };
    if (recovery.recovery_score != null) row.recovery_score = recovery.recovery_score;
    if (recovery.hrv_rmssd != null) row.hrv_rmssd = recovery.hrv_rmssd;
    if (recovery.resting_heart_rate != null) row.resting_heart_rate = recovery.resting_heart_rate;
    upserts.push(row);
  }

  // Sleep score — keyed by sleepDate
  if (sleep?.sleep_score != null) {
    const sleepRow: Record<string, unknown> = { user_id: userId, date: sleepDate, synced_at: now, sleep_score: sleep.sleep_score };
    // Merge into recovery row if same date, otherwise separate upsert
    const existing = upserts.find(u => u.date === sleepDate);
    if (existing) {
      existing.sleep_score = sleep.sleep_score;
    } else {
      upserts.push(sleepRow);
    }
  }

  // Strain — keyed by strainDate
  if (strain?.strain != null) {
    const existing = upserts.find(u => u.date === strainDate);
    if (existing) {
      existing.strain = strain.strain;
    } else {
      upserts.push({ user_id: userId, date: strainDate, synced_at: now, strain: strain.strain });
    }
  }

  // If we got nothing at all, still touch today's row so synced_at is updated
  if (upserts.length === 0) {
    upserts.push({ user_id: userId, date: today, synced_at: now });
  }

  // Upsert all rows; for existing rows, only the fields present get overwritten
  for (const row of upserts) {
    await supabase
      .from('whoop_data')
      .upsert(row, { onConflict: 'user_id,date', ignoreDuplicates: false });
  }
}

// ─── Token persistence ────────────────────────────────────────────────────────

export async function saveWhoopTokens(
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  await updateUserProfile(userId, {
    whoop_access_token: accessToken,
    whoop_refresh_token: refreshToken,
    whoop_token_expires_at: expiresAt,
  });
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const { data: user } = await supabase
    .from('users')
    .select('whoop_access_token, whoop_refresh_token, whoop_token_expires_at')
    .eq('id', userId)
    .single();

  if (!user?.whoop_access_token) return null;

  const expiresAt = user.whoop_token_expires_at ? new Date(user.whoop_token_expires_at) : null;
  const isExpired = expiresAt ? expiresAt <= new Date() : false;

  if (!isExpired) return user.whoop_access_token;

  if (!user.whoop_refresh_token) return null;

  try {
    const tokens = await refreshWhoopToken(user.whoop_refresh_token);
    await saveWhoopTokens(userId, tokens.access_token, tokens.refresh_token, tokens.expires_in);
    return tokens.access_token;
  } catch {
    return null;
  }
}
