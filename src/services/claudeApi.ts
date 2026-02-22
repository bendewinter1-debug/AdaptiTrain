import { supabase } from './supabase';
import type { GeneratedWorkout, WhoopData, Workout, Goal, User } from '../types';

// ─── Workout generation via Supabase Edge Function ───────────────────────────

export interface WorkoutGenerationInput {
  userId: string;
  recoveryScore: number;
  sleepScore: number;
  recentWhoopData: WhoopData[];
  recentWorkouts: Workout[];
  userGoals: Goal[];
  user: User;
}

export async function generateWorkout(input: WorkoutGenerationInput): Promise<GeneratedWorkout> {
  const { data, error } = await supabase.functions.invoke('generate-workout', {
    body: input,
  });

  if (error) throw new Error(`Workout generation failed: ${error.message}`);
  if (!data?.workout) throw new Error('No workout returned from AI');

  return data.workout as GeneratedWorkout;
}

// ─── Recovery zone helpers ────────────────────────────────────────────────────

export function getRecoveryZone(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 67) return 'green';
  if (score >= 34) return 'yellow';
  return 'red';
}

export function getRecoveryColor(score: number): string {
  const zone = getRecoveryZone(score);
  if (zone === 'green') return '#22c55e';
  if (zone === 'yellow') return '#eab308';
  return '#ef4444';
}

export function getRecoveryLabel(score: number): string {
  const zone = getRecoveryZone(score);
  if (zone === 'green') return 'Optimal';
  if (zone === 'yellow') return 'Moderate';
  return 'Low';
}
