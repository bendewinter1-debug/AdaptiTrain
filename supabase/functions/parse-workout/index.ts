import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Takes a plain-English workout description and returns either:
// { complete: true, workout: {...} }  — all info present, ready to log
// { complete: false, questions: [...] } — missing info, needs clarification
// Can also handle a follow-up message that fills in previous questions.

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { message, previousParsed, clarificationAnswers } = await req.json();

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

    const systemPrompt = `You are a workout logging assistant. Parse plain English workout descriptions into structured data.

Your job:
1. Extract workout information from natural language
2. If key information is missing, ask for it — but only ask for things that MATTER (exercise name, sets/reps are important; weight is nice-to-have; rest times are optional)
3. Never ask more than 2-3 clarifying questions at once
4. Be conversational, not clinical

Rules:
- "did bench press 3x8 at 80kg" → sets=3, reps="8", weight="80kg" ✓
- "did some pushups" → ask how many sets/reps
- "went for a run" → this is cardio, ask duration/distance but don't demand pace
- Weight is optional for bodyweight exercises (pushups, pullups, dips)
- If user says "did my usual workout" with no details, ask what they did
- Nap/active recovery counts as a workout type

Return ONLY valid JSON, no markdown, no explanation.

If you have enough to log:
{
  "complete": true,
  "workout": {
    "type": "Strength - Upper Body" | "Strength - Lower Body" | "Strength - Full Body" | "Cardio - Intervals" | "Cardio - Steady State" | "Mobility" | "Other",
    "duration_minutes": <number or null>,
    "rpe": <1-10 or null>,
    "notes": "<any extra context from user>",
    "exercises": [
      {
        "name": "<exercise name>",
        "sets": <number or null>,
        "reps": "<e.g. '8' or '8-10' or '60 seconds' or null>",
        "weight": "<e.g. '80kg' or '135lbs' or 'bodyweight' or null>"
      }
    ]
  },
  "summary": "<1-sentence friendly summary of what was logged>"
}

If you need more info:
{
  "complete": false,
  "partialWorkout": { <whatever you've extracted so far> },
  "questions": ["<question 1>", "<question 2>"],
  "friendlyMessage": "<conversational message acknowledging what you got and asking the questions>"
}`;

    const userContent = clarificationAnswers
      ? `Original workout description: "${message}"\n\nPreviously extracted: ${JSON.stringify(previousParsed)}\n\nUser's clarification answers: "${clarificationAnswers}"\n\nNow complete the parsing with this additional information.`
      : `Parse this workout: "${message}"`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { complete: false, questions: [], friendlyMessage: "I didn't catch that — can you describe your workout again?" };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
