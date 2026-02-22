-- AdaptiTrain Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Whoop Integration
  whoop_user_id TEXT,
  whoop_access_token TEXT,
  whoop_refresh_token TEXT,
  whoop_token_expires_at TIMESTAMP WITH TIME ZONE,

  -- User Profile
  fitness_goal TEXT CHECK (fitness_goal IN ('weight_loss', 'strength', 'endurance', 'general')),
  target_weight DECIMAL(5, 1),
  current_weight DECIMAL(5, 1),
  workout_frequency INTEGER CHECK (workout_frequency BETWEEN 1 AND 7),
  experience_level TEXT CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  injuries_limitations TEXT
);

-- Goals table
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  goal_type TEXT CHECK (goal_type IN ('strength', 'cardio', 'weight')) NOT NULL,
  description TEXT NOT NULL,
  target_value DECIMAL(8, 2),
  current_value DECIMAL(8, 2),
  unit TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Whoop data table
CREATE TABLE IF NOT EXISTS public.whoop_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  recovery_score INTEGER CHECK (recovery_score BETWEEN 0 AND 100),
  sleep_score INTEGER CHECK (sleep_score BETWEEN 0 AND 100),
  hrv_rmssd DECIMAL(6, 2),
  resting_heart_rate INTEGER,
  strain DECIMAL(4, 1),
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Workouts table
CREATE TABLE IF NOT EXISTS public.workouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  workout_type TEXT NOT NULL,
  recovery_score_at_generation INTEGER,
  ai_reasoning TEXT,
  completed BOOLEAN DEFAULT FALSE,
  rpe INTEGER CHECK (rpe BETWEEN 1 AND 10),
  notes TEXT,
  duration_minutes INTEGER
);

-- Exercises table
CREATE TABLE IF NOT EXISTS public.exercises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workout_id UUID REFERENCES public.workouts(id) ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  category TEXT CHECK (category IN ('compound', 'isolation', 'cardio', 'mobility')),
  planned_sets INTEGER,
  planned_reps TEXT,
  planned_weight TEXT,
  completed_sets INTEGER,
  completed_reps TEXT,
  completed_weight TEXT,
  notes TEXT
);

-- ─── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whoop_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can manage own goals" ON public.goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own whoop data" ON public.whoop_data FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own workouts" ON public.workouts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own exercises" ON public.exercises
  FOR ALL USING (
    auth.uid() = (SELECT user_id FROM public.workouts WHERE id = workout_id)
  );

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_whoop_data_user_date ON public.whoop_data(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_workouts_user_date ON public.workouts(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_exercises_workout ON public.exercises(workout_id);
CREATE INDEX IF NOT EXISTS idx_goals_user ON public.goals(user_id);
