import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { useWhoopData } from '../hooks/useWhoopData';
import { useWorkoutGeneration } from '../hooks/useWorkoutGeneration';
import { getUserWorkouts } from '../services/supabase';
import RecoveryScore from '../components/RecoveryScore';
import WorkoutCard from '../components/WorkoutCard';
import type { Workout } from '../types';

interface Props {
  userId: string;
  onStartWorkout: (workoutId: string) => void;
}

export default function HomeScreen({ userId, onStartWorkout }: Props) {
  const { latestData, syncing, lastSynced, sync } = useWhoopData(userId);
  const { generatedWorkout, savedWorkoutId, loading: generating, generate } = useWorkoutGeneration(userId);
  const [weekWorkouts, setWeekWorkouts] = useState(0);
  const [streak, setStreak] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadStats();
  }, [userId]);

  async function loadStats() {
    try {
      const workouts = (await getUserWorkouts(userId, 30)) as Workout[];
      const completed = workouts.filter((w) => w.completed);

      // Workouts this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const thisWeek = completed.filter((w) => new Date(w.date) >= weekAgo);
      setWeekWorkouts(thisWeek.length);

      // Current streak (consecutive days)
      let s = 0;
      const today = new Date();
      for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const hadWorkout = completed.some((w) => w.date.startsWith(dateStr));
        if (hadWorkout) s++;
        else if (i > 0) break;
      }
      setStreak(s);
    } catch {}
  }

  async function onRefresh() {
    setRefreshing(true);
    await sync();
    await loadStats();
    setRefreshing(false);
  }

  const recovery = latestData?.recovery_score;
  const recoveryColor = recovery == null ? '#64748b' : recovery >= 67 ? '#22c55e' : recovery >= 34 ? '#eab308' : '#ef4444';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Good {getTimeOfDay()},</Text>
        <Text style={styles.appName}>AdaptiTrain</Text>
      </View>

      {/* Recovery Score */}
      <View style={styles.recoveryCard}>
        <RecoveryScore score={recovery ?? null} />
        <View style={styles.recoveryMeta}>
          {latestData?.hrv_rmssd && (
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>{Math.round(latestData.hrv_rmssd)}ms</Text>
              <Text style={styles.metaLabel}>HRV</Text>
            </View>
          )}
          {latestData?.resting_heart_rate && (
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>{latestData.resting_heart_rate}</Text>
              <Text style={styles.metaLabel}>Resting HR</Text>
            </View>
          )}
          {latestData?.sleep_score && (
            <View style={styles.metaItem}>
              <Text style={styles.metaValue}>{latestData.sleep_score}%</Text>
              <Text style={styles.metaLabel}>Sleep</Text>
            </View>
          )}
        </View>
        <View style={styles.syncRow}>
          <Text style={styles.syncTime}>
            {syncing ? 'Syncing...' : lastSynced ? `Synced ${formatRelative(lastSynced)}` : 'Not synced'}
          </Text>
          <TouchableOpacity onPress={sync} disabled={syncing} style={styles.syncBtn}>
            <Text style={styles.syncBtnText}>↻ Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{weekWorkouts}</Text>
          <Text style={styles.statLabel}>This Week</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{streak}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
      </View>

      {/* Workout section */}
      <Text style={styles.sectionTitle}>Today's Workout</Text>

      {generatedWorkout ? (
        <>
          <WorkoutCard workout={generatedWorkout} recoveryScore={recovery ?? 50} />
          {savedWorkoutId && (
            <TouchableOpacity style={styles.startBtn} onPress={() => onStartWorkout(savedWorkoutId)}>
              <Text style={styles.startBtnText}>Start Workout →</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.regenBtn} onPress={generate} disabled={generating}>
            <Text style={styles.regenBtnText}>{generating ? 'Generating...' : '↺ Generate New Workout'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.emptyWorkout}>
          <Text style={styles.emptyIcon}>🏋️</Text>
          <Text style={styles.emptyText}>No workout generated yet</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={generate} disabled={generating}>
            <Text style={styles.primaryBtnText}>{generating ? 'Generating...' : 'Generate My Workout'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function formatRelative(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 20 },
  greeting: { fontSize: 16, color: '#64748b' },
  appName: { fontSize: 28, fontWeight: '800', color: '#f8fafc' },
  recoveryCard: { backgroundColor: '#1e293b', borderRadius: 20, padding: 20, marginBottom: 16 },
  recoveryMeta: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16 },
  metaItem: { alignItems: 'center' },
  metaValue: { fontSize: 20, fontWeight: '700', color: '#f8fafc' },
  metaLabel: { fontSize: 12, color: '#64748b', marginTop: 2 },
  syncRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#334155' },
  syncTime: { color: '#64748b', fontSize: 13 },
  syncBtn: { backgroundColor: '#334155', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  syncBtnText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: '#1e293b', borderRadius: 16, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '800', color: '#f8fafc' },
  statLabel: { fontSize: 13, color: '#64748b', marginTop: 2 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#f8fafc', marginBottom: 12 },
  emptyWorkout: { backgroundColor: '#1e293b', borderRadius: 20, padding: 32, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#64748b', fontSize: 16, marginBottom: 20 },
  primaryBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 14 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  startBtn: { backgroundColor: '#6366f1', borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 12 },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  regenBtn: { alignItems: 'center', padding: 14 },
  regenBtnText: { color: '#6366f1', fontSize: 15, fontWeight: '600' },
});
