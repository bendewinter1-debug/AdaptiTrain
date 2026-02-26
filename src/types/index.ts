// ─── User & Auth ────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  created_at: string;
  whoop_user_id?: string;
  whoop_access_token?: string;
  whoop_refresh_token?: string;
  whoop_token_expires_at?: string;
  fitness_goal?: FitnessGoal;
  target_weight?: number;
  current_weight?: number;
  workout_frequency?: number;
  experience_level?: ExperienceLevel;
  injuries_limitations?: string;
}

export type FitnessGoal = 'weight_loss' | 'strength' | 'endurance' | 'general';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

// ─── Goals ───────────────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  user_id: string;
  goal_type: 'strength' | 'cardio' | 'weight';
  description: string;
  target_value?: number;
  current_value?: number;
  unit?: string;
  created_at: string;
}

// ─── Whoop ───────────────────────────────────────────────────────────────────

export interface WhoopData {
  id: string;
  user_id: string;
  date: string;
  recovery_score?: number;
  sleep_score?: number;
  hrv_rmssd?: number;
  resting_heart_rate?: number;
  strain?: number;
  synced_at: string;
}

export interface WhoopTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// ─── Workouts ────────────────────────────────────────────────────────────────

export type WorkoutType = 'Strength - Upper Body' | 'Strength - Lower Body' | 'Strength - Full Body' | 'Cardio - Intervals' | 'Cardio - Steady State' | 'Mobility';
export type IntensityLevel = 'High' | 'Moderate' | 'Low';
export type ExerciseCategory = 'compound' | 'isolation' | 'cardio' | 'mobility';

export interface GeneratedExercise {
  name: string;
  category: ExerciseCategory;
  sets: number;
  reps: string;
  weight: string | null;
  restTime: string;
  notes: string;
}

export interface GeneratedWorkout {
  workoutType: WorkoutType;
  recommendedIntensity: IntensityLevel;
  estimatedDuration: number;
  exercises: GeneratedExercise[];
  aiReasoning: string;
}

export interface Workout {
  id: string;
  user_id: string;
  date: string;
  workout_type: string;
  recovery_score_at_generation?: number;
  ai_reasoning?: string;
  completed: boolean;
  skipped: boolean;
  rpe?: number;
  notes?: string;
  duration_minutes?: number;
  exercises?: Exercise[];
}

export interface Exercise {
  id: string;
  workout_id: string;
  exercise_name: string;
  category?: string;
  planned_sets?: number;
  planned_reps?: string;
  planned_weight?: string;
  completed_sets?: number;
  completed_reps?: string;
  completed_weight?: string;
  notes?: string;
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export interface OnboardingData {
  fitness_goal: FitnessGoal;
  target_weight?: number;
  current_weight?: number;
  workout_frequency: number;
  experience_level: ExperienceLevel;
  injuries_limitations?: string;
  goals: Omit<Goal, 'id' | 'user_id' | 'created_at'>[];
}

// ─── Navigation ──────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
  WhoopAuth: undefined;
  WorkoutSession: { workoutId: string };
  WorkoutDetail: { workoutId: string };
};

export type MainTabParamList = {
  Home: undefined;
  History: undefined;
  Profile: undefined;
};
