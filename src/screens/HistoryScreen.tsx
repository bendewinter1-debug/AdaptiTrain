import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize as fs, radius, spacing, fontWeight } from '../theme';
import { SkeletonBox } from '../components/SkeletonBox';
import { supabase, getUserWorkouts, insertWorkout, insertExercises, updateWorkout } from '../services/supabase';
import type { Workout } from '../types';

interface Props {
  userId: string;
  onViewWorkout: (workoutId: string) => void;
}

type Filter = 'all' | 'completed' | 'pending' | 'skipped';
type TypeFilter = 'all' | 'upper' | 'lower' | 'full' | 'cardio' | 'mobility' | 'other';

// ─── Status pill shown on each card ──────────────────────────────────────────
function StatusPill({ workout, onUpdate }: {
  workout: Workout;
  onUpdate: (id: string, updates: Partial<Workout>) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function set(completed: boolean, skipped: boolean) {
    setBusy(true);
    await onUpdate(workout.id, { completed, skipped });
    setBusy(false);
  }

  if (busy) return <ActivityIndicator size="small" color={colors.primary} style={{ width: 80 }} />;

  if (workout.completed) {
    return (
      <TouchableOpacity style={pill.done} onPress={() => set(false, false)} activeOpacity={0.75}>
        <Ionicons name="checkmark" size={13} color={colors.success} />
        <Text style={pill.doneText}> Done</Text>
      </TouchableOpacity>
    );
  }
  if (workout.skipped) {
    return (
      <TouchableOpacity style={pill.skip} onPress={() => set(false, false)} activeOpacity={0.75}>
        <Ionicons name="close" size={13} color={colors.error} />
        <Text style={pill.skipText}> Skipped</Text>
      </TouchableOpacity>
    );
  }
  // Pending — show both action buttons
  return (
    <View style={pill.row}>
      <TouchableOpacity style={pill.doneBtn} onPress={() => set(true, false)} activeOpacity={0.75}>
        <Ionicons name="checkmark" size={14} color={colors.success} />
      </TouchableOpacity>
      <TouchableOpacity style={pill.skipBtn} onPress={() => set(false, true)} activeOpacity={0.75}>
        <Ionicons name="close" size={14} color={colors.error} />
      </TouchableOpacity>
    </View>
  );
}

const pill = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing[6] },
  doneBtn: { backgroundColor: colors.successDeep, borderRadius: radius.md, paddingHorizontal: spacing[10], paddingVertical: spacing[6], borderWidth: 1, borderColor: '#16a34a60', flexDirection: 'row', alignItems: 'center' },
  doneBtnText: { color: colors.success, fontSize: fs.base, fontWeight: fontWeight.bold },
  skipBtn: { backgroundColor: colors.errorDark, borderRadius: radius.md, paddingHorizontal: spacing[10], paddingVertical: spacing[6], borderWidth: 1, borderColor: '#ef444440', flexDirection: 'row', alignItems: 'center' },
  skipBtnText: { color: colors.error, fontSize: fs.base, fontWeight: fontWeight.bold },
  done: { backgroundColor: colors.successDeep, borderRadius: radius.md, paddingHorizontal: spacing[10], paddingVertical: spacing[6], borderWidth: 1, borderColor: '#16a34a60', flexDirection: 'row', alignItems: 'center' },
  doneText: { color: colors.success, fontSize: fs.sm, fontWeight: fontWeight.bold },
  skip: { backgroundColor: colors.errorDark, borderRadius: radius.md, paddingHorizontal: spacing[10], paddingVertical: spacing[6], borderWidth: 1, borderColor: '#ef444440', flexDirection: 'row', alignItems: 'center' },
  skipText: { color: colors.error, fontSize: fs.sm, fontWeight: fontWeight.bold },
});

