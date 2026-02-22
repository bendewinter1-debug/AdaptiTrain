import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { getUserWorkouts } from '../services/supabase';
import type { Workout } from '../types';

interface Props {
  userId: string;
  onViewWorkout: (workoutId: string) => void;
}

type Filter = 'all' | 'strength' | 'cardio' | 'mobility';

export default function HistoryScreen({ userId, onViewWorkout }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = (await getUserWorkouts(userId, 60)) as Workout[];
      setWorkouts(data.filter((w) => w.completed));
    } catch {}
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = workouts.filter((w) => {
    if (filter === 'all') return true;
    return w.workout_type?.toLowerCase().includes(filter);
  });

  const filters: { label: string; value: Filter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Strength', value: 'strength' },
    { label: 'Cardio', value: 'cardio' },
    { label: 'Mobility', value: 'mobility' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Workout History</Text>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.chip, filter === f.value && styles.chipSelected]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.chipText, filter === f.value && styles.chipTextSelected]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {loading && <Text style={styles.emptyText}>Loading...</Text>}
        {!loading && filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No workouts yet</Text>
            <Text style={styles.emptySubtext}>Complete a workout to see it here</Text>
          </View>
        )}
        {filtered.map((workout) => (
          <TouchableOpacity key={workout.id} style={styles.workoutCard} onPress={() => onViewWorkout(workout.id)}>
            <View style={styles.cardHeader}>
              <Text style={styles.workoutType}>{workout.workout_type}</Text>
              {workout.rpe != null && (
                <View style={styles.rpeBadge}>
                  <Text style={styles.rpeText}>RPE {workout.rpe}</Text>
                </View>
              )}
            </View>
            <Text style={styles.workoutDate}>{formatDate(workout.date)}</Text>
            <View style={styles.cardMeta}>
              {workout.duration_minutes && (
                <Text style={styles.metaText}>⏱ {workout.duration_minutes} min</Text>
              )}
              {workout.recovery_score_at_generation != null && (
                <Text style={[styles.metaText, { color: recoveryColor(workout.recovery_score_at_generation) }]}>
                  ● {workout.recovery_score_at_generation}% recovery
                </Text>
              )}
              {workout.exercises && (
                <Text style={styles.metaText}>{workout.exercises.length} exercises</Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function recoveryColor(score: number): string {
  if (score >= 67) return '#22c55e';
  if (score >= 34) return '#eab308';
  return '#ef4444';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingTop: 56 },
  title: { fontSize: 28, fontWeight: '800', color: '#f8fafc', paddingHorizontal: 20, marginBottom: 16 },
  filterRow: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  chipSelected: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  chipText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  scroll: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  workoutCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  workoutType: { color: '#f8fafc', fontSize: 16, fontWeight: '700', flex: 1 },
  rpeBadge: { backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  rpeText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  workoutDate: { color: '#64748b', fontSize: 13, marginBottom: 10 },
  cardMeta: { flexDirection: 'row', gap: 16 },
  metaText: { color: '#64748b', fontSize: 13 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { color: '#64748b', fontSize: 16, marginBottom: 8 },
  emptySubtext: { color: '#475569', fontSize: 14 },
});
