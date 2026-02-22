import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { GeneratedWorkout } from '../types';
import { getRecoveryColor } from '../services/claudeApi';

interface Props {
  workout: GeneratedWorkout;
  recoveryScore: number;
}

const intensityIcon: Record<string, string> = {
  High: '🔥',
  Moderate: '⚡',
  Low: '🧘',
};

export default function WorkoutCard({ workout, recoveryScore }: Props) {
  const color = getRecoveryColor(recoveryScore);

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.workoutType}>{workout.workoutType}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: `${color}22`, borderColor: color }]}>
              <Text style={[styles.badgeText, { color }]}>
                {intensityIcon[workout.recommendedIntensity]} {workout.recommendedIntensity}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>⏱ {workout.estimatedDuration} min</Text>
            </View>
          </View>
        </View>
      </View>

      {/* AI Reasoning */}
      <View style={styles.reasoning}>
        <Text style={styles.reasoningLabel}>AI Reasoning</Text>
        <Text style={styles.reasoningText} numberOfLines={3}>{workout.aiReasoning}</Text>
      </View>

      {/* Exercise preview */}
      <Text style={styles.exercisesLabel}>{workout.exercises.length} Exercises</Text>
      {workout.exercises.slice(0, 4).map((ex, i) => (
        <View key={i} style={styles.exerciseRow}>
          <View style={styles.exerciseLeft}>
            <Text style={styles.exerciseName}>{ex.name}</Text>
            <Text style={styles.exerciseMeta}>{ex.category}</Text>
          </View>
          <View style={styles.exerciseRight}>
            <Text style={styles.exerciseSets}>{ex.sets} × {ex.reps}</Text>
            {ex.weight && <Text style={styles.exerciseWeight}>{ex.weight}</Text>}
          </View>
        </View>
      ))}
      {workout.exercises.length > 4 && (
        <Text style={styles.moreExercises}>+{workout.exercises.length - 4} more exercises</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#1e293b', borderRadius: 20, padding: 20 },
  header: { marginBottom: 14 },
  headerLeft: {},
  workoutType: { fontSize: 20, fontWeight: '800', color: '#f8fafc', marginBottom: 8 },
  badges: { flexDirection: 'row', gap: 8 },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
  },
  badgeText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
  reasoning: { backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 16 },
  reasoningLabel: { color: '#6366f1', fontSize: 11, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  reasoningText: { color: '#94a3b8', fontSize: 13, lineHeight: 18 },
  exercisesLabel: { color: '#64748b', fontSize: 13, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  exerciseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#334155' },
  exerciseLeft: { flex: 1 },
  exerciseName: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
  exerciseMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  exerciseRight: { alignItems: 'flex-end' },
  exerciseSets: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  exerciseWeight: { color: '#6366f1', fontSize: 13, marginTop: 2 },
  moreExercises: { color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 10 },
});
