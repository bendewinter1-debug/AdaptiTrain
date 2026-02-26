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

interface Props {
  userId: string;
  onSignOut: () => void;
  onConnectWhoop: () => void;
}

// ─── Chip selector (reused from onboarding) ───────────────────────────────────
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
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#334155', backgroundColor: '#1e293b', marginRight: 8, marginBottom: 8 },
  chipActive: { borderColor: '#6366f1', backgroundColor: '#1e1b4b' },
  chipText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: '#e0e7ff' },
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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
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
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#334155', overflow: 'hidden' },
  opt: { paddingHorizontal: 10, paddingVertical: 4, fontSize: 13, fontWeight: '700', color: '#64748b' },
  optActive: { color: '#6366f1' },
  divider: { width: 1, height: '100%', backgroundColor: '#334155' },
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

  // Edit state mirrors user fields
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
      // Populate edit fields
      setEditGoal((u?.fitness_goal as FitnessGoal) ?? 'general');
      setEditExp((u?.experience_level as ExperienceLevel) ?? 'intermediate');
      const freq = u?.workout_frequency;
      if (freq) {
        if (freq <= 2) setEditFreq('1-2');
        else if (freq <= 4) setEditFreq('3-4');
        else if (freq <= 6) setEditFreq('5-6');
        else setEditFreq('7');
      }
      // current_weight and target_weight are stored in lbs — display in chosen unit
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
      // Convert entered weights back to lbs for storage
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
    // reset fields back to current user data
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
    // Use window.confirm on web since Alert doesn't work
    const confirmed = Platform.OS === 'web'
      ? window.confirm('Sign out of AdaptiTrain?')
      : true; // on native we'd show Alert — for now just sign out directly

    if (!confirmed) return;

    try {
      await signOut();
      onSignOut();
    } catch {
      // Sign out anyway — clear state
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
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      {/* ── Account info ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Row label="Email" value={user?.email ?? '—'} />
        </View>
      </View>

      {/* ── Fitness profile ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Fitness Profile</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
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

              <Text style={[styles.editLabel, { marginTop: 14 }]}>Experience level</Text>
              <ChipRow options={expOpts} selected={editExp} onSelect={setEditExp} />

              <Text style={[styles.editLabel, { marginTop: 14 }]}>Training frequency</Text>
              <ChipRow options={freqOpts} selected={editFreq} onSelect={setEditFreq} />

              <View style={[styles.row, { marginTop: 14, alignItems: 'center', marginBottom: 8 }]}>
                <Text style={[styles.editLabel, { marginBottom: 0, flex: 1 }]}>Weight</Text>
                <UnitToggle unit={unit} onToggle={toggle} />
              </View>
              <View style={styles.row}>
                <View style={styles.flex1}>
                  <TextInput
                    style={styles.editInput}
                    placeholder="Current"
                    placeholderTextColor="#475569"
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
                    placeholderTextColor="#475569"
                    value={editTargetWeight}
                    onChangeText={setEditTargetWeight}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <Text style={[styles.editLabel, { marginTop: 14 }]}>Injuries / limitations</Text>
              <TextInput
                style={[styles.editInput, { height: 72 }]}
                placeholder="e.g. bad knees — or leave blank"
                placeholderTextColor="#475569"
                value={editInjuries}
                onChangeText={setEditInjuries}
                multiline
              />
            </>
          )}
        </View>
      </View>

      {/* ── Goals ── */}
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

      {/* ── Whoop ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Whoop</Text>
        <View style={styles.card}>
          <View style={styles.whoopRow}>
            <View style={styles.flex1}>
              <Text style={[styles.whoopStatus, { color: whoopConnected ? '#22c55e' : '#f87171' }]}>
                {whoopConnected ? '● Connected' : '● Not connected'}
              </Text>
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

      {/* ── Sign out ── */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} activeOpacity={0.8}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
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
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 60 },
  centered: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#f8fafc', marginBottom: 24 },

  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  editBtn: { color: '#6366f1', fontSize: 15, fontWeight: '700' },
  cancelBtn: { color: '#64748b', fontSize: 15, fontWeight: '600', marginRight: 16 },
  editActions: { flexDirection: 'row', alignItems: 'center' },

  errorBox: {
    backgroundColor: '#2d1515',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  errorText: { color: '#fca5a5', fontSize: 13 },

  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16 },

  rowWrap: { paddingVertical: 6 },
  rowLabel: { fontSize: 12, color: '#64748b', marginBottom: 2 },
  rowValue: { fontSize: 15, color: '#f8fafc', fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 8 },

  editLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  editInput: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    color: '#f8fafc',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 4,
  },
  row: { flexDirection: 'row' },
  flex1: { flex: 1 },

  goalCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, marginBottom: 8 },
  goalDesc: { color: '#f8fafc', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  progressText: { color: '#64748b', fontSize: 13 },

  whoopRow: { flexDirection: 'row', alignItems: 'center' },
  whoopStatus: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  whoopSub: { fontSize: 13, color: '#64748b' },
  whoopBtn: { backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  whoopBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  signOutBtn: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  signOutText: { color: '#ef4444', fontSize: 16, fontWeight: '700' },
});
