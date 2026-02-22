import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { signUp, signIn, upsertUserProfile, insertGoals } from '../services/supabase';
import type { FitnessGoal, ExperienceLevel } from '../types';

type Step = 'auth' | 'goals' | 'profile' | 'strength_goals';

interface Props {
  onComplete: (userId: string) => void;
}

export default function OnboardingScreen({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('auth');
  const [isSignUp, setIsSignUp] = useState(true);
  const [loading, setLoading] = useState(false);

  // Auth fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Profile fields
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal>('general');
  const [currentWeight, setCurrentWeight] = useState('');
  const [targetWeight, setTargetWeight] = useState('');
  const [workoutFrequency, setWorkoutFrequency] = useState('4');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('intermediate');
  const [injuries, setInjuries] = useState('');

  // Strength goals
  const [benchGoal, setBenchGoal] = useState('');
  const [deadliftGoal, setDeadliftGoal] = useState('');
  const [squatGoal, setSquatGoal] = useState('');
  const [run5kGoal, setRun5kGoal] = useState('');

  const [userId, setUserId] = useState<string | null>(null);

  async function handleAuth() {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      const data = isSignUp ? await signUp(email, password) : await signIn(email, password);
      const uid = data.user?.id;
      if (!uid) throw new Error('No user ID returned');
      setUserId(uid);
      setStep('goals');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleComplete() {
    if (!userId) return;
    setLoading(true);
    try {
      await upsertUserProfile(userId, {
        email,
        fitness_goal: fitnessGoal,
        current_weight: currentWeight ? parseFloat(currentWeight) : null,
        target_weight: targetWeight ? parseFloat(targetWeight) : null,
        workout_frequency: parseInt(workoutFrequency, 10),
        experience_level: experienceLevel,
        injuries_limitations: injuries || null,
      });

      const goals: Record<string, unknown>[] = [];
      if (benchGoal) goals.push({ user_id: userId, goal_type: 'strength', description: `Bench press ${benchGoal} lbs`, target_value: parseFloat(benchGoal), unit: 'lbs' });
      if (deadliftGoal) goals.push({ user_id: userId, goal_type: 'strength', description: `Deadlift ${deadliftGoal} lbs`, target_value: parseFloat(deadliftGoal), unit: 'lbs' });
      if (squatGoal) goals.push({ user_id: userId, goal_type: 'strength', description: `Squat ${squatGoal} lbs`, target_value: parseFloat(squatGoal), unit: 'lbs' });
      if (run5kGoal) goals.push({ user_id: userId, goal_type: 'cardio', description: `5K in under ${run5kGoal} minutes`, target_value: parseFloat(run5kGoal), unit: 'minutes' });
      if (goals.length > 0) await insertGoals(goals);

      onComplete(userId);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'auth') {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>AdaptiTrain</Text>
          <Text style={styles.subtitle}>AI-powered workouts, personalised to your recovery</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{isSignUp ? 'Create Account' : 'Sign In'}</Text>
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#64748b" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <TextInput style={styles.input} placeholder="Password" placeholderTextColor="#64748b" value={password} onChangeText={setPassword} secureTextEntry />
            <TouchableOpacity style={styles.primaryBtn} onPress={handleAuth} disabled={loading}>
              <Text style={styles.primaryBtnText}>{loading ? 'Loading...' : isSignUp ? 'Create Account' : 'Sign In'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
              <Text style={styles.linkText}>{isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (step === 'goals') {
    const goals: { label: string; value: FitnessGoal }[] = [
      { label: 'Weight Loss', value: 'weight_loss' },
      { label: 'Build Strength', value: 'strength' },
      { label: 'Improve Endurance', value: 'endurance' },
      { label: 'General Fitness', value: 'general' },
    ];
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Your Primary Goal</Text>
        <Text style={styles.subtitle}>This shapes how AdaptiTrain designs your workouts</Text>
        {goals.map((g) => (
          <TouchableOpacity key={g.value} style={[styles.optionBtn, fitnessGoal === g.value && styles.optionBtnSelected]} onPress={() => setFitnessGoal(g.value)}>
            <Text style={[styles.optionBtnText, fitnessGoal === g.value && styles.optionBtnTextSelected]}>{g.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('profile')}>
          <Text style={styles.primaryBtnText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (step === 'profile') {
    const levels: { label: string; value: ExperienceLevel }[] = [
      { label: 'Beginner', value: 'beginner' },
      { label: 'Intermediate', value: 'intermediate' },
      { label: 'Advanced', value: 'advanced' },
    ];
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Your Profile</Text>
          <TextInput style={styles.input} placeholder="Current weight (lbs)" placeholderTextColor="#64748b" value={currentWeight} onChangeText={setCurrentWeight} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Target weight (lbs) — optional" placeholderTextColor="#64748b" value={targetWeight} onChangeText={setTargetWeight} keyboardType="numeric" />
          <TextInput style={styles.input} placeholder="Workout days per week (3-7)" placeholderTextColor="#64748b" value={workoutFrequency} onChangeText={setWorkoutFrequency} keyboardType="numeric" />
          <Text style={styles.label}>Experience Level</Text>
          <View style={styles.row}>
            {levels.map((l) => (
              <TouchableOpacity key={l.value} style={[styles.chipBtn, experienceLevel === l.value && styles.chipBtnSelected]} onPress={() => setExperienceLevel(l.value)}>
                <Text style={[styles.chipText, experienceLevel === l.value && styles.chipTextSelected]}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={[styles.input, { height: 80 }]} placeholder="Any injuries or limitations? (optional)" placeholderTextColor="#64748b" value={injuries} onChangeText={setInjuries} multiline />
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setStep('strength_goals')}>
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // strength_goals step
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Set Your Targets</Text>
        <Text style={styles.subtitle}>Optional — helps AdaptiTrain track your progress</Text>
        <TextInput style={styles.input} placeholder="Bench press target (lbs)" placeholderTextColor="#64748b" value={benchGoal} onChangeText={setBenchGoal} keyboardType="numeric" />
        <TextInput style={styles.input} placeholder="Deadlift target (lbs)" placeholderTextColor="#64748b" value={deadliftGoal} onChangeText={setDeadliftGoal} keyboardType="numeric" />
        <TextInput style={styles.input} placeholder="Squat target (lbs)" placeholderTextColor="#64748b" value={squatGoal} onChangeText={setSquatGoal} keyboardType="numeric" />
        <TextInput style={styles.input} placeholder="5K run target (minutes)" placeholderTextColor="#64748b" value={run5kGoal} onChangeText={setRun5kGoal} keyboardType="numeric" />
        <TouchableOpacity style={styles.primaryBtn} onPress={handleComplete} disabled={loading}>
          <Text style={styles.primaryBtnText}>{loading ? 'Saving...' : "Let's Go!"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { padding: 24, paddingTop: 60 },
  title: { fontSize: 32, fontWeight: '800', color: '#f8fafc', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#94a3b8', marginBottom: 32 },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 24 },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#f8fafc', marginBottom: 20 },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 14,
    color: '#f8fafc',
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  label: { color: '#94a3b8', fontSize: 14, marginBottom: 10, marginTop: 4 },
  primaryBtn: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  linkText: { color: '#6366f1', textAlign: 'center', marginTop: 16, fontSize: 14 },
  optionBtn: {
    borderRadius: 12,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
    backgroundColor: '#1e293b',
  },
  optionBtnSelected: { borderColor: '#6366f1', backgroundColor: '#312e81' },
  optionBtnText: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  optionBtnTextSelected: { color: '#f8fafc' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  chipBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    backgroundColor: '#1e293b',
  },
  chipBtnSelected: { borderColor: '#6366f1', backgroundColor: '#312e81' },
  chipText: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: '#f8fafc' },
});
