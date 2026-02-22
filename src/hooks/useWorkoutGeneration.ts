import { useState, useCallback } from 'react';
import { generateWorkout } from '../services/claudeApi';
import {
  getRecentCompletedWorkouts,
  getUserGoals,
  getUserProfile,
  getWhoopDataRange,
  getLatestWhoopData,
  insertWorkout,
  insertExercises,
} from '../services/supabase';
import type { GeneratedWorkout, Workout } from '../types';

export function useWorkoutGeneration(userId: string | null) {
  const [generatedWorkout, setGeneratedWorkout] = useState<GeneratedWorkout | null>(null);
  const [savedWorkoutId, setSavedWorkoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const [latestWhoop, recentWhoopData, recentWorkouts, userGoals, user] = await Promise.all([
        getLatestWhoopData(userId),
        getWhoopDataRange(userId, 7),
        getRecentCompletedWorkouts(userId, 5),
        getUserGoals(userId),
        getUserProfile(userId),
      ]);

      const recoveryScore = latestWhoop?.recovery_score ?? 50;
      const sleepScore = latestWhoop?.sleep_score ?? 70;

      const workout = await generateWorkout({
        userId,
        recoveryScore,
        sleepScore,
        recentWhoopData,
        recentWorkouts: recentWorkouts as Workout[],
        userGoals,
        user,
      });

      setGeneratedWorkout(workout);

      // Persist the generated workout to Supabase
      const saved = await insertWorkout({
        user_id: userId,
        workout_type: workout.workoutType,
        recovery_score_at_generation: recoveryScore,
        ai_reasoning: workout.aiReasoning,
        completed: false,
        date: new Date().toISOString(),
      });

      const exercises = workout.exercises.map((ex) => ({
        workout_id: saved.id,
        exercise_name: ex.name,
        category: ex.category,
        planned_sets: ex.sets,
        planned_reps: ex.reps,
        planned_weight: ex.weight,
      }));

      await insertExercises(exercises);
      setSavedWorkoutId(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate workout');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  return { generatedWorkout, savedWorkoutId, loading, error, generate };
}
