import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fontSize as fs, radius, spacing, fontWeight } from '../theme';

interface Props {
  score: number | null;
}

export default function RecoveryScore({ score }: Props) {
  const color = score == null ? colors.textMuted : score >= 67 ? colors.success : score >= 34 ? colors.warning : colors.error;
  const label = score == null ? 'No data' : score >= 67 ? 'Optimal' : score >= 34 ? 'Moderate' : 'Low Recovery';
  // Colored dot instead of emoji
  const dotColor = score == null ? colors.textMuted : score >= 67 ? colors.success : score >= 34 ? colors.warning : colors.error;

  return (
    <View style={styles.container}>
      <View style={styles.scoreRow}>
        <View style={[styles.scoreCircle, { borderColor: color }]}>
          <Text style={[styles.scoreNumber, { color }]}>{score ?? '—'}</Text>
          {score != null && <Text style={styles.percent}>%</Text>}
        </View>
        <View style={styles.info}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
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
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[20] },
  scoreCircle: {
    width: 90,
    height: 90,
    borderRadius: radius.circle,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: colors.background,
  },
  scoreNumber: { fontSize: fs['7xl'], fontWeight: fontWeight.extrabold },
  percent: { fontSize: fs.md, color: colors.textMuted, marginTop: spacing[8] },
  info: { flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginBottom: spacing[4] },
  label: { fontSize: fs['2xl'], fontWeight: fontWeight.bold, marginBottom: spacing[4] },
  description: { fontSize: fs.base, color: colors.textMuted, lineHeight: 18 },
});
