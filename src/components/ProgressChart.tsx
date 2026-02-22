import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';

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

export default function ProgressChart({ data, title, unit = '', color = '#6366f1' }: Props) {
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

  // Compute SVG-like points as percentages
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * CHART_WIDTH,
    y: CHART_HEIGHT - ((d.value - min) / range) * CHART_HEIGHT,
    value: d.value,
    date: d.date,
  }));

  const last = points[points.length - 1];
  const first = points[0];
  const trend = last.value - first.value;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.trend, { color: trend >= 0 ? '#22c55e' : '#ef4444' }]}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}{unit}
        </Text>
      </View>

      {/* Simple bar-based chart since we can't use SVG without react-native-svg */}
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

      {/* Latest value */}
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
  container: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { color: '#f8fafc', fontSize: 15, fontWeight: '700' },
  trend: { fontSize: 14, fontWeight: '700' },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT,
    gap: 4,
  },
  barContainer: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderRadius: 3, opacity: 0.85 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#334155' },
  latestLabel: { color: '#64748b', fontSize: 13 },
  latestValue: { fontSize: 18, fontWeight: '800' },
  empty: { height: 80, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#475569', fontSize: 14 },
});
