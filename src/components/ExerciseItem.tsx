import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import type { Exercise } from '../types';
import { useWeightUnit } from '../hooks/useWeightUnit';

interface Props {
  exercise: Exercise;
  index: number;
  onUpdate: (updates: Partial<Exercise>) => void;
  onStartRest: (seconds: number) => void;
}

export default function ExerciseItem({ exercise, index, onUpdate, onStartRest }: Props) {
  const [expanded, setExpanded] = useState(index === 0);
  const [completedSets, setCompletedSets] = useState(exercise.completed_sets?.toString() ?? '');
  const [completedReps, setCompletedReps] = useState(exercise.completed_reps ?? '');
  const [completedWeight, setCompletedWeight] = useState(exercise.completed_weight ?? exercise.planned_weight ?? '');
  const [notes, setNotes] = useState(exercise.notes ?? '');
  const [done, setDone] = useState(false);
  const { unit, convertWeightString } = useWeightUnit();

  // Convert planned weight for display
  const displayPlannedWeight = exercise.planned_weight ? convertWeightString(exercise.planned_weight) : null;

  function handleComplete() {
    const updates: Partial<Exercise> = {
      completed_sets: completedSets ? parseInt(completedSets, 10) : undefined,
      completed_reps: completedReps || undefined,
      completed_weight: completedWeight || undefined,
      notes: notes || undefined,
    };
    onUpdate(updates);
    setDone(true);

    // Parse rest time from string like "90 seconds"
    const restMatch = exercise.planned_reps;
    const seconds = 90; // default rest
    onStartRest(seconds);
  }

  return (
    <View style={[styles.container, done && styles.containerDone]}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(!expanded)}>
        <View style={styles.headerLeft}>
          <View style={[styles.indexBadge, done && styles.indexBadgeDone]}>
            {done ? <Text style={styles.checkmark}>✓</Text> : <Text style={styles.indexText}>{index + 1}</Text>}
          </View>
          <View>
            <Text style={[styles.name, done && styles.nameDone]}>{exercise.exercise_name}</Text>
            <Text style={styles.planned}>
              {exercise.planned_sets} sets × {exercise.planned_reps}
              {displayPlannedWeight ? ` @ ${displayPlannedWeight}` : ''}
            </Text>
          </View>
        </View>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {expanded && !done && (
        <View style={styles.body}>
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Sets Done</Text>
              <TextInput
                style={styles.input}
                value={completedSets}
                onChangeText={setCompletedSets}
                keyboardType="numeric"
                placeholder={exercise.planned_sets?.toString() ?? '—'}
                placeholderTextColor="#475569"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Reps</Text>
              <TextInput
                style={styles.input}
                value={completedReps}
                onChangeText={setCompletedReps}
                placeholder={exercise.planned_reps ?? '—'}
                placeholderTextColor="#475569"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Weight ({unit})</Text>
              <TextInput
                style={styles.input}
                value={completedWeight}
                onChangeText={setCompletedWeight}
                placeholder={displayPlannedWeight ?? 'BW'}
                placeholderTextColor="#475569"
              />
            </View>
          </View>

          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes (optional)"
            placeholderTextColor="#475569"
          />

          <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
            <Text style={styles.completeBtnText}>✓ Complete & Start Rest</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#1e293b', borderRadius: 14, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#334155' },
  containerDone: { opacity: 0.6, borderColor: '#22c55e' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  indexBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center' },
  indexBadgeDone: { backgroundColor: '#166534' },
  indexText: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
  checkmark: { color: '#22c55e', fontSize: 16, fontWeight: '700' },
  name: { color: '#f8fafc', fontSize: 15, fontWeight: '700' },
  nameDone: { color: '#64748b' },
  planned: { color: '#64748b', fontSize: 13, marginTop: 2 },
  chevron: { color: '#64748b', fontSize: 12 },
  body: { padding: 14, paddingTop: 0 },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  inputGroup: { flex: 1 },
  inputLabel: { color: '#64748b', fontSize: 12, marginBottom: 4 },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    textAlign: 'center',
  },
  notesInput: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  completeBtn: { backgroundColor: '#166534', borderRadius: 10, padding: 12, alignItems: 'center' },
  completeBtnText: { color: '#22c55e', fontWeight: '700', fontSize: 14 },
});
