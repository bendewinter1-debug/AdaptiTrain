import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getWorkoutWithExercises, updateWorkout, updateExercise } from '../services/supabase';
import ExerciseItem from '../components/ExerciseItem';
import type { Workout, Exercise } from '../types';
import { useWeightUnit } from '../hooks/useWeightUnit';
import { colors, fontSize as fs, radius, spacing, fontWeight } from '../theme';

interface Props {
  workoutId: string;
  onComplete: () => void;
  onBack: () => void;
  onMinimize: () => void;
}

export default function WorkoutScreen({ workoutId, onComplete, onBack, onMinimize }: Props) {
  const [workout, setWorkout] = useState<Workout | null>(null);
  const { unit, toggle: toggleUnit } = useWeightUnit();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [restTimer, setRestTimer] = useState(0);
  const [restActive, setRestActive] = useState(false);
  const [showRPEModal, setShowRPEModal] = useState(false);
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadWorkout();
    intervalRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (restRef.current) clearInterval(restRef.current);
    };
  }, [workoutId]);

  async function loadWorkout() {
    const data = await getWorkoutWithExercises(workoutId);
    setWorkout(data);
    setExercises(data.exercises ?? []);
  }

  function startRestTimer(seconds: number) {
    if (restRef.current) clearInterval(restRef.current);
    setRestTimer(seconds);
    setRestActive(true);
    restRef.current = setInterval(() => {
      setRestTimer((t) => {
        if (t <= 1) {
          setRestActive(false);
          if (restRef.current) clearInterval(restRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  async function handleExerciseUpdate(exerciseId: string, updates: Partial<Exercise>) {
    setExercises((prev) => prev.map((ex) => (ex.id === exerciseId ? { ...ex, ...updates } : ex)));
    await updateExercise(exerciseId, updates);
  }

  async function submitWorkout() {
    const durationMinutes = Math.round(elapsed / 60);
    await updateWorkout(workoutId, {
      completed: true,
      rpe,
      notes,
      duration_minutes: durationMinutes,
    });
    setShowRPEModal(false);
    onComplete();
  }

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  if (!workout) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading workout...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerSideBtn}>
          <Ionicons name="close" size={20} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.workoutType}>{workout.workout_type}</Text>
          <Text style={styles.elapsed}>{formatTime(elapsed)}</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.unitToggle} onPress={toggleUnit} activeOpacity={0.7}>
            <Text style={styles.unitToggleText}>{unit === 'kg' ? 'kg' : 'lbs'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.minimizeBtn} onPress={onMinimize} activeOpacity={0.7}>
            <Ionicons name="chevron-down-circle-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.finishBtn} onPress={() => setShowRPEModal(true)}>
            <Text style={styles.finishBtnText}>Finish</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Rest Timer Banner */}
      {restActive && (
        <View style={styles.restBanner}>
          <Text style={styles.restBannerText}>Rest — {formatTime(restTimer)}</Text>
          <TouchableOpacity onPress={() => { setRestActive(false); if (restRef.current) clearInterval(restRef.current); }}>
            <Text style={styles.restSkip}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Exercises */}
      <ScrollView contentContainerStyle={styles.scroll}>
        {workout.ai_reasoning && (
          <View style={styles.reasoningCard}>
            <Text style={styles.reasoningTitle}>Why this workout?</Text>
            <Text style={styles.reasoningText}>{workout.ai_reasoning}</Text>
          </View>
        )}
        {exercises.map((ex, idx) => (
          <ExerciseItem
            key={ex.id}
            exercise={ex}
            index={idx}
            onUpdate={(updates) => handleExerciseUpdate(ex.id, updates)}
            onStartRest={(seconds) => startRestTimer(seconds)}
          />
        ))}
      </ScrollView>

      {/* RPE Modal */}
      <Modal visible={showRPEModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>How was that workout?</Text>
            <Text style={styles.modalSubtitle}>Rate your effort (1 = very easy, 10 = maximum effort)</Text>
            <View style={styles.rpeRow}>
              {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                <TouchableOpacity key={n} style={[styles.rpeBtn, rpe === n && styles.rpeBtnSelected]} onPress={() => setRpe(n)}>
                  <Text style={[styles.rpeBtnText, rpe === n && styles.rpeBtnTextSelected]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.notesInput}
              placeholder="Any notes? (optional)"
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
            <TouchableOpacity style={styles.submitBtn} onPress={submitWorkout}>
              <Text style={styles.submitBtnText}>Save Workout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  loadingText: { color: colors.textSecondary, fontSize: fs.xl },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[16],
    paddingTop: spacing[56],
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerSideBtn: { width: 36, alignItems: 'center' },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing[8] },
  workoutType: { color: colors.textPrimary, fontSize: fs.md, fontWeight: fontWeight.semibold },
  elapsed: { color: colors.primary, fontSize: fs['4xl'], fontWeight: fontWeight.extrabold, fontVariant: ['tabular-nums'] },
  unitToggle: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[6],
  },
  unitToggleText: { color: colors.textSecondary, fontSize: fs.base, fontWeight: fontWeight.bold },
  minimizeBtn: { padding: spacing[6] },
  finishBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: spacing[16], paddingVertical: spacing[8] },
  finishBtnText: { color: colors.textPrimary, fontWeight: fontWeight.bold, fontSize: fs.lg },
  restBanner: {
    backgroundColor: colors.restBlue,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing[12],
    paddingHorizontal: spacing[20],
  },
  restBannerText: { color: colors.restBlueLight, fontSize: fs.xl, fontWeight: fontWeight.bold },
  restSkip: { color: colors.textMuted, fontSize: fs.md },
  scroll: { padding: spacing[16], paddingBottom: spacing[40] },
  reasoningCard: { backgroundColor: colors.surface, borderRadius: radius['2xl'], padding: spacing[16], marginBottom: spacing[16] },
  reasoningTitle: { color: colors.primary, fontSize: fs.base, fontWeight: fontWeight.bold, marginBottom: spacing[6] },
  reasoningText: { color: colors.textSecondary, fontSize: fs.md, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius['5xl'], borderTopRightRadius: radius['5xl'], padding: spacing[24] },
  modalTitle: { fontSize: fs['4xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing[8] },
  modalSubtitle: { fontSize: fs.md, color: colors.textMuted, marginBottom: spacing[20] },
  rpeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[8], marginBottom: spacing[20] },
  rpeBtn: { width: 44, height: 44, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  rpeBtnSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  rpeBtnText: { color: colors.textSecondary, fontSize: fs.lg, fontWeight: fontWeight.bold },
  rpeBtnTextSelected: { color: colors.textPrimary },
  notesInput: { backgroundColor: colors.background, borderRadius: radius.xl, padding: spacing[14], color: colors.textPrimary, fontSize: fs.lg, borderWidth: 1, borderColor: colors.border, height: 80, marginBottom: spacing[16] },
  submitBtn: { backgroundColor: colors.primary, borderRadius: radius['2xl'], padding: spacing[18], alignItems: 'center' },
  submitBtnText: { color: colors.textPrimary, fontSize: fs.xl, fontWeight: fontWeight.bold },
});
