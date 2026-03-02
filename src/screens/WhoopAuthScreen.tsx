import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { startWhoopOAuth, saveWhoopTokens, syncWhoopData, getRedirectUri } from '../services/whoopApi';
import { updateUserProfile } from '../services/supabase';
import { colors, fontSize as fs, radius, spacing, fontWeight } from '../theme';

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
      await updateUserProfile(userId, {
        whoop_access_token: null,
        whoop_refresh_token: null,
        whoop_token_expires_at: null,
      });

      const tokens = await startWhoopOAuth();
      await saveWhoopTokens(userId, tokens.access_token, tokens.refresh_token, tokens.expires_in);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`whoop_ever_connected_${userId}`, 'true');
      }
      await syncWhoopData(userId, tokens.access_token);
      onConnected();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect Whoop.';
      if (msg === 'cancelled') {
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
        <Ionicons name="watch-outline" size={64} color={colors.primary} />
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
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.success} style={{ marginRight: spacing[10] }} />
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
        <ActivityIndicator color={colors.primary} size="large" style={{ marginTop: spacing[24] }} />
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
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing[24], justifyContent: 'center', flexGrow: 1, paddingBottom: spacing[40] },
  iconContainer: { alignItems: 'center', marginBottom: spacing[24] },
  title: { fontSize: fs['7xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing[12] },
  subtitle: { fontSize: fs.lg, color: colors.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: spacing[32] },
  benefitsList: { marginBottom: 28 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing[12] },
  benefitText: { color: colors.textLight, fontSize: fs.lg, flex: 1 },
  instructionBox: {
    backgroundColor: colors.warningDark,
    borderRadius: radius.lg,
    padding: spacing[12],
    marginBottom: spacing[20],
    borderLeftWidth: 3,
    borderLeftColor: colors.warningBorder,
  },
  instructionTitle: { color: colors.warningText, fontSize: fs.base, fontWeight: fontWeight.bold, marginBottom: spacing[4] },
  instructionText: { color: colors.warningDetail, fontSize: fs.base, lineHeight: 20 },
  instructionBold: { color: colors.warningText, fontWeight: fontWeight.bold },
  errorBox: {
    backgroundColor: colors.errorDeeper,
    borderRadius: radius.xl,
    padding: spacing[14],
    marginBottom: spacing[16],
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  errorTitle: { color: colors.error, fontSize: fs.base, fontWeight: fontWeight.extrabold, marginBottom: spacing[6] },
  errorText: { color: colors.errorLighter, fontSize: fs.base, lineHeight: 19, marginBottom: spacing[10] },
  errorHelp: { borderTopWidth: 1, borderTopColor: '#7f1d1d', paddingTop: spacing[10], gap: spacing[6] - 1 },
  errorHelpTitle: { color: colors.errorLight, fontSize: fs.sm, fontWeight: fontWeight.bold, marginBottom: spacing[4] },
  errorHelpItem: { color: colors.errorLighter, fontSize: fs.sm, lineHeight: 17 },
  errorHelpMono: { color: colors.orange, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: fs.xs },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius['2xl'], padding: spacing[18], alignItems: 'center', marginBottom: spacing[12] },
  primaryBtnText: { color: colors.textPrimary, fontSize: fs.xl, fontWeight: fontWeight.bold },
  skipBtn: { alignItems: 'center', padding: spacing[12] },
  skipText: { color: colors.textMuted, fontSize: fs.lg },
});
