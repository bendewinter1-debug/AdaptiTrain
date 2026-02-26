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
    const { messages, userContext } = body;

    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
    });

    // Build recent workouts summary
    const recentWorkoutsSummary = userContext?.recentWorkouts?.length
      ? userContext.recentWorkouts.slice(0, 5).map((w: Record<string,unknown>, i: number) => {
          const exList = ((w.exercises as Record<string,unknown>[]) ?? [])
            .map((e: Record<string,unknown>) => `${e.exercise_name} ${e.completed_sets ?? e.planned_sets}×${e.completed_reps ?? e.planned_reps}${e.completed_weight || e.planned_weight ? ` @ ${e.completed_weight ?? e.planned_weight}` : ''}`)
            .join(', ');
          return `${i+1}. ${w.workout_type} (${w.date}): ${exList || 'no exercises logged'}`;
        }).join('\n')
      : 'No recent workouts recorded';

    // Build Whoop data summary
    const whoopSummary = userContext?.recentWhoopData?.length
      ? userContext.recentWhoopData.slice(0, 7).map((d: Record<string,unknown>) =>
          `- ${d.date}: Recovery ${d.recovery_score ?? '?'}%, Sleep ${d.sleep_score ?? '?'}%, HRV ${d.hrv_rmssd ? Math.round(d.hrv_rmssd as number) : '?'}ms, Strain ${d.strain ?? '?'}`
        ).join('\n')
      : 'No Whoop data (not connected)';

    const systemPrompt = `You are AdaptiTrain — an expert personal trainer and sports science coach embedded in a workout app. You have full access to the user's fitness data and give direct, specific, actionable advice.

USER PROFILE:
- Primary goal: ${userContext?.fitness_goal ?? 'general fitness'}
- Experience: ${userContext?.experience_level ?? 'intermediate'}
- Training frequency: ${userContext?.workout_frequency ?? '3-4'} days/week
- Current weight: ${userContext?.current_weight ? userContext.current_weight + ' lbs' : 'not set'}
- Target weight: ${userContext?.target_weight ? userContext.target_weight + ' lbs' : 'not set'}
- Injuries/limitations: ${userContext?.injuries_limitations ?? 'none'}
- Specific goals: ${userContext?.goals?.map((g: Record<string,unknown>) => g.description).join(', ') || 'none set'}

TODAY'S RECOVERY (Whoop):
- Recovery score: ${userContext?.recovery_score ? userContext.recovery_score + '%' : 'no data'}
- Sleep score: ${userContext?.sleep_score ? userContext.sleep_score + '%' : 'no data'}
- HRV: ${userContext?.hrv_rmssd ? Math.round(userContext.hrv_rmssd as number) + 'ms' : 'no data'}
- Resting HR: ${userContext?.resting_heart_rate ? userContext.resting_heart_rate + ' bpm' : 'no data'}

RECENT WHOOP DATA (last 7 days):
${whoopSummary}

RECENT WORKOUTS:
${recentWorkoutsSummary}

COACHING STYLE:
- Be direct and conversational — like a knowledgeable coach texting a mate
- Give specific numbers, weights, paces — never vague advice
- When the user shares a metric (lift, run time, etc.), analyse it and give the next concrete target
- If you need info to give better advice, ask ONE focused question
- For workout requests, give a complete plan with sets/reps/weights/rest times
- Reference their actual recent workout data and recovery when relevant
- Keep responses punchy (3-6 sentences) unless a full workout plan is requested
- Never be preachy, add disclaimers, or suggest they see a doctor for normal fitness questions
- Format workout plans clearly with line breaks and structure

WORKOUT EMBEDDING RULE (CRITICAL):
When your response contains a full workout plan (multiple exercises with sets/reps), you MUST append a hidden machine-readable block at the very end of your response in this exact format — no exceptions.
Keep workout plan text concise (bullet-point format, no lengthy prose) so there is always room to append the full JSON block below.
<!--WORKOUT_JSON:{"workoutType":"Strength - Upper Body","recommendedIntensity":"Moderate","estimatedDuration":45,"aiReasoning":"Brief reason","exercises":[{"name":"Exercise","category":"compound","sets":3,"reps":"8-10","weight":"20kg","restTime":"90 seconds","notes":""}]}-->

Valid workoutType values: "Strength - Upper Body", "Strength - Lower Body", "Strength - Full Body", "Cardio - Intervals", "Cardio - Steady State", "Mobility"
Valid recommendedIntensity values: "High", "Moderate", "Low"
Valid category values: "compound", "isolation", "cardio", "mobility"
The weight field must be a string like "20kg", "135 lbs", or null for bodyweight.
This block is invisible to users — include it whenever you write a workout plan, no exceptions.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2500,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const fullText = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract the hidden workout JSON block if present
    const workoutMatch = fullText.match(/<!--WORKOUT_JSON:([\s\S]*?)-->/);
    let proposedWorkout = null;
    let replyText = fullText;

    if (workoutMatch) {
      try {
        // Try direct parse first, then strip trailing extra braces if needed
        let jsonStr = workoutMatch[1];
        let parsed = null;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          // Claude sometimes adds an extra trailing } — strip them one at a time
          for (let trim = 1; trim <= 3; trim++) {
            try {
              parsed = JSON.parse(jsonStr.slice(0, -trim));
              break;
            } catch { /* continue */ }
          }
        }
        if (parsed?.exercises?.length) {
          proposedWorkout = parsed;
          // Strip the hidden block from the visible reply
          replyText = fullText.replace(/\s*<!--WORKOUT_JSON:[\s\S]*?-->/, '').trimEnd();
        }
      } catch {
        // JSON parse failed — just show the full text, no workout extracted
      }
    }

    return new Response(JSON.stringify({ reply: replyText, proposedWorkout }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ai-chat error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