// ─── Workout detail / log modal ───────────────────────────────────────────────
function WorkoutDetailModal({ workout, onClose, onSave }: {
  workout: Workout;
  onClose: () => void;
  onSave: (updates: Partial<Workout>) => Promise<void>;
}) {
  const [rpe, setRpe] = useState<number>(workout.rpe ?? 7);
  const [notes, setNotes] = useState(workout.notes ?? '');
  const [duration, setDuration] = useState(workout.duration_minutes?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Plain-english mode for pending workouts being marked complete
  const [plainEnglish, setPlainEnglish] = useState('');
  const isPending = !workout.completed && !workout.skipped;

  function parsePlainEnglish(text: string): { rpe: number | null; duration_minutes: number | null; notes: string } {
    const t = text.toLowerCase();
    let parsedRpe: number | null = null;
    const rpeMatch =
      t.match(/\brpe\s*:?\s*(\d+(?:\.\d+)?)\b/) ||
      t.match(/\bfelt like\s+(?:a\s+)?(\d+)\b/) ||
      t.match(/\bintensity\s*:?\s*(\d+)\b/) ||
      t.match(/\b(\d+)\s*(?:\/|out of)\s*10\b/);
    if (rpeMatch) {
      const val = parseFloat(rpeMatch[1]);
      if (val >= 1 && val <= 10) parsedRpe = Math.round(val);
    }
    let parsedDuration: number | null = null;
    const hrMatch = t.match(/\b(\d+)\s*h(?:ours?|r)?\b/);
    const minMatch = t.match(/\b(\d+)\s*m(?:in(?:utes?)?)?\b/);
    if (hrMatch || minMatch) {
      const hrs = hrMatch ? parseInt(hrMatch[1], 10) : 0;
      const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
      const total = hrs * 60 + mins;
      if (total > 0 && total < 600) parsedDuration = total;
    }
    return { rpe: parsedRpe, duration_minutes: parsedDuration, notes: text.trim() };
  }

  async function handleSave(completed: boolean, skipped: boolean) {
    setSaving(true);
    let saveRpe = completed ? rpe : undefined;
    let saveDuration = duration ? parseInt(duration, 10) : undefined;
    let saveNotes = notes || undefined;

    // If pending workout being marked complete with plain-english text, parse it
    if (completed && isPending && plainEnglish.trim()) {
      const parsed = parsePlainEnglish(plainEnglish);
      if (parsed.rpe != null) saveRpe = parsed.rpe;
      if (parsed.duration_minutes != null) saveDuration = parsed.duration_minutes;
      saveNotes = parsed.notes;
    }

    await onSave({
      completed,
      skipped,
      rpe: saveRpe,
      notes: saveNotes,
      duration_minutes: saveDuration,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(onClose, 600);
  }

  const statusLabel = workout.completed ? '✓ Completed' : workout.skipped ? '✕ Skipped' : '· Pending';
  const statusColor = workout.completed ? colors.success : workout.skipped ? colors.error : colors.warning;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={dStyles.overlay}>
        <View style={dStyles.sheet}>
          {/* Handle bar */}
          <View style={dStyles.handle} />

          {/* Header */}
          <View style={dStyles.header}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[8], marginBottom: 3 }}>
                <Text style={dStyles.title}>{workout.workout_type}</Text>
                <Text style={[dStyles.statusTag, { color: statusColor }]}>{statusLabel}</Text>
              </View>
              <Text style={dStyles.date}>{formatDate(workout.date)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={dStyles.closeBtn}>
              <Ionicons name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Stats */}
            {(workout.duration_minutes || workout.rpe || workout.recovery_score_at_generation) ? (
              <View style={dStyles.statsRow}>
                {workout.duration_minutes != null && (
                  <View style={dStyles.stat}>
                    <Text style={dStyles.statValue}>{workout.duration_minutes}</Text>
                    <Text style={dStyles.statLabel}>min</Text>
                  </View>
                )}
                {workout.rpe != null && (
                  <View style={dStyles.stat}>
                    <Text style={dStyles.statValue}>{workout.rpe}/10</Text>
                    <Text style={dStyles.statLabel}>RPE</Text>
                  </View>
                )}
                {workout.recovery_score_at_generation != null && (
                  <View style={dStyles.stat}>
                    <Text style={[dStyles.statValue, { color: recoveryColor(workout.recovery_score_at_generation) }]}>
                      {workout.recovery_score_at_generation}%
                    </Text>
                    <Text style={dStyles.statLabel}>Recovery</Text>
                  </View>
                )}
                {workout.exercises?.length ? (
                  <View style={dStyles.stat}>
                    <Text style={dStyles.statValue}>{workout.exercises.length}</Text>
                    <Text style={dStyles.statLabel}>exercises</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* AI reasoning */}
            {workout.ai_reasoning ? (
              <View style={dStyles.section}>
                <Text style={dStyles.sectionTitle}>AI Reasoning</Text>
                <Text style={dStyles.reasoningText}>{workout.ai_reasoning}</Text>
              </View>
            ) : null}

            {/* Exercises */}
            {workout.exercises && workout.exercises.length > 0 && (
              <View style={dStyles.section}>
                <Text style={dStyles.sectionTitle}>Exercises</Text>
                {workout.exercises.map((ex, i) => (
                  <View key={ex.id ?? i} style={dStyles.exRow}>
                    <View style={dStyles.exNum}>
                      <Text style={dStyles.exNumText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={dStyles.exName}>{ex.exercise_name}</Text>
                      <Text style={dStyles.exMeta}>
                        {ex.completed_sets ?? ex.planned_sets ?? '—'} sets ×{' '}
                        {ex.completed_reps ?? ex.planned_reps ?? '—'} reps
                        {(ex.completed_weight ?? ex.planned_weight)
                          ? ` @ ${ex.completed_weight ?? ex.planned_weight}`
                          : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Log / edit section */}
            {!saved ? (
              <View style={dStyles.logSection}>
                <Text style={dStyles.logTitle}>
                  {workout.completed ? 'Edit log' : workout.skipped ? 'Add a note' : 'Log this workout'}
                </Text>

                {/* Plain-english entry for pending workouts */}
                {isPending && !workout.skipped ? (
                  <>
                    <Text style={dStyles.logHint}>
                      Describe how it went — e.g. "45 min, went well, RPE 7, skipped the last set of deadlifts"
                    </Text>
                    <TextInput
                      style={dStyles.plainEnglishInput}
                      value={plainEnglish}
                      onChangeText={setPlainEnglish}
                      placeholder="How did it go? Any changes?"
                      placeholderTextColor={colors.textPlaceholder}
                      multiline
                      textAlignVertical="top"
                    />
                    <Text style={dStyles.logHintSmall}>
                      💡 Include RPE (e.g. "RPE 8") or duration (e.g. "50 min") and they'll be saved automatically
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={dStyles.logLabel}>Duration (minutes)</Text>
                    <TextInput
                      style={dStyles.input}
                      value={duration}
                      onChangeText={setDuration}
                      keyboardType="number-pad"
                      placeholder="e.g. 45"
                      placeholderTextColor={colors.textPlaceholder}
                    />

                    {/* Only show RPE if marking done */}
                    {!workout.skipped && (
                      <>
                        <Text style={dStyles.logLabel}>RPE (1–10)</Text>
                        <View style={dStyles.rpeRow}>
                          {[1,2,3,4,5,6,7,8,9,10].map(n => (
                            <TouchableOpacity
                              key={n}
                              style={[dStyles.rpeBtn, rpe === n && dStyles.rpeBtnOn]}
                              onPress={() => setRpe(n)}
                            >
                              <Text style={[dStyles.rpeBtnText, rpe === n && dStyles.rpeBtnTextOn]}>{n}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}

                    <Text style={dStyles.logLabel}>Notes</Text>
                    <TextInput
                      style={[dStyles.input, { height: 72, textAlignVertical: 'top' }]}
                      value={notes}
                      onChangeText={setNotes}
                      placeholder="What went well? What changed? Why skipped?"
                      placeholderTextColor={colors.textPlaceholder}
                      multiline
                    />
                  </>
                )}

                {/* Action buttons */}
                {saving ? (
                  <ActivityIndicator color={colors.primary} style={{ marginTop: spacing[8] }} />
                ) : (
                  <View style={dStyles.actionRow}>
                    {!workout.completed && (
                      <TouchableOpacity style={dStyles.completeBtn} onPress={() => handleSave(true, false)} activeOpacity={0.85}>
                        <Ionicons name="checkmark" size={14} color="#fff" style={{marginRight: 4}} />
                        <Text style={dStyles.completeBtnText}>Mark Complete</Text>
                      </TouchableOpacity>
                    )}
                    {workout.completed && (
                      <TouchableOpacity style={dStyles.completeBtn} onPress={() => handleSave(true, false)} activeOpacity={0.85}>
                        <Text style={dStyles.completeBtnText}>Save Changes</Text>
                      </TouchableOpacity>
                    )}
                    {!workout.skipped && !workout.completed && (
                      <TouchableOpacity style={dStyles.skipBtn} onPress={() => handleSave(false, true)} activeOpacity={0.85}>
                        <Ionicons name="close" size={14} color={colors.error} style={{marginRight: 4}} />
                        <Text style={dStyles.skipBtnText}>Didn't Do It</Text>
                      </TouchableOpacity>
                    )}
                    {(workout.completed || workout.skipped) && (
                      <TouchableOpacity style={dStyles.resetBtn} onPress={() => handleSave(false, false)} activeOpacity={0.85}>
                        <Text style={dStyles.resetBtnText}>↺ Reset to Pending</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ) : (
              <View style={dStyles.savedConfirm}>
                <Text style={dStyles.savedConfirmText}>✓ Saved</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Manual workout entry modal ───────────────────────────────────────────────
function AddWorkoutModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (data: ManualWorkout) => Promise<void>;
}) {
  const WORKOUT_TYPES = [
    'Strength - Upper Body', 'Strength - Lower Body', 'Strength - Full Body',
    'Cardio - Intervals', 'Cardio - Steady State', 'Mobility', 'Other',
  ];

  const [type, setType] = useState(WORKOUT_TYPES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [duration, setDuration] = useState('');
  const [rpe, setRpe] = useState(7);
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState<ManualExercise[]>([{ name: '', sets: '', reps: '', weight: '' }]);
  const [saving, setSaving] = useState(false);

  function addExercise() {
    setExercises(prev => [...prev, { name: '', sets: '', reps: '', weight: '' }]);
  }
  function updateEx(i: number, field: keyof ManualExercise, val: string) {
    setExercises(prev => prev.map((ex, idx) => idx === i ? { ...ex, [field]: val } : ex));
  }
  function removeEx(i: number) {
    setExercises(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    setSaving(true);
    await onSave({ type, date, duration, rpe, notes, exercises });
    setSaving(false);
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={dStyles.overlay}>
        <View style={[dStyles.sheet, { paddingBottom: 0 }]}>
          <View style={dStyles.handle} />
          <View style={dStyles.header}>
            <Text style={dStyles.title}>Log Workout</Text>
            <TouchableOpacity onPress={onClose} style={dStyles.closeBtn}>
              <Ionicons name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Type chips */}
            <Text style={dStyles.logLabel}>Workout type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing[16] }}>
              <View style={{ flexDirection: 'row', gap: spacing[8] }}>
                {WORKOUT_TYPES.map(t => (
                  <TouchableOpacity key={t} style={[dStyles.typeChip, type === t && dStyles.typeChipOn]} onPress={() => setType(t)}>
                    <Text style={[dStyles.typeChipText, type === t && dStyles.typeChipTextOn]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Date + Duration */}
            <View style={{ flexDirection: 'row', gap: spacing[12], marginBottom: spacing[16] }}>
              <View style={{ flex: 1 }}>
                <Text style={dStyles.logLabel}>Date</Text>
                <TextInput style={dStyles.input} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textPlaceholder} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={dStyles.logLabel}>Duration (min)</Text>
                <TextInput style={dStyles.input} value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholder="45" placeholderTextColor={colors.textPlaceholder} />
              </View>
            </View>

            {/* RPE */}
            <Text style={dStyles.logLabel}>RPE (1–10)</Text>
            <View style={[dStyles.rpeRow, { marginBottom: spacing[16] }]}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <TouchableOpacity key={n} style={[dStyles.rpeBtn, rpe === n && dStyles.rpeBtnOn]} onPress={() => setRpe(n)}>
                  <Text style={[dStyles.rpeBtnText, rpe === n && dStyles.rpeBtnTextOn]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Exercises */}
            <Text style={dStyles.logLabel}>Exercises</Text>
            {exercises.map((ex, i) => (
              <View key={i} style={dStyles.exInput}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing[8] }}>
                  <Text style={dStyles.exInputNum}>{i + 1}</Text>
                  <TextInput
                    style={[dStyles.input, { flex: 1, marginBottom: 0 }]}
                    value={ex.name}
                    onChangeText={v => updateEx(i, 'name', v)}
                    placeholder="Exercise name"
                    placeholderTextColor={colors.textPlaceholder}
                  />
                  {exercises.length > 1 && (
                    <TouchableOpacity onPress={() => removeEx(i)} style={{ marginLeft: spacing[8] }}>
                      <Text style={{ color: colors.error, fontSize: fs['2xl'] }}>−</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: spacing[8] }}>
                  <TextInput style={[dStyles.input, { flex: 1, marginBottom: 0 }]} value={ex.sets} onChangeText={v => updateEx(i, 'sets', v)} keyboardType="number-pad" placeholder="Sets" placeholderTextColor={colors.textPlaceholder} />
                  <TextInput style={[dStyles.input, { flex: 1, marginBottom: 0 }]} value={ex.reps} onChangeText={v => updateEx(i, 'reps', v)} placeholder="Reps" placeholderTextColor={colors.textPlaceholder} />
                  <TextInput style={[dStyles.input, { flex: 1.5, marginBottom: 0 }]} value={ex.weight} onChangeText={v => updateEx(i, 'weight', v)} placeholder="Weight" placeholderTextColor={colors.textPlaceholder} />
                </View>
              </View>
            ))}
            <TouchableOpacity style={dStyles.addExBtn} onPress={addExercise}>
              <Text style={dStyles.addExBtnText}>+ Add exercise</Text>
            </TouchableOpacity>

            {/* Notes */}
            <Text style={[dStyles.logLabel, { marginTop: spacing[16] }]}>Notes (optional)</Text>
            <TextInput
              style={[dStyles.input, { height: 72, textAlignVertical: 'top' }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="How did it go?"
              placeholderTextColor={colors.textPlaceholder}
              multiline
            />

            <TouchableOpacity style={dStyles.completeBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={dStyles.completeBtnText}>Save Workout</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

interface ManualExercise { name: string; sets: string; reps: string; weight: string; }
interface ManualWorkout { type: string; date: string; duration: string; rpe: number; notes: string; exercises: ManualExercise[]; }

// ─── Insights bar ─────────────────────────────────────────────────────────────
function InsightsBar({ workouts }: { workouts: Workout[] }) {
  const completed = workouts.filter(w => w.completed);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const weekCount = completed.filter(w => new Date(w.date).getTime() >= weekAgo).length;
  const monthCount = completed.filter(w => new Date(w.date).getTime() >= monthAgo).length;
  const rpeList = completed.filter(w => w.rpe != null).map(w => w.rpe!);
  const avgRpe = rpeList.length ? (rpeList.reduce((a, b) => a + b, 0) / rpeList.length).toFixed(1) : null;

  // Streak: consecutive days with a completed workout
  const completedDays = [...new Set(completed.map(w => w.date.split('T')[0]))].sort().reverse();
  let streak = 0;
  let cursor = new Date(); cursor.setHours(0,0,0,0);
  for (const day of completedDays) {
    const d = new Date(day); d.setHours(0,0,0,0);
    const diff = Math.round((cursor.getTime() - d.getTime()) / 86400000);
    if (diff <= 1) { streak++; cursor = d; } else break;
  }

  // Most-trained type
  const typeCounts: Record<string,number> = {};
  completed.forEach(w => { typeCounts[w.workout_type] = (typeCounts[w.workout_type] ?? 0) + 1; });
  const topType = Object.entries(typeCounts).sort((a,b) => b[1]-a[1])[0]?.[0];

  // Smart insight messages
  const insights: string[] = [];
  if (streak >= 3) insights.push(`🔥 ${streak}-day streak — keep it going!`);
  if (weekCount === 0) insights.push('No sessions this week yet — start strong today.');
  else if (weekCount >= 4) insights.push(`💪 ${weekCount} sessions this week — great consistency.`);
  if (avgRpe && parseFloat(avgRpe) >= 8.5) insights.push('Avg RPE is high — consider a lighter day soon.');
  if (avgRpe && parseFloat(avgRpe) <= 5 && completed.length > 3) insights.push('Sessions look easy — time to push intensity?');
  if (topType) insights.push(`Most trained: ${topType.replace('Strength - ', '').replace('Cardio - ', '')}`);

  return (
    <View style={iStyles.container}>
      <View style={iStyles.statsRow}>
        <View style={iStyles.stat}>
          <Text style={iStyles.statNum}>{weekCount}</Text>
          <Text style={iStyles.statLbl}>This week</Text>
        </View>
        <View style={iStyles.divider} />
        <View style={iStyles.stat}>
          <Text style={iStyles.statNum}>{monthCount}</Text>
          <Text style={iStyles.statLbl}>This month</Text>
        </View>
        <View style={iStyles.divider} />
        <View style={iStyles.stat}>
          <Text style={[iStyles.statNum, streak > 0 ? { color: colors.orange } : {}]}>{streak}d</Text>
          <Text style={iStyles.statLbl}>Streak</Text>
        </View>
        <View style={iStyles.divider} />
        <View style={iStyles.stat}>
          <Text style={iStyles.statNum}>{avgRpe ?? '—'}</Text>
          <Text style={iStyles.statLbl}>Avg RPE</Text>
        </View>
      </View>
      {insights.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={iStyles.pills}>
          {insights.map((ins, i) => (
            <View key={i} style={iStyles.pill}>
              <Text style={iStyles.pillText}>{ins}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const iStyles = StyleSheet.create({
  container: { marginHorizontal: spacing[16], marginBottom: spacing[12], backgroundColor: colors.surface, borderRadius: radius['3xl'], padding: spacing[14], borderWidth: 1, borderColor: colors.border },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing[10] },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: fs['3xl'], fontWeight: fontWeight.extrabold, color: colors.primary },
  statLbl: { fontSize: fs.xxs, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  divider: { width: 1, height: 32, backgroundColor: colors.border },
  pills: { gap: spacing[8], paddingRight: spacing[4] },
  pill: { backgroundColor: colors.background, borderRadius: radius['4xl'], paddingHorizontal: spacing[12], paddingVertical: spacing[6], borderWidth: 1, borderColor: colors.border },
  pillText: { color: colors.textSecondary, fontSize: fs.sm },
});

// ─── Main History Screen ──────────────────────────────────────────────────────
export default function HistoryScreen({ userId, onViewWorkout }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Workout | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = (await getUserWorkouts(userId, 100)) as Workout[];
      setWorkouts(data);
    } catch {} finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Re-fetch whenever this tab comes into focus (e.g. after logging from HomeScreen)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Realtime subscription — reload whenever a workout row for this user changes
  useEffect(() => {
    const channel = supabase
      .channel(`workouts:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workouts', filter: `user_id=eq.${userId}` },
        () => { load(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  async function onRefresh() { setRefreshing(true); await load(); setRefreshing(false); }

  async function handleStatusUpdate(workoutId: string, updates: Partial<Workout>) {
    setWorkouts(prev => prev.map(w => w.id === workoutId ? { ...w, ...updates } : w));
    try {
      await updateWorkout(workoutId, updates as Record<string, unknown>);
    } catch { await load(); }
  }

  async function handleDetailSave(workoutId: string, updates: Partial<Workout>) {
    await updateWorkout(workoutId, updates as Record<string, unknown>);
    setWorkouts(prev => prev.map(w => w.id === workoutId ? { ...w, ...updates } : w));
    setSelected(prev => prev ? { ...prev, ...updates } : null);
  }

  async function handleAddWorkout(data: ManualWorkout) {
    const saved = await insertWorkout({
      user_id: userId,
      workout_type: data.type,
      date: new Date(data.date).toISOString(),
      completed: true,
      skipped: false,
      rpe: data.rpe,
      notes: data.notes || null,
      duration_minutes: data.duration ? parseInt(data.duration, 10) : null,
    }) as { id: string };

    const validExercises = data.exercises.filter(ex => ex.name.trim());
    if (validExercises.length > 0) {
      await insertExercises(validExercises.map(ex => ({
        workout_id: saved.id,
        exercise_name: ex.name.trim(),
        completed_sets: ex.sets ? parseInt(ex.sets, 10) : null,
        completed_reps: ex.reps || null,
        completed_weight: ex.weight || null,
      })));
    }
    setShowAdd(false);
    await load();
  }

  const filtered = workouts.filter(w => {
    // Status filter
    if (filter === 'completed' && !w.completed) return false;
    if (filter === 'skipped' && !w.skipped) return false;
    if (filter === 'pending' && (w.completed || w.skipped)) return false;
    // Type filter
    if (typeFilter !== 'all') {
      const t = (w.workout_type ?? '').toLowerCase();
      if (typeFilter === 'upper'    && !t.includes('upper')) return false;
      if (typeFilter === 'lower'    && !t.includes('lower')) return false;
      if (typeFilter === 'full'     && !t.includes('full')) return false;
      if (typeFilter === 'cardio'   && !t.includes('cardio')) return false;
      if (typeFilter === 'mobility' && !t.includes('mobility')) return false;
      if (typeFilter === 'other'    && (
        t.includes('upper') || t.includes('lower') || t.includes('full') ||
        t.includes('cardio') || t.includes('mobility')
      )) return false;
    }
    return true;
  });

  const grouped = filtered.reduce<Record<string, Workout[]>>((acc, w) => {
    const key = new Date(w.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(w);
    return acc;
  }, {});

  const statusFilters: { label: string; value: Filter }[] = [
    { label: 'All', value: 'all' },
    { label: '✓ Done', value: 'completed' },
    { label: '· Pending', value: 'pending' },
    { label: '✕ Skipped', value: 'skipped' },
  ];

  const typeFilters: { label: string; value: TypeFilter }[] = [
    { label: 'All types', value: 'all' },
    { label: '💪 Upper', value: 'upper' },
    { label: '🦵 Lower', value: 'lower' },
    { label: '🏋️ Full body', value: 'full' },
    { label: '🏃 Cardio', value: 'cardio' },
    { label: '🧘 Mobility', value: 'mobility' },
    { label: '· Other', value: 'other' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>History</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)} activeOpacity={0.8}>
          <Text style={styles.addBtnText}>+ Log</Text>
        </TouchableOpacity>
      </View>

      {!loading && workouts.length > 0 && <InsightsBar workouts={workouts} />}

      {/* Status filter row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterScroll}>
        {statusFilters.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.chip, filter === f.value && styles.chipSelected]}
            onPress={() => setFilter(f.value)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, filter === f.value && styles.chipTextSelected]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Type filter row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={styles.filterScroll}>
        {typeFilters.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.chip, styles.chipType, typeFilter === f.value && styles.chipTypeSelected]}
            onPress={() => setTypeFilter(f.value)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, typeFilter === f.value && styles.chipTypeTextSelected]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {loading && workouts.length === 0 && (
          <View style={{ paddingTop: spacing[8] }}>
            {[0,1,2,3].map(i => (
              <SkeletonBox key={i} height={80} borderRadius={radius['2xl']} style={{ marginBottom: spacing[8] }} />
            ))}
          </View>
        )}
        {!loading && filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No workouts here yet</Text>
            <Text style={styles.emptySubtext}>
              {filter === 'all'
                ? 'Describe a workout in the Home chat, or tap "+ Log" above'
                : `No ${filter} workouts`}
            </Text>
          </View>
        )}

        {Object.entries(grouped).map(([month, monthWorkouts]) => (
          <View key={month}>
            <Text style={styles.monthLabel}>{month}</Text>
            {monthWorkouts.map(w => {
              const dotColor = w.completed ? colors.success : w.skipped ? colors.error : colors.textMuted;
              return (
                <View key={w.id} style={[styles.card, w.skipped && styles.cardSkipped]}>
                  <TouchableOpacity style={styles.cardBody} onPress={() => setSelected(w)} activeOpacity={0.7}>
                    <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardType, w.skipped ? { color: colors.textMuted } : {}]}>{w.workout_type}</Text>
                      <Text style={styles.cardDate}>{shortDate(w.date)}</Text>
                      <View style={styles.cardMeta}>
                        {w.duration_minutes ? (
                          <Text style={styles.metaTag}>
                            <Ionicons name="timer-outline" size={11} color={colors.textMuted} /> {w.duration_minutes}m
                          </Text>
                        ) : null}
                        {w.rpe ? <Text style={styles.metaTag}>RPE {w.rpe}</Text> : null}
                        {w.exercises?.length ? <Text style={styles.metaTag}>{w.exercises.length} ex</Text> : null}
                        {w.notes ? <Text style={styles.metaTag} numberOfLines={1}>{w.notes.substring(0,28)}{w.notes.length > 28 ? '…' : ''}</Text> : null}
                        {w.recovery_score_at_generation != null && (
                          <Text style={[styles.metaTag, { color: recoveryColor(w.recovery_score_at_generation) }]}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: recoveryColor(w.recovery_score_at_generation) }} />{' '}{w.recovery_score_at_generation}%
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.cardRight}>
                    <StatusPill workout={w} onUpdate={handleStatusUpdate} />
                  </View>
                </View>
              );
            })}
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>

      {selected && (
        <WorkoutDetailModal
          workout={selected}
          onClose={() => setSelected(null)}
          onSave={(updates) => handleDetailSave(selected.id, updates)}
        />
      )}
      {showAdd && (
        <AddWorkoutModal
          onClose={() => setShowAdd(false)}
          onSave={handleAddWorkout}
        />
      )}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function recoveryColor(score: number): string {
  if (score >= 67) return colors.success;
  if (score >= 34) return colors.warning;
  return colors.error;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: spacing[56] },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing[20], marginBottom: spacing[16] },
  title: { fontSize: fs['6xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  addBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: spacing[14], paddingVertical: spacing[8] },
  addBtnText: { color: '#fff', fontSize: fs.base, fontWeight: fontWeight.bold },
  filterScroll: { flexShrink: 0, flexGrow: 0 },
  filterRow: { paddingHorizontal: spacing[16], paddingBottom: spacing[8], gap: spacing[6], alignItems: 'center' },
  chip: { paddingHorizontal: spacing[12], paddingVertical: spacing[6], borderRadius: radius['3xl'], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipType: { backgroundColor: colors.background },
  chipTypeSelected: { backgroundColor: colors.indigoDark, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: fs.sm, fontWeight: fontWeight.semibold },
  chipTextSelected: { color: '#fff' },
  chipTypeTextSelected: { color: '#a5b4fc', fontWeight: fontWeight.bold },
  scroll: { paddingHorizontal: spacing[16], paddingTop: spacing[4], paddingBottom: 40 },
  monthLabel: { fontSize: fs.xs, fontWeight: fontWeight.bold, color: colors.textPlaceholder, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing[8], marginTop: spacing[8], paddingHorizontal: spacing[4] },
  card: { backgroundColor: colors.surface, borderRadius: radius['2xl'], marginBottom: spacing[8], borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  cardSkipped: { opacity: 0.6 },
  cardBody: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', padding: spacing[12] },
  cardRight: { paddingRight: spacing[12], paddingLeft: spacing[4] },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, marginRight: spacing[10], flexShrink: 0 },
  cardType: { color: colors.textPrimary, fontSize: fs.md, fontWeight: fontWeight.bold, marginBottom: 2 },
  cardDate: { color: colors.textMuted, fontSize: fs.xs, marginBottom: spacing[6] },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[6] },
  metaTag: { color: colors.textMuted, fontSize: fs.xs, backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: spacing[6], paddingVertical: 2 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: spacing[16] },
  emptyText: { color: colors.textMuted, fontSize: fs.xl, marginBottom: spacing[8] },
  emptySubtext: { color: colors.textPlaceholder, fontSize: fs.md, textAlign: 'center', paddingHorizontal: spacing[32] },
});

const dStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius['5xl'], borderTopRightRadius: radius['5xl'], maxHeight: '92%', padding: spacing[20] },
  handle: { width: 40, height: 4, backgroundColor: colors.textPlaceholder, borderRadius: radius.xs, alignSelf: 'center', marginBottom: spacing[16] },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing[16] },
  title: { fontSize: fs['2xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  statusTag: { fontSize: fs.sm, fontWeight: fontWeight.bold },
  date: { fontSize: fs.base, color: colors.textMuted, marginTop: 2 },
  closeBtn: { backgroundColor: colors.border, borderRadius: radius['4xl'], width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: colors.textSecondary, fontSize: fs.md, fontWeight: fontWeight.bold },
  statsRow: { flexDirection: 'row', gap: spacing[10], marginBottom: spacing[18], backgroundColor: colors.background, borderRadius: radius['2xl'], padding: spacing[12] },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: fs['2xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary },
  statLabel: { fontSize: fs.xs, color: colors.textMuted, marginTop: 2 },
  section: { marginBottom: spacing[18] },
  sectionTitle: { fontSize: fs.xs, fontWeight: fontWeight.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing[8] },
  reasoningText: { color: colors.textSecondary, fontSize: fs.md, lineHeight: 22 },
  exRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing[10] },
  exNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing[10], marginTop: 2 },
  exNumText: { color: colors.textSecondary, fontSize: fs.sm, fontWeight: fontWeight.bold },
  exName: { color: colors.textPrimary, fontSize: fs.md, fontWeight: fontWeight.semibold, marginBottom: 2 },
  exMeta: { color: colors.textMuted, fontSize: fs.base },
  logSection: { backgroundColor: colors.background, borderRadius: radius['3xl'], padding: spacing[16], marginTop: spacing[4], borderWidth: 1, borderColor: colors.border },
  logTitle: { fontSize: fs.md, fontWeight: fontWeight.bold, color: colors.textPrimary, marginBottom: spacing[10] },
  logHint: { color: colors.textMuted, fontSize: fs.base, marginBottom: spacing[10], lineHeight: 18 },
  logHintSmall: { color: colors.textPlaceholder, fontSize: fs.xs, marginBottom: spacing[12], lineHeight: 16 },
  plainEnglishInput: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing[14], color: colors.textPrimary, fontSize: fs.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing[8], minHeight: 80, lineHeight: 22 },
  logLabel: { fontSize: fs.xs, fontWeight: fontWeight.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing[6] },
  input: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing[12], color: colors.textPrimary, fontSize: fs.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing[14] },
  rpeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[6], marginBottom: spacing[14] },
  rpeBtn: { width: 36, height: 36, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  rpeBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  rpeBtnText: { color: colors.textMuted, fontSize: fs.base, fontWeight: fontWeight.bold },
  rpeBtnTextOn: { color: '#fff' },
  actionRow: { gap: spacing[8] },
  completeBtn: { backgroundColor: colors.successGreen, borderRadius: radius.xl, padding: spacing[14], alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  completeBtnText: { color: '#fff', fontSize: fs.md, fontWeight: fontWeight.bold },
  skipBtn: { backgroundColor: colors.errorDark, borderRadius: radius.xl, padding: spacing[12], alignItems: 'center', borderWidth: 1, borderColor: '#ef444440', flexDirection: 'row', justifyContent: 'center' },
  skipBtnText: { color: colors.error, fontSize: fs.md, fontWeight: fontWeight.semibold },
  resetBtn: { alignItems: 'center', padding: spacing[10] },
  resetBtnText: { color: colors.textMuted, fontSize: fs.base },
  savedConfirm: { alignItems: 'center', padding: spacing[20] },
  savedConfirmText: { color: colors.success, fontSize: fs.xl, fontWeight: fontWeight.bold },
  typeChip: { paddingHorizontal: spacing[12], paddingVertical: 7, borderRadius: radius['3xl'], backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  typeChipOn: { backgroundColor: colors.primaryDark, borderColor: colors.primaryDark },
  typeChipText: { color: colors.textMuted, fontSize: fs.base },
  typeChipTextOn: { color: '#fff', fontWeight: fontWeight.bold },
  exInput: { backgroundColor: colors.background, borderRadius: radius.xl, padding: spacing[12], marginBottom: spacing[10], borderWidth: 1, borderColor: colors.border },
  exInputNum: { color: colors.primary, fontSize: fs.md, fontWeight: fontWeight.extrabold, marginRight: spacing[10], width: 20 },
  addExBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing[12], alignItems: 'center', borderStyle: 'dashed', marginBottom: spacing[4] },
  addExBtnText: { color: colors.primary, fontSize: fs.md, fontWeight: fontWeight.semibold },
});
