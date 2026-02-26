import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, ScrollView } from 'react-native';
import type { GeneratedWorkout, GeneratedExercise } from '../types';
import { getRecoveryColor } from '../services/claudeApi';
import { suggestAlternativeExercises } from '../services/claudeApi';
import { useWeightUnit } from '../hooks/useWeightUnit';

interface Props {
  workout: GeneratedWorkout;
  recoveryScore: number | null;
  userContext?: {
    experience_level?: string;
    fitness_goal?: string;
    injuries_limitations?: string;
  };
}

const intensityIcon: Record<string, string> = {
  High: '🔥',
  Moderate: '⚡',
  Low: '🧘',
};

export default function WorkoutCard({ workout, recoveryScore, userContext = {} }: Props) {
  const color = getRecoveryColor(recoveryScore ?? 50);
  const [expanded, setExpanded] = useState(false);
  const { convertWeightString } = useWeightUnit();
  const PREVIEW_COUNT = 4;

  // ── Swap state ──────────────────────────────────────────────────────────────
  const [exercises, setExercises] = useState<GeneratedExercise[]>(workout.exercises);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [alternatives, setAlternatives] = useState<GeneratedExercise[] | null>(null);
  const [loadingSwap, setLoadingSwap] = useState(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const visibleExercises = expanded ? exercises : exercises.slice(0, PREVIEW_COUNT);
  const hiddenCount = exercises.length - PREVIEW_COUNT;

  async function handleSwapPress(index: number) {
    setSwapIndex(index);
    setAlternatives(null);
    setSwapError(null);
    setLoadingSwap(true);
    setModalVisible(true);

    try {
      const alts = await suggestAlternativeExercises(exercises[index], userContext);
      setAlternatives(alts);
    } catch {
      setSwapError('Could not fetch alternatives. Try again.');
    } finally {
      setLoadingSwap(false);
    }
  }

  function handleSelectAlternative(alt: GeneratedExercise) {
    if (swapIndex == null) return;
    const updated = [...exercises];
    updated[swapIndex] = alt;
    setExercises(updated);
    setModalVisible(false);
    setSwapIndex(null);
    setAlternatives(null);
  }

  function handleCloseModal() {
    setModalVisible(false);
    setSwapIndex(null);
    setAlternatives(null);
    setSwapError(null);
  }

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

      {/* Exercise list */}
      <Text style={styles.exercisesLabel}>{exercises.length} Exercises</Text>
      {visibleExercises.map((ex, i) => (
        <View key={i} style={styles.exerciseRow}>
          <View style={styles.exerciseLeft}>
            <Text style={styles.exerciseName}>{ex.name}</Text>
            <Text style={styles.exerciseMeta}>{ex.category}</Text>
          </View>
          <View style={styles.exerciseRight}>
            <Text style={styles.exerciseSets}>{ex.sets} × {ex.reps}</Text>
            {ex.weight && <Text style={styles.exerciseWeight}>{convertWeightString(ex.weight)}</Text>}
            <TouchableOpacity
              style={styles.swapBtn}
              onPress={() => handleSwapPress(i)}
              activeOpacity={0.7}
            >
              <Text style={styles.swapBtnText}>⇄ Swap</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {hiddenCount > 0 && (
        <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.7} style={styles.moreBtn}>
          <Text style={styles.moreBtnText}>
            {expanded ? '▲ Show less' : `▼ +${hiddenCount} more exercise${hiddenCount > 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      )}

      {/* ── Swap modal ── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseModal}
      >
        <View style={modal.overlay}>
          <View style={modal.sheet}>
            {/* Header */}
            <View style={modal.header}>
              <View style={modal.headerLeft}>
                <Text style={modal.title}>Swap Exercise</Text>
                {swapIndex != null && (
                  <Text style={modal.subtitle}>Replacing: {exercises[swapIndex]?.name}</Text>
                )}
              </View>
              <TouchableOpacity onPress={handleCloseModal} style={modal.closeBtn}>
                <Text style={modal.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            {loadingSwap && (
              <View style={modal.loadingWrap}>
                <ActivityIndicator size="large" color="#6366f1" />
                <Text style={modal.loadingText}>Finding alternatives…</Text>
              </View>
            )}

            {swapError && (
              <View style={modal.errorWrap}>
                <Text style={modal.errorText}>{swapError}</Text>
                <TouchableOpacity
                  style={modal.retryBtn}
                  onPress={() => swapIndex != null && handleSwapPress(swapIndex)}
                >
                  <Text style={modal.retryBtnText}>Try again</Text>
                </TouchableOpacity>
              </View>
            )}

            {alternatives && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={modal.sectionLabel}>Choose an alternative</Text>
                {alternatives.map((alt, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={modal.altCard}
                    onPress={() => handleSelectAlternative(alt)}
                    activeOpacity={0.8}
                  >
                    <View style={modal.altCardHeader}>
                      <View style={modal.altCardLeft}>
                        <Text style={modal.altName}>{alt.name}</Text>
                        <Text style={modal.altMeta}>{alt.category}</Text>
                      </View>
                      <View style={modal.altCardRight}>
                        <Text style={modal.altSets}>{alt.sets} × {alt.reps}</Text>
                        {alt.weight && (
                          <Text style={modal.altWeight}>{convertWeightString(alt.weight)}</Text>
                        )}
                      </View>
                    </View>
                    {alt.notes ? (
                      <Text style={modal.altNotes}>{alt.notes}</Text>
                    ) : null}
                    <View style={modal.selectBtnWrap}>
                      <Text style={modal.selectBtnText}>Use this exercise →</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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
  exerciseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#334155' },
  exerciseLeft: { flex: 1 },
  exerciseName: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
  exerciseMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  exerciseRight: { alignItems: 'flex-end', gap: 4 },
  exerciseSets: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  exerciseWeight: { color: '#6366f1', fontSize: 13 },
  swapBtn: { marginTop: 2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  swapBtnText: { color: '#64748b', fontSize: 11, fontWeight: '700' },
  moreBtn: { alignItems: 'center', paddingVertical: 10, marginTop: 2, borderTopWidth: 1, borderTopColor: '#334155' },
  moreBtnText: { color: '#6366f1', fontSize: 13, fontWeight: '700' },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  headerLeft: { flex: 1 },
  title: { color: '#f8fafc', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: '#64748b', fontSize: 13 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#334155', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  closeBtnText: { color: '#94a3b8', fontSize: 14, fontWeight: '700' },
  loadingWrap: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  loadingText: { color: '#64748b', fontSize: 14 },
  errorWrap: { alignItems: 'center', paddingVertical: 30, gap: 14 },
  errorText: { color: '#fca5a5', fontSize: 14, textAlign: 'center' },
  retryBtn: { backgroundColor: '#334155', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryBtnText: { color: '#f8fafc', fontSize: 14, fontWeight: '700' },
  sectionLabel: { color: '#64748b', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  altCard: { backgroundColor: '#0f172a', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#334155' },
  altCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  altCardLeft: { flex: 1 },
  altName: { color: '#f8fafc', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  altMeta: { color: '#64748b', fontSize: 12 },
  altCardRight: { alignItems: 'flex-end' },
  altSets: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  altWeight: { color: '#6366f1', fontSize: 13, marginTop: 2 },
  altNotes: { color: '#64748b', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  selectBtnWrap: { borderTopWidth: 1, borderTopColor: '#1e293b', paddingTop: 10, marginTop: 4 },
  selectBtnText: { color: '#6366f1', fontSize: 13, fontWeight: '700', textAlign: 'right' },
});
