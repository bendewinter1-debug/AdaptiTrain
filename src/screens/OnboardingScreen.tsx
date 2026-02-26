import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase, insertGoals } from '../services/supabase';
import type { FitnessGoal, ExperienceLevel } from '../types';

type Step = 'auth' | 'goals' | 'profile';
type Unit = 'lbs' | 'kg';

interface Props {
  onComplete: (userId: string) => void;
  onSignIn?: (userId: string) => void;
}

function toLbs(value: string, unit: Unit): number | null {
  const n = parseFloat(value);
  if (isNaN(n)) return null;
  return unit === 'kg' ? Math.round(n * 2.20462 * 10) / 10 : n;
}

// ─── Chip selector ────────────────────────────────────────────────────────────
function Chips<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: { label: string; value: T; emoji?: string }[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <View style={chipStyles.row}>
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <TouchableOpacity
            key={o.value}
            style={[chipStyles.chip, active && chipStyles.chipActive]}
            onPress={() => onToggle(o.value)}
            activeOpacity={0.7}
          >
            {o.emoji ? <Text style={chipStyles.emoji}>{o.emoji}</Text> : null}
            <Text style={[chipStyles.label, active && chipStyles.labelActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#334155',
    backgroundColor: '#1e293b',
  },
  chipActive: { borderColor: '#6366f1', backgroundColor: '#1e1b4b' },
  emoji: { fontSize: 16, marginRight: 6 },
  label: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  labelActive: { color: '#e0e7ff' },
});

