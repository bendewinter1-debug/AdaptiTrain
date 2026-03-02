import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GeneratedWorkout, GeneratedExercise } from '../types';
import { getRecoveryColor } from '../services/claudeApi';
import { suggestAlternativeExercises } from '../services/claudeApi';
import { useWeightUnit } from '../hooks/useWeightUnit';
import { colors, fontSize as fs, radius, spacing, fontWeight } from '../theme';

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
              <Ionicons name="timer-outline" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
              <Text style={styles.badgeText}>{workout.estimatedDuration} min</Text>
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
              <Ionicons name="swap-horizontal-outline" size={11} color={colors.textMuted} style={{ marginRight: 3 }} />
              <Text style={styles.swapBtnText}>Swap</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {hiddenCount > 0 && (
        <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.7} style={styles.moreBtn}>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={13}
            color={colors.primary}
            style={{ marginRight: 4 }}
          />
          <Text style={styles.moreBtnText}>
            {expanded ? 'Show less' : `+${hiddenCount} more exercise${hiddenCount > 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Swap modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleCloseModal}
      >
        <View style={modal.overlay}>
          <View style={modal.sheet}>
            <View style={modal.header}>
              <View style={modal.headerLeft}>
                <Text style={modal.title}>Swap Exercise</Text>
                {swapIndex != null && (
                  <Text style={modal.subtitle}>Replacing: {exercises[swapIndex]?.name}</Text>
                )}
              </View>
              <TouchableOpacity onPress={handleCloseModal} style={modal.closeBtn}>
                <Ionicons name="close" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {loadingSwap && (
              <View style={modal.loadingWrap}>
                <ActivityIndicator size="large" color={colors.primary} />
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
  card: { backgroundColor: colors.surface, borderRadius: radius['4xl'], padding: spacing[20] },
  header: { marginBottom: spacing[14] },
  headerLeft: {},
  workoutType: { fontSize: fs['3xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing[8] },
  badges: { flexDirection: 'row', gap: spacing[8] },
  badge: {
    borderRadius: radius.md,
    paddingHorizontal: spacing[10],
    paddingVertical: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeText: { color: colors.textSecondary, fontSize: fs.base, fontWeight: fontWeight.semibold },
  reasoning: { backgroundColor: colors.background, borderRadius: radius.xl, padding: spacing[12], marginBottom: spacing[16] },
  reasoningLabel: { color: colors.primary, fontSize: fs.xs, fontWeight: fontWeight.bold, marginBottom: spacing[4], textTransform: 'uppercase', letterSpacing: 0.5 },
  reasoningText: { color: colors.textSecondary, fontSize: fs.base, lineHeight: 18 },
  exercisesLabel: { color: colors.textMuted, fontSize: fs.base, fontWeight: fontWeight.bold, marginBottom: spacing[10], textTransform: 'uppercase', letterSpacing: 0.5 },
  exerciseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing[10], borderTopWidth: 1, borderTopColor: colors.border },
  exerciseLeft: { flex: 1 },
  exerciseName: { color: colors.textPrimary, fontSize: fs.lg, fontWeight: fontWeight.semibold },
  exerciseMeta: { color: colors.textMuted, fontSize: fs.sm, marginTop: 2 },
  exerciseRight: { alignItems: 'flex-end', gap: spacing[4] },
  exerciseSets: { color: colors.textSecondary, fontSize: fs.md, fontWeight: fontWeight.semibold },
  exerciseWeight: { color: colors.primary, fontSize: fs.base },
  swapBtn: {
    marginTop: 2,
    paddingHorizontal: spacing[8],
    paddingVertical: 3,
    borderRadius: radius.md - 2,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  swapBtnText: { color: colors.textMuted, fontSize: fs.xs, fontWeight: fontWeight.bold },
  moreBtn: { alignItems: 'center', paddingVertical: spacing[10], marginTop: 2, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', justifyContent: 'center' },
  moreBtnText: { color: colors.primary, fontSize: fs.base, fontWeight: fontWeight.bold },
});

const modal = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius['5xl'], borderTopRightRadius: radius['5xl'], padding: spacing[24], maxHeight: '85%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing[20] },
  headerLeft: { flex: 1 },
  title: { color: colors.textPrimary, fontSize: fs['2xl'], fontWeight: fontWeight.extrabold, marginBottom: spacing[4] },
  subtitle: { color: colors.textMuted, fontSize: fs.base },
  closeBtn: { width: 32, height: 32, borderRadius: radius['3xl'], backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', marginLeft: spacing[12] },
  loadingWrap: { alignItems: 'center', paddingVertical: spacing[40], gap: spacing[16] },
  loadingText: { color: colors.textMuted, fontSize: fs.md },
  errorWrap: { alignItems: 'center', paddingVertical: spacing[32], gap: spacing[14] },
  errorText: { color: colors.errorLighter, fontSize: fs.md, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing[20], paddingVertical: spacing[10] },
  retryBtnText: { color: colors.textPrimary, fontSize: fs.md, fontWeight: fontWeight.bold },
  sectionLabel: { color: colors.textMuted, fontSize: fs.sm, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing[12] },
  altCard: { backgroundColor: colors.background, borderRadius: radius['2xl'], padding: spacing[14], marginBottom: spacing[10], borderWidth: 1, borderColor: colors.border },
  altCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing[6] },
  altCardLeft: { flex: 1 },
  altName: { color: colors.textPrimary, fontSize: fs.lg, fontWeight: fontWeight.bold, marginBottom: 2 },
  altMeta: { color: colors.textMuted, fontSize: fs.sm },
  altCardRight: { alignItems: 'flex-end' },
  altSets: { color: colors.textSecondary, fontSize: fs.md, fontWeight: fontWeight.semibold },
  altWeight: { color: colors.primary, fontSize: fs.base, marginTop: 2 },
  altNotes: { color: colors.textMuted, fontSize: fs.base, lineHeight: 18, marginBottom: spacing[10] },
  selectBtnWrap: { borderTopWidth: 1, borderTopColor: colors.surface, paddingTop: spacing[10], marginTop: spacing[4] },
  selectBtnText: { color: colors.primary, fontSize: fs.base, fontWeight: fontWeight.bold, textAlign: 'right' },
});
