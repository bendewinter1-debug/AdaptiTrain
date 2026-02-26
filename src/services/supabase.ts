import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const supabaseUrl =
  Constants.expoConfig?.extra?.supabaseUrl ??
  process.env.SUPABASE_URL ??
  'https://anshlxckmednqmptcgla.supabase.co';

const supabaseAnonKey =
  Constants.expoConfig?.extra?.supabaseAnonKey ??
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFuc2hseGNrbWVkbnFtcHRjZ2xhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MDYwNzksImV4cCI6MjA4NzM4MjA3OX0.9fZmmBxyDwA-BffxaLvZjgVcOSgpi1YpkjCSkt5Y10k';

// Use SecureStore on native, localStorage on web
const StorageAdapter = Platform.OS === 'web'
  ? {
      getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
      setItem: (key: string, value: string) => Promise.resolve(localStorage.setItem(key, value)),
      removeItem: (key: string) => Promise.resolve(localStorage.removeItem(key)),
    }
  : {
      getItem: (key: string) => SecureStore.getItemAsync(key),
      setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
      removeItem: (key: string) => SecureStore.deleteItemAsync(key),
    };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: StorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ─── Auth helpers ────────────────────────────────────────────────────────────

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ─── User profile ────────────────────────────────────────────────────────────

export async function getUserProfile(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateUserProfile(userId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertUserProfile(userId: string, profile: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('users')
    .upsert({ id: userId, ...profile })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Goals ───────────────────────────────────────────────────────────────────

export async function getUserGoals(userId: string) {
  const { data, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function insertGoals(goals: Record<string, unknown>[]) {
  const { data, error } = await supabase.from('goals').insert(goals).select();
  if (error) throw error;
  return data;
}

export async function updateGoal(goalId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('goals')
    .update(updates)
    .eq('id', goalId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Whoop data ──────────────────────────────────────────────────────────────

export async function getLatestWhoopData(userId: string) {
  // Fetch the 2 most recent rows and merge them.
  // This handles the common case where Whoop stores recovery/sleep against
  // yesterday's date and strain against today's date — we merge both so
  // the UI always shows all available metrics.
  const { data, error } = await supabase
    .from('whoop_data')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(2);
  if (error && error.code !== 'PGRST116') throw error;
  if (!data || data.length === 0) return null;

  // Most recent row is primary; fill in missing fields from the second row
  const primary = { ...data[0] };
  if (data.length > 1) {
    const secondary = data[1];
    if (primary.recovery_score == null && secondary.recovery_score != null) primary.recovery_score = secondary.recovery_score;
    if (primary.hrv_rmssd == null && secondary.hrv_rmssd != null) primary.hrv_rmssd = secondary.hrv_rmssd;
    if (primary.resting_heart_rate == null && secondary.resting_heart_rate != null) primary.resting_heart_rate = secondary.resting_heart_rate;
    if (primary.sleep_score == null && secondary.sleep_score != null) primary.sleep_score = secondary.sleep_score;
    if (primary.strain == null && secondary.strain != null) primary.strain = secondary.strain;
  }
  return primary;
}

export async function getWhoopDataRange(userId: string, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('whoop_data')
    .select('*')
    .eq('user_id', userId)
    .gte('date', since.toISOString().split('T')[0])
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertWhoopData(record: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('whoop_data')
    .upsert(record, { onConflict: 'user_id,date' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Workouts ────────────────────────────────────────────────────────────────

export async function insertWorkout(workout: Record<string, unknown>) {
  const { data, error } = await supabase.from('workouts').insert(workout).select().single();
  if (error) throw error;
  return data;
}

export async function updateWorkout(workoutId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('workouts')
    .update(updates)
    .eq('id', workoutId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getWorkoutWithExercises(workoutId: string) {
  const { data, error } = await supabase
    .from('workouts')
    .select('*, exercises(*)')
    .eq('id', workoutId)
    .single();
  if (error) throw error;
  return data;
}

export async function getUserWorkouts(userId: string, limit = 20) {
  const { data, error } = await supabase
    .from('workouts')
    .select('*, exercises(*)')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getRecentCompletedWorkouts(userId: string, limit = 5) {
  const { data, error } = await supabase
    .from('workouts')
    .select('*, exercises(*)')
    .eq('user_id', userId)
    .eq('completed', true)
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// ─── Exercises ───────────────────────────────────────────────────────────────

export async function insertExercises(exercises: Record<string, unknown>[]) {
  const { data, error } = await supabase.from('exercises').insert(exercises).select();
  if (error) throw error;
  return data;
}

export async function deleteExercisesByWorkoutId(workoutId: string) {
  const { error } = await supabase.from('exercises').delete().eq('workout_id', workoutId);
  if (error) throw error;
}

export async function updateExercise(exerciseId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('exercises')
    .update(updates)
    .eq('id', exerciseId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
