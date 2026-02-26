import { supabase } from './supabase';
import type { GeneratedWorkout, GeneratedExercise, WhoopData, Workout, Goal, User } from '../types';

// ─── Workout generation via Supabase Edge Function ───────────────────────────

export interface WorkoutGenerationInput {
  userId: string;
  recoveryScore: number | null;
  sleepScore: number | null;
  strainScore: number | null;
  recentWhoopData: WhoopData[];
  recentWorkouts: Workout[];
  userGoals: Goal[];
  user: User;
  clarifications?: string;
}

export async function generateWorkout(input: WorkoutGenerationInput): Promise<GeneratedWorkout> {
  const { data, error } = await supabase.functions.invoke('generate-workout', {
    body: input,
  });

  if (error) {
    // data may contain a richer error message from the edge function
    const detail = (data as { error?: string } | null)?.error ?? error.message;
    throw new Error(`Workout generation failed: ${detail}`);
  }
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

// ─── Natural language workout parser ─────────────────────────────────────────

export interface ParsedExercise {
  name: string;
  sets: number | null;
  reps: string | null;
  weight: string | null;
}

export interface ParsedWorkout {
  type: string;
  duration_minutes: number | null;
  rpe: number | null;
  notes: string;
  exercises: ParsedExercise[];
}

export interface ParseWorkoutResult {
  complete: true;
  workout: ParsedWorkout;
  summary: string;
}

export interface ParseWorkoutIncomplete {
  complete: false;
  partialWorkout: Partial<ParsedWorkout>;
  questions: string[];
  friendlyMessage: string;
}

export async function parseWorkout(
  message: string,
  previousParsed?: Partial<ParsedWorkout>,
  clarificationAnswers?: string,
): Promise<ParseWorkoutResult | ParseWorkoutIncomplete> {
  const { data, error } = await supabase.functions.invoke('parse-workout', {
    body: { message, previousParsed, clarificationAnswers },
  });
  if (error) throw new Error(`Parse failed: ${error.message}`);
  return data as ParseWorkoutResult | ParseWorkoutIncomplete;
}

// ─── AI Chat via Supabase Edge Function ──────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatUserContext {
  fitness_goal?: string;
  experience_level?: string;
  workout_frequency?: number;
  current_weight?: number;
  target_weight?: number;
  injuries_limitations?: string;
  goals?: { description: string }[];
  recovery_score?: number;
  sleep_score?: number;
  hrv_rmssd?: number;
  resting_heart_rate?: number;
  recentWorkouts?: unknown[];
  recentWhoopData?: unknown[];
}

export interface ChatResponse {
  reply: string;
  proposedWorkout: GeneratedWorkout | null;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  userContext: ChatUserContext,
): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke('ai-chat', {
    body: { messages, userContext },
  });

  if (error) {
    const detail = (data as { error?: string } | null)?.error ?? error.message;
    throw new Error(`Chat failed: ${detail}`);
  }
  if (!data?.reply) throw new Error('No reply from AI');
  return {
    reply: data.reply as string,
    proposedWorkout: (data.proposedWorkout as GeneratedWorkout) ?? null,
  };
}

// ─── Detect if a chat reply contains a workout proposal ───────────────────────

export async function detectWorkoutProposal(
  replyText: string,
): Promise<GeneratedWorkout | null> {
  // Quick pre-check: does this reply look like it has a workout plan at all?
  // Must have set×rep patterns AND at least one exercise keyword or weight marker
  const hasSetRep = /\d+\s*[x×]\s*\d+/i.test(replyText);
  const hasExerciseContext =
    /\b(sets?|reps?|rest|bench|squat|deadlift|press|row|curl|pull|push|lunge|plank|run|sprint|interval|circuit|dumbbell|barbell|kettlebell|cable|raises?|fly|flye|lateral|overhead|incline|decline|hammer|reverse|close.grip|wide.grip|sumo|hip|glute|calf|tricep|bicep|shoulder|chest|back|leg)\b/i.test(replyText);

  if (!hasSetRep || !hasExerciseContext) return null;

  const prompt = `You are a JSON extractor. The following text is a fitness coach's reply that appears to contain a workout plan.

Extract the workout into a structured JSON object. Return ONLY valid JSON, no explanation, no markdown fences.

If the text does NOT contain a clear workout plan with exercises, return: null

The JSON must match this exact TypeScript interface:
{
  "workoutType": one of ["Strength - Upper Body","Strength - Lower Body","Strength - Full Body","Cardio - Intervals","Cardio - Steady State","Mobility"],
  "recommendedIntensity": one of ["High","Moderate","Low"],
  "estimatedDuration": number (minutes),
  "aiReasoning": string (brief summary of why this workout, max 2 sentences),
  "exercises": [
    {
      "name": string,
      "category": one of ["compound","isolation","cardio","mobility"],
      "sets": number,
      "reps": string (e.g. "8-10"),
      "weight": string or null (e.g. "80kg", "135 lbs", null for bodyweight),
      "restTime": string (e.g. "60 seconds"),
      "notes": string
    }
  ]
}

Coach reply to extract from:
---
${replyText}
---`;

  try {
    const { reply: result } = await sendChatMessage([{ role: 'user', content: prompt }], {});
    const trimmed = result.trim();
    if (trimmed === 'null' || trimmed === '') return null;

    // Strip markdown code fences if present
    const jsonText = trimmed.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonText) as GeneratedWorkout;
    if (!parsed?.exercises?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ─── Exercise alternative suggestions ─────────────────────────────────────────

export async function suggestAlternativeExercises(
  exercise: GeneratedExercise,
  userContext: ChatUserContext,
): Promise<GeneratedExercise[]> {
  const prompt = `You are a fitness coach. Suggest exactly 3 alternative exercises to replace "${exercise.name}" (category: ${exercise.category}).

The alternatives should:
- Target the same muscle groups
- Be suitable for someone who is ${userContext.experience_level ?? 'intermediate'} level with a ${userContext.fitness_goal ?? 'general fitness'} goal
- ${userContext.injuries_limitations ? `Avoid aggravating: ${userContext.injuries_limitations}` : 'Be safe for general training'}
- Be practical gym alternatives (in case equipment is unavailable)

Return ONLY a valid JSON array of exactly 3 exercise objects, no other text. Each object must match this exact shape:
[
  {
    "name": "Exercise Name",
    "category": "${exercise.category}",
    "sets": ${exercise.sets},
    "reps": "${exercise.reps}",
    "weight": "suggested weight or null",
    "restTime": "${exercise.restTime}",
    "notes": "brief note about the alternative"
  }
]`;

  const { reply } = await sendChatMessage(
    [{ role: 'user', content: prompt }],
    userContext,
  );

  // Extract JSON array from the reply (handle markdown code blocks)
  const jsonMatch = reply.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error('Could not parse alternatives from AI response');

  const alternatives = JSON.parse(jsonMatch[0]) as GeneratedExercise[];
  if (!Array.isArray(alternatives) || alternatives.length === 0) {
    throw new Error('Invalid alternatives format');
  }
  return alternatives.slice(0, 3);
}
