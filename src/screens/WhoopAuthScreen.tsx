import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { startWhoopOAuth, saveWhoopTokens, syncWhoopData, getRedirectUri } from '../services/whoopApi';
import { updateUserProfile } from '../services/supabase';

interface Props {
  userId: string;
  onConnected: () => void;
  onSkip: () => void;
}

export default function WhoopAuthScreen({ userId, onConnected, onSkip }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    setError(null);
    setLoading(true);
    try {
      // Clear any stale token first so we start completely fresh
      await updateUserProfile(userId, {
        whoop_access_token: null,
        whoop_refresh_token: null,
        whoop_token_expires_at: null,
      });

      const tokens = await startWhoopOAuth();
      await saveWhoopTokens(userId, tokens.access_token, tokens.refresh_token, tokens.expires_in);
      // Mark as ever-connected so the modal doesn't auto-show if token later expires
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`whoop_ever_connected_${userId}`, 'true');
      }
      await syncWhoopData(userId, tokens.access_token);
      onConnected();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect Whoop.';
      if (msg === 'cancelled') {
        // User closed popup — just show button again, no error
        setError(null);
      } else if (msg === 'WHOOP_MISSING_SCOPES' || msg.includes('missing_scopes') || msg.includes('Missing scopes')) {
        setError('Connected, but Whoop didn\'t grant all required permissions. Please tap "Connect" again and make sure to approve all permissions on the Whoop authorisation screen.');
      } else if (msg === 'WHOOP_UNAUTHORIZED') {
        setError('Whoop session expired. Please tap "Connect" again to re-authorise.');
      } else if (msg.startsWith('WHOOP_TOKEN_ERROR:')) {
        const detail = msg.replace('WHOOP_TOKEN_ERROR:', '');
        if (detail.toLowerCase().includes('redirect_uri') || detail.toLowerCase().includes('redirect uri')) {
          setError(`Redirect URI mismatch — "${window.location.origin}/" must be added to your Whoop app's allowed redirect URIs in the Whoop developer portal. Current error: ${detail}`);
        } else if (detail.toLowerCase().includes('invalid_client') || detail.toLowerCase().includes('client_secret')) {
          setError(`Whoop credentials error — make sure WHOOP_CLIENT_SECRET is set in your Supabase edge function secrets. Detail: ${detail}`);
        } else {
          setError(`Whoop auth error: ${detail}`);
        }
      } else if (msg.includes('Token exchange failed')) {
        setError('Could not complete Whoop authorisation — the token exchange failed. Check that your Supabase edge function is deployed and WHOOP_CLIENT_SECRET is set.');
      } else if (msg.includes('Popup blocked')) {
        setError('Popup was blocked. Please allow popups for this site and try again.');
      } else if (msg.includes('OAuth state mismatch')) {
        setError('Security check failed — please try connecting again.');
      } else {
        setError(`Could not connect to Whoop: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>⌚</Text>
      </View>
      <Text style={styles.title}>Connect Whoop</Text>
      <Text style={styles.subtitle}>
        AdaptiTrain uses your Whoop recovery, sleep and HRV to build the perfect workout for how your body feels today.
      </Text>

      <View style={styles.benefitsList}>
        {[
          'Personalised intensity based on daily recovery',
          'Sleep quality affects workout complexity',
          'HRV-driven progressive overload',
          'Syncs automatically each session',
        ].map((b) => (
          <View key={b} style={styles.benefit}>
            <Text style={styles.benefitCheck}>✓</Text>
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}
      </View>

      <View style={styles.instructionBox}>
        <Text style={styles.instructionTitle}>⚠️ Important</Text>
        <Text style={styles.instructionText}>
          When the Whoop authorisation screen opens, make sure to <Text style={styles.instructionBold}>approve all permissions</Text> — including Recovery, Sleep and Workout data.
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>⚠️ Connection failed</Text>
          <Text style={styles.errorText}>{error}</Text>
          <View style={styles.errorHelp}>
            <Text style={styles.errorHelpTitle}>Things to check:</Text>
            <Text style={styles.errorHelpItem}>1. Redirect URI <Text style={styles.errorHelpMono}>{getRedirectUri()}</Text> is added in the Whoop developer portal</Text>
            <Text style={styles.errorHelpItem}>2. <Text style={styles.errorHelpMono}>WHOOP_CLIENT_SECRET</Text> is set in Supabase → Edge Functions → Secrets</Text>
            <Text style={styles.errorHelpItem}>3. Supabase edge function <Text style={styles.errorHelpMono}>whoop-token-exchange</Text> is deployed</Text>
          </View>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color="#6366f1" size="large" style={{ marginTop: 24 }} />
      ) : (
        <>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleConnect}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>Connect Whoop Account</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => {
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(`whoop_skipped_${userId}`, 'true');
              }
              onSkip();
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.skipText}>Skip — I don't have Whoop</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 24, justifyContent: 'center', flexGrow: 1, paddingBottom: 40 },
  iconContainer: { alignItems: 'center', marginBottom: 24 },
  icon: { fontSize: 64 },
  title: { fontSize: 30, fontWeight: '800', color: '#f8fafc', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 15, color: '#94a3b8', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  benefitsList: { marginBottom: 28 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  benefitCheck: { color: '#22c55e', fontSize: 16, fontWeight: '700', marginRight: 12, marginTop: 1 },
  benefitText: { color: '#cbd5e1', fontSize: 15, flex: 1 },
  instructionBox: {
    backgroundColor: '#1c1507',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: '#d97706',
  },
  instructionTitle: { color: '#fbbf24', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  instructionText: { color: '#92400e', fontSize: 13, lineHeight: 20 },
  instructionBold: { color: '#fbbf24', fontWeight: '700' },
  errorBox: {
    backgroundColor: '#2d1515',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  errorTitle: { color: '#ef4444', fontSize: 13, fontWeight: '800', marginBottom: 6 },
  errorText: { color: '#fca5a5', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  errorHelp: { borderTopWidth: 1, borderTopColor: '#7f1d1d', paddingTop: 10, gap: 5 },
  errorHelpTitle: { color: '#f87171', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  errorHelpItem: { color: '#fca5a5', fontSize: 12, lineHeight: 17 },
  errorHelpMono: { color: '#fb923c', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11 },
  primaryBtn: { backgroundColor: '#6366f1', borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', padding: 12 },
  skipText: { color: '#64748b', fontSize: 15 },
});
