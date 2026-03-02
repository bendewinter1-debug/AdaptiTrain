import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize as fs, radius, spacing, fontWeight } from '../theme';

interface DataPoint {
  date: string;
  value: number;
  label?: string;
}

interface Props {
  data: DataPoint[];
  title: string;
  unit?: string;
  color?: string;
}

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 80;
const CHART_HEIGHT = 120;

export default function ProgressChart({ data, title, unit = '', color = colors.primary }: Props) {
  if (data.length < 2) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Not enough data yet</Text>
        </View>
      </View>
    );
  }

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * CHART_WIDTH,
    y: CHART_HEIGHT - ((d.value - min) / range) * CHART_HEIGHT,
    value: d.value,
    date: d.date,
  }));

  const last = points[points.length - 1];
  const first = points[0];
  const trend = last.value - first.value;
  const trendColor = trend >= 0 ? colors.success : colors.error;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.trendRow}>
          <Ionicons
            name={trend >= 0 ? 'trending-up' : 'trending-down'}
            size={14}
            color={trendColor}
          />
          <Text style={[styles.trend, { color: trendColor }]}>
            {' '}{Math.abs(trend).toFixed(1)}{unit}
          </Text>
        </View>
      </View>

      <View style={styles.chart}>
        {points.map((p, i) => {
          const barHeight = Math.max(4, ((p.value - min) / range) * CHART_HEIGHT);
          return (
            <View key={i} style={styles.barContainer}>
              <View style={[styles.bar, { height: barHeight, backgroundColor: color }]} />
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.latestLabel}>Latest</Text>
        <Text style={[styles.latestValue, { color }]}>
          {last.value.toFixed(1)}{unit}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderRadius: radius['3xl'], padding: spacing[16], marginBottom: spacing[16] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[16] },
  title: { color: colors.textPrimary, fontSize: fs.lg, fontWeight: fontWeight.bold },
  trendRow: { flexDirection: 'row', alignItems: 'center' },
  trend: { fontSize: fs.md, fontWeight: fontWeight.bold },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    gap: spacing[4],
  },
  barContainer: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderRadius: radius.xs, opacity: 0.85 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing[10],
    paddingTop: spacing[10],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  latestLabel: { color: colors.textMuted, fontSize: fs.base },
  latestValue: { fontSize: fs['3xl'], fontWeight: fontWeight.extrabold },
  empty: { height: 80, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: colors.textPlaceholder, fontSize: fs.md },
});
