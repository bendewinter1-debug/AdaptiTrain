import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { getUserProfile, getUserGoals, signOut, supabase } from '../services/supabase';
import type { User, Goal, FitnessGoal, ExperienceLevel } from '../types';
import { useWeightUnit, convertWeight, toStorageLbs } from '../hooks/useWeightUnit';
import { colors, fontSize as fs, radius, spacing, fontWeight } from '../theme';

interface Props {
  userId: string;
  onSignOut: () => void;
  onConnectWhoop: () => void;
}

// ─── Chip selector ────────────────────────────────────────────────────────────
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[cs.chip, active && cs.chipActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[cs.chipText, active && cs.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}
const cs = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing[14],
    paddingVertical: spacing[8],
    borderRadius: radius['4xl'],
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginRight: spacing[8],
    marginBottom: spacing[8],
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.indigoDark },
  chipText: { color: colors.textMuted, fontSize: fs.md, fontWeight: fontWeight.semibold },
  chipTextActive: { color: colors.indigoLight },
});

function ChipRow<T extends string>({
  options,
  selected,
  onSelect,
}: {
  options: { label: string; value: T }[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing[4] }}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} active={selected === o.value} onPress={() => onSelect(o.value)} />
      ))}
    </View>
  );
}

// ─── Unit toggle ──────────────────────────────────────────────────────────────
function UnitToggle({ unit, onToggle }: { unit: 'kg' | 'lbs'; onToggle: () => void }) {
  return (
    <TouchableOpacity
      style={utStyles.pill}
      onPress={onToggle}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={[utStyles.opt, unit === 'kg' && utStyles.optActive]}>kg</Text>
      <View style={utStyles.divider} />
      <Text style={[utStyles.opt, unit === 'lbs' && utStyles.optActive]}>lbs</Text>
    </TouchableOpacity>
  );
}
const utStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  opt: { paddingHorizontal: spacing[10], paddingVertical: spacing[4], fontSize: fs.base, fontWeight: fontWeight.bold, color: colors.textMuted },
  optActive: { color: colors.primary },
  divider: { width: 1, height: '100%', backgroundColor: colors.border },
});

