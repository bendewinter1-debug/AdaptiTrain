import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  score: number | null;
}

export default function RecoveryScore({ score }: Props) {
  const color = score == null ? '#64748b' : score >= 67 ? '#22c55e' : score >= 34 ? '#eab308' : '#ef4444';
  const label = score == null ? 'No data' : score >= 67 ? 'Optimal' : score >= 34 ? 'Moderate' : 'Low Recovery';
  const emoji = score == null ? '—' : score >= 67 ? '🟢' : score >= 34 ? '🟡' : '🔴';

  return (
    <View style={styles.container}>
      <View style={styles.scoreRow}>
        <View style={[styles.scoreCircle, { borderColor: color }]}>
          <Text style={[styles.scoreNumber, { color }]}>{score ?? '—'}</Text>
          {score != null && <Text style={styles.percent}>%</Text>}
        </View>
        <View style={styles.info}>
          <Text style={styles.emoji}>{emoji}</Text>
          <Text style={[styles.label, { color }]}>{label}</Text>
          <Text style={styles.description}>
            {score == null
              ? 'Connect Whoop to see recovery'
              : score >= 67
              ? 'Ready for high intensity training'
              : score >= 34
              ? 'Moderate effort recommended'
              : 'Rest or light activity today'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  scoreCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: '#0f172a',
  },
  scoreNumber: { fontSize: 30, fontWeight: '800' },
  percent: { fontSize: 14, color: '#64748b', marginTop: 8 },
  info: { flex: 1 },
  emoji: { fontSize: 20, marginBottom: 4 },
  label: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  description: { fontSize: 13, color: '#64748b', lineHeight: 18 },
});
