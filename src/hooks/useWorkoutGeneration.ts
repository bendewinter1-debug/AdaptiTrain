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
  deleteExercisesByWorkoutId,
  updateWorkout,
} from '../services/supabase';
import type { GeneratedWorkout, Workout } from '../types';

export function useWorkoutGeneration(userId: string | null) {
  const [generatedWorkout, setGeneratedWorkout] = useState<GeneratedWorkout | null>(null);
  const [savedWorkoutId, setSavedWorkoutId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (clarifications?: string) => {
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

      const recoveryScore = latestWhoop?.recovery_score ?? null;
      const sleepScore = latestWhoop?.sleep_score ?? null;
      const strainScore = latestWhoop?.strain ?? null;

      const workout = await generateWorkout({
        userId,
        recoveryScore,
        sleepScore,
        strainScore,
        recentWhoopData,
        recentWorkouts: recentWorkouts as Workout[],
        userGoals,
        user,
        clarifications,
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

  // ── Replace the current workout in-place (used when chat proposes a revision) ──
  const replaceGeneratedWorkout = useCallback(async (newWorkout: GeneratedWorkout) => {
    setGeneratedWorkout(newWorkout);

    // If there's an existing saved workout, update it and replace its exercises
    const currentId = savedWorkoutId;
    if (currentId) {
      try {
        await updateWorkout(currentId, {
          workout_type: newWorkout.workoutType,
          ai_reasoning: newWorkout.aiReasoning,
        });
        await deleteExercisesByWorkoutId(currentId);
        await insertExercises(newWorkout.exercises.map(ex => ({
          workout_id: currentId,
          exercise_name: ex.name,
          category: ex.category,
          planned_sets: ex.sets,
          planned_reps: ex.reps,
          planned_weight: ex.weight,
        })));
      } catch {
        // silently continue — workout is still updated in UI
      }
    } else {
      // No existing workout — save as a new one
      if (!userId) return;
      try {
        const saved = await insertWorkout({
          user_id: userId,
          workout_type: newWorkout.workoutType,
          ai_reasoning: newWorkout.aiReasoning,
          completed: false,
          date: new Date().toISOString(),
        });
        await insertExercises(newWorkout.exercises.map(ex => ({
          workout_id: saved.id,
          exercise_name: ex.name,
          category: ex.category,
          planned_sets: ex.sets,
          planned_reps: ex.reps,
          planned_weight: ex.weight,
        })));
        setSavedWorkoutId(saved.id);
      } catch {
        // silently continue
      }
    }
  }, [userId, savedWorkoutId]);

  return {
    generatedWorkout,
    savedWorkoutId,
    loading,
    error,
    generate: generate as (clarifications?: string) => Promise<void>,
    replaceGeneratedWorkout,
  };
}
