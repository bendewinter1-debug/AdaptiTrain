# AdaptiTrain

AI-powered workout app that generates personalised workouts based on your Whoop recovery score, sleep data, and training history.

## Stack

- **Frontend**: React Native + Expo (iOS + Mac)
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **AI**: Anthropic Claude API (`claude-sonnet-4-20250514`)
- **Wearable**: Whoop API (OAuth 2.0)
- **Language**: TypeScript

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Copy `.env.example` to `.env` and fill in your values:
```
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

Then update `app.json` → `expo.extra` with your Supabase URL and anon key.

### 3. Set up Supabase
1. Create a new Supabase project
2. Run `supabase/schema.sql` in the SQL editor
3. Deploy edge functions:
```bash
supabase functions deploy generate-workout
supabase functions deploy sync-whoop
```
4. Set edge function secrets:
```bash
supabase secrets set ANTHROPIC_API_KEY=your_key
supabase secrets set WHOOP_CLIENT_SECRET=947f55cd051534e49b8600890aeec77dd39d17e0d513ce3a945a8391aeb168cc
```

### 4. Run the app
```bash
npx expo start
```

## Project Structure

```
/src
  /components     — RecoveryScore, WorkoutCard, ExerciseItem, ProgressChart
  /screens        — Home, Onboarding, Workout, History, Profile, WhoopAuth
  /services       — supabase.ts, whoopApi.ts, claudeApi.ts
  /hooks          — useWhoopData, useWorkoutGeneration
  /types          — TypeScript interfaces
/supabase
  /functions
    generate-workout/  — Claude API edge function
    sync-whoop/        — Scheduled Whoop sync
  schema.sql           — Full database schema + RLS policies
App.tsx
```

## Features

- Whoop OAuth 2.0 integration with auto token refresh
- Recovery-adaptive workout generation (Green/Yellow/Red zones)
- Live workout tracking with set/rep logging and rest timers
- Workout history with filtering
- Progress tracking toward strength and cardio goals
- Auto Whoop sync 3× daily via cron edge function

## Whoop Recovery Zones

| Score | Zone | Workout Approach |
|-------|------|-----------------|
| 67–100% | 🟢 Green | High intensity, progressive overload, PR attempts |
| 34–66% | 🟡 Yellow | Moderate intensity, maintain weights, -20% volume |
| 0–33% | 🔴 Red | Active recovery — mobility, light cardio, rest |
