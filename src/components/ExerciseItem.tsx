import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Exercise } from '../types';
import { useWeightUnit } from '../hooks/useWeightUnit';
import { colors, fontSize as fs, radius, spacing, fontWeight } from '../theme';

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
    onStartRest(90);
  }

  return (
    <View style={[styles.container, done && styles.containerDone]}>
      <TouchableOpacity style={styles.header} onPress={() => setExpanded(!expanded)}>
        <View style={styles.headerLeft}>
          <View style={[styles.indexBadge, done && styles.indexBadgeDone]}>
            {done
              ? <Ionicons name="checkmark" size={16} color={colors.success} />
              : <Text style={styles.indexText}>{index + 1}</Text>}
          </View>
          <View>
            <Text style={[styles.name, done && styles.nameDone]}>{exercise.exercise_name}</Text>
            <Text style={styles.planned}>
              {exercise.planned_sets} sets × {exercise.planned_reps}
              {displayPlannedWeight ? ` @ ${displayPlannedWeight}` : ''}
            </Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
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
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Reps</Text>
              <TextInput
                style={styles.input}
                value={completedReps}
                onChangeText={setCompletedReps}
                placeholder={exercise.planned_reps ?? '—'}
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Weight ({unit})</Text>
              <TextInput
                style={styles.input}
                value={completedWeight}
                onChangeText={setCompletedWeight}
                placeholder={displayPlannedWeight ?? 'BW'}
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>
          </View>

          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes (optional)"
            placeholderTextColor={colors.textPlaceholder}
          />

          <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
            <Ionicons name="checkmark" size={16} color={colors.success} style={{ marginRight: spacing[6] }} />
            <Text style={styles.completeBtnText}>Complete & Start Rest</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    marginBottom: spacing[10],
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  containerDone: { opacity: 0.6, borderColor: colors.success },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing[14] },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing[12], flex: 1 },
  indexBadge: {
    width: 32,
    height: 32,
    borderRadius: radius['3xl'],
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexBadgeDone: { backgroundColor: colors.successDark },
  indexText: { color: colors.textSecondary, fontSize: fs.md, fontWeight: fontWeight.bold },
  name: { color: colors.textPrimary, fontSize: fs.lg, fontWeight: fontWeight.bold },
  nameDone: { color: colors.textMuted },
  planned: { color: colors.textMuted, fontSize: fs.base, marginTop: 2 },
  body: { padding: spacing[14], paddingTop: 0 },
  inputRow: { flexDirection: 'row', gap: spacing[8], marginBottom: spacing[10] },
  inputGroup: { flex: 1 },
  inputLabel: { color: colors.textMuted, fontSize: fs.sm, marginBottom: spacing[4] },
  input: {
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: spacing[10],
    color: colors.textPrimary,
    fontSize: fs.md,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
  },
  notesInput: {
    backgroundColor: colors.inputBg,
    borderRadius: radius.md,
    padding: spacing[10],
    color: colors.textPrimary,
    fontSize: fs.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing[10],
  },
  completeBtn: {
    backgroundColor: colors.successDark,
    borderRadius: radius.lg,
    padding: spacing[12],
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  completeBtnText: { color: colors.success, fontWeight: fontWeight.bold, fontSize: fs.md },
});