// ─── Main component ───────────────────────────────────────────────────────────
export default function ProfileScreen({ userId, onSignOut, onConnectWhoop }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { unit, toggle } = useWeightUnit();

  const [editGoal, setEditGoal] = useState<FitnessGoal>('general');
  const [editExp, setEditExp] = useState<ExperienceLevel>('intermediate');
  const [editFreq, setEditFreq] = useState('3-4');
  const [editWeight, setEditWeight] = useState('');
  const [editTargetWeight, setEditTargetWeight] = useState('');
  const [editInjuries, setEditInjuries] = useState('');

  useEffect(() => { load(); }, [userId]);

  async function load() {
    setLoading(true);
    try {
      const [u, g] = await Promise.all([getUserProfile(userId), getUserGoals(userId)]);
      setUser(u);
      setGoals(g);
      setEditGoal((u?.fitness_goal as FitnessGoal) ?? 'general');
      setEditExp((u?.experience_level as ExperienceLevel) ?? 'intermediate');
      const freq = u?.workout_frequency;
      if (freq) {
        if (freq <= 2) setEditFreq('1-2');
        else if (freq <= 4) setEditFreq('3-4');
        else if (freq <= 6) setEditFreq('5-6');
        else setEditFreq('7');
      }
      const cw = u?.current_weight ? convertWeight(u.current_weight, unit) : null;
      const tw = u?.target_weight ? convertWeight(u.target_weight, unit) : null;
      setEditWeight(cw?.toString() ?? '');
      setEditTargetWeight(tw?.toString() ?? '');
      setEditInjuries(u?.injuries_limitations ?? '');
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const cwLbs = editWeight ? toStorageLbs(parseFloat(editWeight), unit) : null;
      const twLbs = editTargetWeight ? toStorageLbs(parseFloat(editTargetWeight), unit) : null;

      const { error: upsertErr } = await supabase.from('users').upsert(
        {
          id: userId,
          fitness_goal: editGoal,
          experience_level: editExp,
          workout_frequency: parseInt(editFreq.split('-')[0] || '3', 10),
          current_weight: cwLbs,
          target_weight: twLbs,
          injuries_limitations: editInjuries.trim() || null,
        },
        { onConflict: 'id' }
      );
      if (upsertErr) throw upsertErr;
      await load();
      setEditing(false);
    } catch (err: unknown) {
      setSaveError((err as Error)?.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setEditing(false);
    setSaveError(null);
    setEditGoal((user?.fitness_goal as FitnessGoal) ?? 'general');
    setEditExp((user?.experience_level as ExperienceLevel) ?? 'intermediate');
    const freq = user?.workout_frequency;
    if (freq) {
      if (freq <= 2) setEditFreq('1-2');
      else if (freq <= 4) setEditFreq('3-4');
      else if (freq <= 6) setEditFreq('5-6');
      else setEditFreq('7');
    }
    setEditWeight(user?.current_weight?.toString() ?? '');
    setEditTargetWeight(user?.target_weight?.toString() ?? '');
    setEditInjuries(user?.injuries_limitations ?? '');
  }

  async function handleSignOut() {
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Sign out of AdaptiTrain?')
      : true;

    if (!confirmed) return;

    try {
      await signOut();
      onSignOut();
    } catch {
      onSignOut();
    }
  }

  const whoopConnected = !!user?.whoop_access_token;

  const goalOpts: { label: string; value: FitnessGoal }[] = [
    { label: 'Lose fat', value: 'weight_loss' },
    { label: 'Build muscle', value: 'strength' },
    { label: 'Run further', value: 'endurance' },
    { label: 'General fitness', value: 'general' },
  ];
  const expOpts: { label: string; value: ExperienceLevel }[] = [
    { label: 'Beginner', value: 'beginner' },
    { label: 'Intermediate', value: 'intermediate' },
    { label: 'Advanced', value: 'advanced' },
  ];
  const freqOpts = [
    { label: '1-2 days', value: '1-2' },
    { label: '3-4 days', value: '3-4' },
    { label: '5-6 days', value: '5-6' },
    { label: 'Every day', value: '7' },
  ];

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      {/* Account info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Row label="Email" value={user?.email ?? '—'} />
        </View>
      </View>

      {/* Fitness profile */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Fitness Profile</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[12] }}>
            <UnitToggle unit={unit} onToggle={toggle} />
            {!editing ? (
              <TouchableOpacity onPress={() => setEditing(true)}>
                <Text style={styles.editBtn}>Edit</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.editActions}>
                <TouchableOpacity onPress={handleCancelEdit}>
                  <Text style={styles.cancelBtn}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSave} disabled={saving}>
                  <Text style={styles.editBtn}>{saving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {saveError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {saveError}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          {!editing ? (
            <>
              <Row label="Goal" value={formatGoal(user?.fitness_goal)} />
              <Divider />
              <Row label="Experience" value={capitalize(user?.experience_level ?? '—')} />
              <Divider />
              <Row label="Training frequency" value={`${user?.workout_frequency ?? '—'} days / week`} />
              <Divider />
              <Row
                label="Current weight"
                value={user?.current_weight ? `${convertWeight(user.current_weight, unit)} ${unit}` : '—'}
              />
              <Divider />
              <Row
                label="Target weight"
                value={user?.target_weight ? `${convertWeight(user.target_weight, unit)} ${unit}` : '—'}
              />
              {user?.injuries_limitations ? (
                <>
                  <Divider />
                  <Row label="Injuries / limitations" value={user.injuries_limitations} />
                </>
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.editLabel}>Goal</Text>
              <ChipRow options={goalOpts} selected={editGoal} onSelect={setEditGoal} />

              <Text style={[styles.editLabel, { marginTop: spacing[14] }]}>Experience level</Text>
              <ChipRow options={expOpts} selected={editExp} onSelect={setEditExp} />

              <Text style={[styles.editLabel, { marginTop: spacing[14] }]}>Training frequency</Text>
              <ChipRow options={freqOpts} selected={editFreq} onSelect={setEditFreq} />

              <View style={[styles.row, { marginTop: spacing[14], alignItems: 'center', marginBottom: spacing[8] }]}>
                <Text style={[styles.editLabel, { marginBottom: 0, flex: 1 }]}>Weight</Text>
                <UnitToggle unit={unit} onToggle={toggle} />
              </View>
              <View style={styles.row}>
                <View style={styles.flex1}>
                  <TextInput
                    style={styles.editInput}
                    placeholder="Current"
                    placeholderTextColor={colors.textPlaceholder}
                    value={editWeight}
                    onChangeText={setEditWeight}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ width: 10 }} />
                <View style={styles.flex1}>
                  <TextInput
                    style={styles.editInput}
                    placeholder="Target"
                    placeholderTextColor={colors.textPlaceholder}
                    value={editTargetWeight}
                    onChangeText={setEditTargetWeight}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <Text style={[styles.editLabel, { marginTop: spacing[14] }]}>Injuries / limitations</Text>
              <TextInput
                style={[styles.editInput, { height: 72 }]}
                placeholder="e.g. bad knees — or leave blank"
                placeholderTextColor={colors.textPlaceholder}
                value={editInjuries}
                onChangeText={setEditInjuries}
                multiline
              />
            </>
          )}
        </View>
      </View>

      {/* Goals */}
      {goals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Goals</Text>
          {goals.map((g) => (
            <View key={g.id} style={styles.goalCard}>
              <Text style={styles.goalDesc}>{g.description}</Text>
              {g.target_value != null && (
                <Text style={styles.progressText}>
                  Target: {g.target_value} {g.unit}
                  {g.current_value != null ? ` · Current: ${g.current_value} ${g.unit}` : ''}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Whoop */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Whoop</Text>
        <View style={styles.card}>
          <View style={styles.whoopRow}>
            <View style={styles.flex1}>
              <View style={styles.whoopStatusRow}>
                <View style={[styles.whoopDot, { backgroundColor: whoopConnected ? colors.success : colors.errorLight }]} />
                <Text style={[styles.whoopStatus, { color: whoopConnected ? colors.success : colors.errorLight }]}>
                  {whoopConnected ? 'Connected' : 'Not connected'}
                </Text>
              </View>
              <Text style={styles.whoopSub}>
                {whoopConnected ? 'Recovery & sleep data syncing' : 'Connect to enable AI-powered workouts'}
              </Text>
            </View>
            <TouchableOpacity style={styles.whoopBtn} onPress={onConnectWhoop} activeOpacity={0.8}>
              <Text style={styles.whoopBtnText}>{whoopConnected ? 'Reconnect' : 'Connect'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: spacing[40] }} />
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowWrap}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function formatGoal(goal?: string | null): string {
  const map: Record<string, string> = {
    weight_loss: 'Lose fat',
    strength: 'Build muscle',
    endurance: 'Run further',
    general: 'General fitness',
  };
  return goal ? (map[goal] ?? goal) : '—';
}

function capitalize(s: string): string {
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing[20], paddingTop: spacing[56], paddingBottom: 60 },
  centered: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: fs['6xl'], fontWeight: fontWeight.extrabold, color: colors.textPrimary, marginBottom: spacing[24] },

  section: { marginBottom: spacing[24] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing[10] },
  sectionTitle: { fontSize: fs.base, fontWeight: fontWeight.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  editBtn: { color: colors.primary, fontSize: fs.lg, fontWeight: fontWeight.bold },
  cancelBtn: { color: colors.textMuted, fontSize: fs.lg, fontWeight: fontWeight.semibold, marginRight: spacing[16] },
  editActions: { flexDirection: 'row', alignItems: 'center' },

  errorBox: {
    backgroundColor: colors.errorDeeper,
    borderRadius: radius.lg,
    padding: spacing[12],
    marginBottom: spacing[12],
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
  },
  errorText: { color: colors.errorLighter, fontSize: fs.base },

  card: { backgroundColor: colors.surface, borderRadius: radius['3xl'], padding: spacing[16] },

  rowWrap: { paddingVertical: spacing[6] },
  rowLabel: { fontSize: fs.sm, color: colors.textMuted, marginBottom: 2 },
  rowValue: { fontSize: fs.lg, color: colors.textPrimary, fontWeight: fontWeight.regular },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing[8] },

  editLabel: { fontSize: fs.sm, color: colors.textSecondary, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing[8] },
  editInput: {
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing[12],
    color: colors.textPrimary,
    fontSize: fs.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing[4],
  },
  row: { flexDirection: 'row' },
  flex1: { flex: 1 },

  goalCard: { backgroundColor: colors.surface, borderRadius: radius['2xl'], padding: spacing[14], marginBottom: spacing[8] },
  goalDesc: { color: colors.textPrimary, fontSize: fs.lg, fontWeight: fontWeight.semibold, marginBottom: spacing[4] },
  progressText: { color: colors.textMuted, fontSize: fs.base },

  whoopRow: { flexDirection: 'row', alignItems: 'center' },
  whoopStatusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[6], marginBottom: 2 },
  whoopDot: { width: 8, height: 8, borderRadius: 4 },
  whoopStatus: { fontSize: fs.lg, fontWeight: fontWeight.semibold },
  whoopSub: { fontSize: fs.base, color: colors.textMuted },
  whoopBtn: { backgroundColor: colors.primary, borderRadius: radius.lg, paddingHorizontal: spacing[16], paddingVertical: spacing[8] },
  whoopBtnText: { color: colors.textPrimary, fontWeight: fontWeight.bold, fontSize: fs.md },

  signOutBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing[16],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.error,
  },
  signOutText: { color: colors.error, fontSize: fs.xl, fontWeight: fontWeight.bold },
});
