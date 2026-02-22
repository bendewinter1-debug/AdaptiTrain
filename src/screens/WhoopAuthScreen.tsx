import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useWhoopAuthRequest, exchangeCodeForTokens, saveWhoopTokens, syncWhoopData } from '../services/whoopApi';
import * as AuthSession from 'expo-auth-session';

interface Props {
  userId: string;
  onConnected: () => void;
  onSkip: () => void;
}

export default function WhoopAuthScreen({ userId, onConnected, onSkip }: Props) {
  const { request, response, promptAsync, redirectUri } = useWhoopAuthRequest();
  const [loading, setLoading] = React.useState(false);

  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
      handleTokenExchange(code);
    } else if (response?.type === 'error') {
      Alert.alert('Whoop Auth Failed', response.error?.message ?? 'Unknown error');
    }
  }, [response]);

  async function handleTokenExchange(code: string) {
    if (!request?.codeVerifier) return;
    setLoading(true);
    try {
      const tokens = await exchangeCodeForTokens(code, redirectUri, request.codeVerifier);
      await saveWhoopTokens(userId, tokens.access_token, tokens.refresh_token, tokens.expires_in);
      await syncWhoopData(userId, tokens.access_token);
      onConnected();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to connect Whoop');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>⌚</Text>
      </View>
      <Text style={styles.title}>Connect Whoop</Text>
      <Text style={styles.subtitle}>
        AdaptiTrain uses your Whoop recovery score, sleep data, and HRV to generate the perfect workout for how your body feels today.
      </Text>

      <View style={styles.benefitsList}>
        {[
          'Personalised intensity based on recovery',
          'Sleep quality affects workout complexity',
          'HRV-driven progressive overload',
          'Auto-syncs 3x daily',
        ].map((b) => (
          <View key={b} style={styles.benefit}>
            <Text style={styles.benefitCheck}>✓</Text>
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#6366f1" size="large" style={{ marginTop: 24 }} />
      ) : (
        <>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => promptAsync()}
            disabled={!request}
          >
            <Text style={styles.primaryBtnText}>Connect Whoop Account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 24, justifyContent: 'center' },
  iconContainer: { alignItems: 'center', marginBottom: 24 },
  icon: { fontSize: 64 },
  title: { fontSize: 30, fontWeight: '800', color: '#f8fafc', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#94a3b8', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  benefitsList: { marginBottom: 32 },
  benefit: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  benefitCheck: { color: '#22c55e', fontSize: 18, fontWeight: '700', marginRight: 12 },
  benefitText: { color: '#cbd5e1', fontSize: 15 },
  primaryBtn: { backgroundColor: '#6366f1', borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', padding: 12 },
  skipText: { color: '#64748b', fontSize: 15 },
});
