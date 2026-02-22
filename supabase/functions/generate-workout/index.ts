import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { userId, recoveryScore, sleepScore, recentWhoopData, recentWorkouts, userGoals, user } = body;

    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
    });

    // Build context for Claude
    const intensityGuidance =
      recoveryScore >= 67
        ? 'GREEN zone (67-100%): Generate a HIGH intensity workout with progressive overload, compound movements, and challenging weights. Push for PRs if sleep is good.'
        : recoveryScore >= 34
        ? 'YELLOW zone (34-66%): Generate a MODERATE intensity workout. Maintain current weights, reduce volume by 20%. No max efforts.'
        : 'RED zone (0-33%): Generate a LOW intensity active recovery workout — mobility, light cardio, yoga flows, or foam rolling. No heavy lifting.';

    const sleepGuidance =
      sleepScore < 60
        ? 'Poor sleep (<60%): Reduce workout complexity, focus on technique and form over weight.'
        : sleepScore > 75
        ? 'Good sleep (>75%): Can push for PRs and max efforts.'
        : 'Average sleep: Standard workout intensity appropriate.';

    const recentWorkoutsSummary = recentWorkouts
      .slice(0, 5)
      .map((w: Record<string, unknown>, i: number) => {
        const exList = ((w.exercises as Record<string, unknown>[]) ?? [])
          .map((e: Record<string, unknown>) => `${e.exercise_name} ${e.completed_sets ?? e.planned_sets}x${e.completed_reps ?? e.planned_reps} @ ${e.completed_weight ?? e.planned_weight ?? 'BW'}`)
          .join(', ');
        return `${i + 1}. ${w.workout_type} (${new Date(w.date as string).toLocaleDateString()}): ${exList || 'no exercises logged'}`;
      })
      .join('\n');

    const goalsSummary = userGoals
      .map((g: Record<string, unknown>) => `- ${g.description} (current: ${g.current_value ?? 'unknown'} ${g.unit ?? ''}, target: ${g.target_value} ${g.unit ?? ''})`)
      .join('\n');

    const prompt = `You are an elite personal trainer and exercise scientist. Generate a personalised workout for this athlete.

ATHLETE PROFILE:
- Experience: ${user.experience_level ?? 'intermediate'}
- Primary goal: ${user.fitness_goal ?? 'general fitness'}
- Workout frequency: ${user.workout_frequency ?? 4} days/week
- Injuries/limitations: ${user.injuries_limitations ?? 'none'}
- Available equipment: Full gym

TODAY'S BIOMETRICS:
- Recovery score: ${recoveryScore}% — ${intensityGuidance}
- Sleep performance: ${sleepScore}% — ${sleepGuidance}

RECENT WHOOP DATA (last 7 days):
${recentWhoopData.map((d: Record<string, unknown>) => `- ${d.date}: Recovery ${d.recovery_score ?? '?'}%, Sleep ${d.sleep_score ?? '?'}%, HRV ${d.hrv_rmssd ?? '?'}ms, Strain ${d.strain ?? '?'}`).join('\n') || 'No data'}

LAST 5 WORKOUTS:
${recentWorkoutsSummary || 'No workout history'}

GOALS:
${goalsSummary || 'No specific goals set'}

PROGRESSIVE OVERLOAD RULES:
- If user completed all planned sets/reps last session → increase weight 5-10 lbs for that exercise
- If user failed sets → maintain or reduce weight
- If 3+ days since training a muscle group → prioritise that muscle group

Generate a complete workout. Return ONLY valid JSON with NO markdown, NO backticks, NO explanation outside the JSON.

Required format:
{
  "workoutType": "Strength - Upper Body" | "Strength - Lower Body" | "Strength - Full Body" | "Cardio - Intervals" | "Cardio - Steady State" | "Mobility",
  "recommendedIntensity": "High" | "Moderate" | "Low",
  "estimatedDuration": <number in minutes>,
  "exercises": [
    {
      "name": "<exercise name>",
      "category": "compound" | "isolation" | "cardio" | "mobility",
      "sets": <number>,
      "reps": "<e.g. 8-10 or 60 seconds>",
      "weight": "<e.g. 135 lbs or null for bodyweight>",
      "restTime": "<e.g. 90 seconds>",
      "notes": "<form cues, alternatives, scaling>"
    }
  ],
  "aiReasoning": "<2-3 sentences explaining why this workout was chosen based on today's recovery, sleep, and history>"
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response type from Claude');

    let workout;
    try {
      workout = JSON.parse(content.text);
    } catch {
      // Try to extract JSON from the text
      const match = content.text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('Could not parse workout JSON from Claude response');
      workout = JSON.parse(match[0]);
    }

    return new Response(JSON.stringify({ workout }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