// ─── Unit toggle ──────────────────────────────────────────────────────────────
function UnitToggle({ unit, onChange }: { unit: Unit; onChange: (u: Unit) => void }) {
  return (
    <View style={utStyles.wrap}>
      {(['lbs', 'kg'] as Unit[]).map((u) => (
        <TouchableOpacity
          key={u}
          style={[utStyles.btn, unit === u && utStyles.btnActive]}
          onPress={() => onChange(u)}
          activeOpacity={0.7}
        >
          <Text style={[utStyles.text, unit === u && utStyles.textActive]}>{u}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
const utStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 10, padding: 3 },
  btn: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8 },
  btnActive: { backgroundColor: '#6366f1' },
  text: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  textActive: { color: '#fff' },
});

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function OnboardingScreen({ onComplete, onSignIn }: Props) {
  const [step, setStep] = useState<Step>('auth');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState<string | null>(null);

  const [goals, setGoals] = useState<FitnessGoal[]>([]);
  const [unit, setUnit] = useState<Unit>('lbs');
  const [weight, setWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [frequency, setFrequency] = useState('3-4');
  const [experience, setExperience] = useState<ExperienceLevel>('intermediate');
  const [injuries, setInjuries] = useState('');
  const [sUnit, setSUnit] = useState<Unit>('lbs');
  const [bench, setBench] = useState('');
  const [squat, setSquat] = useState('');
  const [deadlift, setDeadlift] = useState('');
  const [run5k, setRun5k] = useState('');

  function toggleGoal(g: FitnessGoal) {
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────
  async function handleAuth() {
    setError(null);
    const trimEmail = email.trim().toLowerCase();
    const trimPassword = password.trim();

    if (!trimEmail) { setError('Please enter your email address.'); return; }
    if (!trimPassword) { setError('Please enter your password.'); return; }
    if (trimPassword.length < 6) { setError('Password must be at least 6 characters.'); return; }

    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error: err } = await supabase.auth.signUp({
          email: trimEmail,
          password: trimPassword,
        });

        if (err) throw err;

        // If identities array is empty, email already exists
        const anyUser = data.user as unknown as { identities?: unknown[] };
        if (anyUser?.identities?.length === 0) {
          setError('That email already has an account. Switch to Sign in.');
          setIsSignUp(false);
          return;
        }

        const uid = data.session?.user?.id ?? data.user?.id;
        if (!uid) {
          // Email confirmation required — let user know
          setError('Account created! Check your email to confirm, then sign in here.');
          setIsSignUp(false);
          return;
        }
        setUserId(uid);
        setStep('goals');

      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email: trimEmail,
          password: trimPassword,
        });

        if (err) throw err;

        const uid = data.session?.user?.id ?? data.user?.id;
        if (!uid) throw new Error('No session returned. Please try again.');

        // onSignIn tells App.tsx to check profile and navigate to main
        if (onSignIn) {
          onSignIn(uid);
        } else {
          onComplete(uid);
        }
      }
    } catch (err: unknown) {
      const raw = (err as Error)?.message ?? 'Something went wrong. Please try again.';
      const lower = raw.toLowerCase();

      if (lower.includes('invalid login') || lower.includes('invalid_credentials') || lower.includes('invalid credentials')) {
        setError('Wrong email or password. Please try again.');
      } else if (lower.includes('email not confirmed')) {
        setError('Please check your inbox and confirm your email first.');
      } else if (lower.includes('rate limit') || raw.includes('429')) {
        setError('Too many attempts — wait a minute and try again.');
      } else if (lower.includes('already registered') || lower.includes('user already')) {
        setError('That email already has an account. Switch to Sign in.');
        setIsSignUp(false);
      } else {
        setError(raw);
      }
    } finally {
      setLoading(false);
    }
  }

  // ─── Save profile ──────────────────────────────────────────────────────────
  async function handleComplete() {
    if (!userId) { setError('Session lost — please go back and sign in.'); return; }
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const confirmedEmail = session?.user?.email ?? email.trim().toLowerCase();

      const { error: upsertErr } = await supabase.from('users').upsert(
        {
          id: userId,
          email: confirmedEmail,
          fitness_goal: goals[0] ?? 'general',
          current_weight: toLbs(weight, unit) ?? null,
          target_weight: toLbs(targetWeight, unit) ?? null,
          workout_frequency: parseInt(frequency.split('-')[0] || '3', 10),
          experience_level: experience,
          injuries_limitations: injuries.trim() || null,
        },
        { onConflict: 'id' }
      );

      if (upsertErr) throw upsertErr;

      const goalRows: Record<string, unknown>[] = [];
      if (bench) goalRows.push({ user_id: userId, goal_type: 'strength', description: `Bench press: ${bench} ${sUnit}`, target_value: toLbs(bench, sUnit), unit: 'lbs' });
      if (squat) goalRows.push({ user_id: userId, goal_type: 'strength', description: `Squat: ${squat} ${sUnit}`, target_value: toLbs(squat, sUnit), unit: 'lbs' });
      if (deadlift) goalRows.push({ user_id: userId, goal_type: 'strength', description: `Deadlift: ${deadlift} ${sUnit}`, target_value: toLbs(deadlift, sUnit), unit: 'lbs' });
      if (run5k) goalRows.push({ user_id: userId, goal_type: 'cardio', description: `Run 5K in ${run5k} min`, target_value: parseFloat(run5k), unit: 'minutes' });
      if (goalRows.length > 0) await insertGoals(goalRows);

      onComplete(userId);
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? String(err);
      if (msg.includes('42501') || msg.includes('security policy')) {
        setError('Permission error. Please sign out and back in, then try again.');
      } else {
        setError(msg || 'Failed to save — please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  // ─── AUTH SCREEN ──────────────────────────────────────────────────────────
  if (step === 'auth') {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#0f172a' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={s.bg}
          contentContainerStyle={s.center}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={s.logo}>🏋️</Text>
          <Text style={s.appName}>AdaptiTrain</Text>
          <Text style={s.tagline}>AI workouts that adapt to how you feel</Text>

          <View style={s.card}>
            {/* Sign in / Create account tabs */}
            <View style={s.tabRow}>
              <TouchableOpacity
                style={[s.tab, !isSignUp && s.tabActive]}
                onPress={() => { setIsSignUp(false); setError(null); }}
                activeOpacity={0.8}
              >
                <Text style={[s.tabText, !isSignUp && s.tabTextActive]}>Sign in</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tab, isSignUp && s.tabActive]}
                onPress={() => { setIsSignUp(true); setError(null); }}
                activeOpacity={0.8}
              >
                <Text style={[s.tabText, isSignUp && s.tabTextActive]}>Create account</Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={s.errorBox}>
                <Text style={s.errorText}>⚠️  {error}</Text>
              </View>
            ) : null}

            <TextInput
              style={s.input}
              placeholder="Email address"
              placeholderTextColor="#475569"
              value={email}
              onChangeText={(t) => { setEmail(t); setError(null); }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              returnKeyType="next"
              autoComplete="email"
              textContentType="emailAddress"
            />
            <TextInput
              style={s.input}
              placeholder={isSignUp ? 'Password (min 6 characters)' : 'Password'}
              placeholderTextColor="#475569"
              value={password}
              onChangeText={(t) => { setPassword(t); setError(null); }}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleAuth}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
            />

            <TouchableOpacity
              style={[s.btn, loading && s.btnOff]}
              onPress={handleAuth}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>{isSignUp ? 'Create account →' : 'Sign in →'}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={s.switchRow}
              onPress={() => { setIsSignUp(!isSignUp); setError(null); }}
            >
              <Text style={s.switchText}>
                {isSignUp ? 'Already have an account? ' : "New to AdaptiTrain? "}
                <Text style={s.switchLink}>{isSignUp ? 'Sign in' : 'Create account'}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ─── GOALS SCREEN ────────────────────────────────────────────────────────
  if (step === 'goals') {
    const goalOpts: { label: string; value: FitnessGoal; emoji: string }[] = [
      { label: 'Lose fat',        value: 'weight_loss', emoji: '🔥' },
      { label: 'Build muscle',    value: 'strength',    emoji: '💪' },
      { label: 'Run further',     value: 'endurance',   emoji: '🏃' },
      { label: 'General fitness', value: 'general',     emoji: '⚡' },
    ];

    return (
      <ScrollView style={s.bg} contentContainerStyle={s.scroll}>
        <TouchableOpacity onPress={() => setStep('auth')} style={s.back}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.stepLabel}>Step 1 of 2</Text>
        <Text style={s.heading}>What's your main goal?</Text>
        <Text style={s.sub}>Pick everything that applies to you</Text>

        <Chips options={goalOpts} selected={goals} onToggle={toggleGoal} />

        <TouchableOpacity
          style={[s.btn, { marginTop: 32 }, goals.length === 0 && s.btnOff]}
          onPress={() => {
            if (goals.length > 0) setStep('profile');
          }}
          activeOpacity={0.8}
        >
          <Text style={s.btnText}>Next →</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.skip}
          onPress={() => {
            if (goals.length === 0) setGoals(['general']);
            setStep('profile');
          }}
        >
          <Text style={s.skipText}>Skip — set goals later</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ─── PROFILE SCREEN ──────────────────────────────────────────────────────
  if (step === 'profile') {
    const freqOpts = [
      { label: '1-2 days', value: '1-2' },
      { label: '3-4 days', value: '3-4' },
      { label: '5-6 days', value: '5-6' },
      { label: 'Every day', value: '7' },
    ];
    const expOpts: { label: string; value: ExperienceLevel; emoji: string }[] = [
      { label: 'Beginner',     value: 'beginner',     emoji: '🌱' },
      { label: 'Intermediate', value: 'intermediate', emoji: '💪' },
      { label: 'Advanced',     value: 'advanced',     emoji: '🏆' },
    ];

    return (
      <ScrollView
        style={s.bg}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => setStep('goals')} style={s.back}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.stepLabel}>Step 2 of 2</Text>
        <Text style={s.heading}>About you</Text>
        <Text style={s.sub}>All optional — helps personalise your workouts</Text>

        {/* Weight */}
        <View style={s.labelRow}>
          <Text style={s.label}>Weight</Text>
          <UnitToggle unit={unit} onChange={setUnit} />
        </View>
        <View style={s.row}>
          <TextInput
            style={[s.input, s.flex1]}
            placeholder={`Current (${unit})`}
            placeholderTextColor="#475569"
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />
          <View style={{ width: 10 }} />
          <TextInput
            style={[s.input, s.flex1]}
            placeholder={`Target (${unit})`}
            placeholderTextColor="#475569"
            value={targetWeight}
            onChangeText={setTargetWeight}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Training frequency */}
        <Text style={s.label}>How often do you train?</Text>
        <Chips
          options={freqOpts}
          selected={[frequency]}
          onToggle={(v) => setFrequency(v)}
        />

        {/* Experience */}
        <Text style={[s.label, { marginTop: 20 }]}>Experience level</Text>
        <Chips
          options={expOpts}
          selected={[experience]}
          onToggle={(v) => setExperience(v as ExperienceLevel)}
        />

        {/* Injuries */}
        <Text style={[s.label, { marginTop: 20 }]}>Any injuries or limitations?</Text>
        <TextInput
          style={[s.input, { height: 80 }]}
          placeholder="e.g. bad knees, shoulder pain — or leave blank"
          placeholderTextColor="#475569"
          value={injuries}
          onChangeText={setInjuries}
          multiline
        />

        {/* Strength baselines */}
        <View style={s.baselineBox}>
          <View style={s.labelRow}>
            <Text style={s.label}>Strength baselines (optional)</Text>
            <UnitToggle unit={sUnit} onChange={setSUnit} />
          </View>
          <Text style={s.hintText}>Helps me set realistic starting weights immediately</Text>
          <View style={s.row}>
            <TextInput style={[s.input, s.flex1]} placeholder={`Bench (${sUnit})`} placeholderTextColor="#475569" value={bench} onChangeText={setBench} keyboardType="decimal-pad" />
            <View style={{ width: 8 }} />
            <TextInput style={[s.input, s.flex1]} placeholder={`Squat (${sUnit})`} placeholderTextColor="#475569" value={squat} onChangeText={setSquat} keyboardType="decimal-pad" />
            <View style={{ width: 8 }} />
            <TextInput style={[s.input, s.flex1]} placeholder={`Deadlift (${sUnit})`} placeholderTextColor="#475569" value={deadlift} onChangeText={setDeadlift} keyboardType="decimal-pad" />
          </View>
          <TextInput
            style={s.input}
            placeholder="5K run time in minutes (e.g. 28)"
            placeholderTextColor="#475569"
            value={run5k}
            onChangeText={setRun5k}
            keyboardType="decimal-pad"
          />
        </View>

        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>⚠️  {error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[s.btn, loading && s.btnOff]}
          onPress={handleComplete}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.btnText}>Let's go 🚀</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.skip} onPress={handleComplete} disabled={loading}>
          <Text style={s.skipText}>Skip — I'll fill this in later</Text>
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  }

  return null;
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0f172a' },
  center: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 40 },
  scroll: { padding: 24, paddingTop: 56, paddingBottom: 60 },

  logo: { fontSize: 56, textAlign: 'center', marginBottom: 8 },
  appName: { fontSize: 34, fontWeight: '900', color: '#f8fafc', textAlign: 'center', marginBottom: 6 },
  tagline: { fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 36, lineHeight: 22 },

  card: { backgroundColor: '#1e293b', borderRadius: 20, padding: 24 },

  tabRow: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  tabActive: { backgroundColor: '#6366f1' },
  tabText: { color: '#64748b', fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#fff' },

  errorBox: {
    backgroundColor: '#2d1515',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  errorText: { color: '#fca5a5', fontSize: 14, lineHeight: 20 },

  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    color: '#f8fafc',
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },

  btn: { backgroundColor: '#6366f1', borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 4 },
  btnOff: { opacity: 0.4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  switchRow: { marginTop: 18, alignItems: 'center' },
  switchText: { color: '#64748b', fontSize: 14, textAlign: 'center' },
  switchLink: { color: '#6366f1', fontWeight: '700' },

  stepLabel: { color: '#6366f1', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  heading: { fontSize: 26, fontWeight: '800', color: '#f8fafc', marginBottom: 6 },
  sub: { fontSize: 14, color: '#64748b', marginBottom: 24, lineHeight: 20 },

  label: { color: '#94a3b8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  hintText: { fontSize: 13, color: '#475569', marginBottom: 12, marginTop: -4 },

  row: { flexDirection: 'row' },
  flex1: { flex: 1 },

  baselineBox: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginTop: 12, marginBottom: 12 },

  back: { marginBottom: 16 },
  backText: { color: '#6366f1', fontSize: 15, fontWeight: '600' },

  skip: { alignItems: 'center', padding: 14, marginTop: 4 },
  skipText: { color: '#475569', fontSize: 13 },
});
