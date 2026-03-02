import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { getWorkoutWithExercises, updateWorkout, updateExercise } from '../services/supabase';
import ExerciseItem from '../components/ExerciseItem';
import type { Workout, Exercise } from '../types';
import { useWeightUnit } from '../hooks/useWeightUnit';

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

  async function handleFinish() {
    setShowRPEModal(true);
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
          <Text style={styles.backBtn}>✕</Text>
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
            <Text style={styles.minimizeBtnText}>⤵</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}>
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
              placeholderTextColor="#64748b"
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
  container: { flex: 1, backgroundColor: '#0f172a' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  loadingText: { color: '#94a3b8', fontSize: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 56,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerSideBtn: { width: 36, alignItems: 'center' },
  backBtn: { color: '#6366f1', fontSize: 16, fontWeight: '600' },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  workoutType: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },
  elapsed: { color: '#6366f1', fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  unitToggle: { backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 10, paddingVertical: 6 },
  unitToggleText: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  minimizeBtn: { padding: 6 },
  minimizeBtnText: { color: '#64748b', fontSize: 18 },
  finishBtn: { backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  finishBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  restBanner: {
    backgroundColor: '#0f4c75',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 20,
  },
  restBannerText: { color: '#bae6fd', fontSize: 16, fontWeight: '700' },
  restSkip: { color: '#64748b', fontSize: 14 },
  scroll: { padding: 16, paddingBottom: 40 },
  reasoningCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, marginBottom: 16 },
  reasoningTitle: { color: '#6366f1', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  reasoningText: { color: '#94a3b8', fontSize: 14, lineHeight: 20 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#f8fafc', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  rpeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  rpeBtn: { width: 44, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#334155', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' },
  rpeBtnSelected: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  rpeBtnText: { color: '#94a3b8', fontSize: 15, fontWeight: '700' },
  rpeBtnTextSelected: { color: '#fff' },
  notesInput: { backgroundColor: '#0f172a', borderRadius: 12, padding: 14, color: '#f8fafc', fontSize: 15, borderWidth: 1, borderColor: '#334155', height: 80, marginBottom: 16 },
  submitBtn: { backgroundColor: '#6366f1', borderRadius: 14, padding: 18, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
