import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase, updateUserProfile } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const WHOOP_CLIENT_ID = 'ea7da3b6-fd0c-49ec-8763-9cf9ffdf226e';
const WHOOP_BASE_URL = 'https://api.whoop.com';

const discovery = {
  authorizationEndpoint: `${WHOOP_BASE_URL}/oauth/oauth2/auth`,
  tokenEndpoint: `${WHOOP_BASE_URL}/oauth/oauth2/token`,
};

// ─── OAuth ───────────────────────────────────────────────────────────────────

export function useWhoopAuthRequest() {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'adaptitrain' });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: WHOOP_CLIENT_ID,
      scopes: ['read:recovery', 'read:cycles', 'read:sleep', 'read:workout'],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
    },
    discovery,
  );

  return { request, response, promptAsync, redirectUri };
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: WHOOP_CLIENT_ID,
    code_verifier: codeVerifier,
  });

  const response = await fetch(`${WHOOP_BASE_URL}/oauth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  return response.json();
}

export async function refreshWhoopToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: WHOOP_CLIENT_ID,
  });

  const response = await fetch(`${WHOOP_BASE_URL}/oauth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) throw new Error('Failed to refresh Whoop token');
  return response.json();
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function whoopGet(path: string, accessToken: string) {
  const response = await fetch(`${WHOOP_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('WHOOP_UNAUTHORIZED');
    throw new Error(`Whoop API error: ${response.status}`);
  }
  return response.json();
}

// ─── Data fetching ────────────────────────────────────────────────────────────

export async function fetchWhoopProfile(accessToken: string) {
  return whoopGet('/v1/activity/sleep?limit=1', accessToken);
}

export async function fetchLatestRecovery(accessToken: string) {
  const data = await whoopGet('/v1/recovery?limit=1', accessToken);
  const record = data?.records?.[0];
  if (!record) return null;

  return {
    recovery_score: record.score?.recovery_score ?? null,
    hrv_rmssd: record.score?.hrv_rmssd_milli ?? null,
    resting_heart_rate: record.score?.resting_heart_rate ?? null,
  };
}

export async function fetchLatestSleep(accessToken: string) {
  const data = await whoopGet('/v1/activity/sleep?limit=1', accessToken);
  const record = data?.records?.[0];
  if (!record) return null;

  return {
    sleep_score: record.score?.sleep_performance_percentage ?? null,
  };
}

export async function fetchLatestStrain(accessToken: string) {
  const data = await whoopGet('/v1/cycle?limit=1', accessToken);
  const record = data?.records?.[0];
  if (!record) return null;

  return {
    strain: record.score?.strain ?? null,
  };
}

// ─── Full sync ────────────────────────────────────────────────────────────────

export async function syncWhoopData(userId: string, accessToken: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  const [recovery, sleep, strain] = await Promise.all([
    fetchLatestRecovery(accessToken).catch(() => null),
    fetchLatestSleep(accessToken).catch(() => null),
    fetchLatestStrain(accessToken).catch(() => null),
  ]);

  const record = {
    user_id: userId,
    date: today,
    recovery_score: recovery?.recovery_score ?? null,
    sleep_score: sleep?.sleep_score ?? null,
    hrv_rmssd: recovery?.hrv_rmssd ?? null,
    resting_heart_rate: recovery?.resting_heart_rate ?? null,
    strain: strain?.strain ?? null,
    synced_at: new Date().toISOString(),
  };

  await supabase.from('whoop_data').upsert(record, { onConflict: 'user_id,date' });
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
