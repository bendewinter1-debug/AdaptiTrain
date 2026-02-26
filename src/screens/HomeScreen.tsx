import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useWhoopData } from '../hooks/useWhoopData';
import { useWorkoutGeneration } from '../hooks/useWorkoutGeneration';
import {
  getUserWorkouts,
  getUserProfile,
  getUserGoals,
  getWhoopDataRange,
  updateWorkout,
} from '../services/supabase';
import { sendChatMessage, ChatMessage, parseWorkout, ParsedWorkout, ParseWorkoutResult } from '../services/claudeApi';
import type { GeneratedWorkout } from '../types';
import { insertWorkout, insertExercises } from '../services/supabase';
import WorkoutCard from '../components/WorkoutCard';
import type { Workout } from '../types';
import { useWeightUnit } from '../hooks/useWeightUnit';

interface Props {
  userId: string;
  onStartWorkout: (workoutId: string) => void;
  onConnectWhoop: () => void;
  whoopConnectedAt?: number;
}

const WELCOME = "Hey! I'm your AdaptiTrain coach 👋\n\nTell me about your goals, your current lifts, or just tap **Generate Workout** and I'll build today's session around your recovery and goals.";

// ─── Clarifying questions shown before generating ────────────────────────────
const CLARIFYING_QUESTIONS = [
  { key: 'focus', label: 'What do you want to focus on today?', options: ['Upper body', 'Lower body', 'Full body', 'Cardio', 'Mobility', 'Surprise me'] },
  { key: 'energy', label: 'How do you feel right now?', options: ['Great — let\'s push hard', 'Pretty good', 'A bit tired', 'Run down'] },
  { key: 'time', label: 'How long do you have?', options: ['30 min', '45 min', '60 min', '75+ min'] },
];

// ─── Chat bubble ──────────────────────────────────────────────────────────────
function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const renderContent = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, li) => {
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <Text key={li} style={isUser ? bStyles.textUser : bStyles.text}>
          {parts.map((p, pi) =>
            pi % 2 === 1 ? <Text key={pi} style={{ fontWeight: '800' }}>{p}</Text> : p
          )}
          {li < lines.length - 1 ? '\n' : null}
        </Text>
      );
    });
  };
  return (
    <View style={[bStyles.wrap, isUser && bStyles.wrapUser]}>
      {!isUser && <Text style={bStyles.avatar}>🤖</Text>}
      <View style={[bStyles.bubble, isUser && bStyles.bubbleUser]}>
        {renderContent(message.content)}
      </View>
    </View>
  );
}

const bStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, paddingHorizontal: 16 },
  wrapUser: { flexDirection: 'row-reverse' },
  avatar: { fontSize: 22, marginRight: 8, marginBottom: 2 },
  bubble: { backgroundColor: '#1e293b', borderRadius: 18, borderBottomLeftRadius: 4, padding: 14, maxWidth: '80%' },
  bubbleUser: { backgroundColor: '#4f46e5', borderBottomLeftRadius: 18, borderBottomRightRadius: 4 },
  text: { color: '#e2e8f0', fontSize: 15, lineHeight: 22 },
  textUser: { color: '#fff', fontSize: 15, lineHeight: 22 },
});

// ─── Recovery pill ────────────────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={pillStyles.wrap}>
      <Text style={pillStyles.label}>{label}</Text>
      <Text style={[pillStyles.value, color ? { color } : {}]}>{value}</Text>
    </View>
  );
}
const pillStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#334155', marginRight: 8 },
  label: { color: '#64748b', fontSize: 12, marginRight: 4 },
  value: { fontSize: 13, fontWeight: '700', color: '#f8fafc' },
});

// ─── Clarifying questions panel ───────────────────────────────────────────────
function ClarifyPanel({
  answers,
  recommended,
  onAnswer,
  onGenerate,
  generating,
}: {
  answers: Record<string, string>;
  recommended: Record<string, string>;
  onAnswer: (key: string, val: string) => void;
  onGenerate: () => void;
  generating: boolean;
}) {
  const allAnswered = CLARIFYING_QUESTIONS.every(q => answers[q.key]);
  const hasRecommendations = Object.keys(recommended).length > 0;
  return (
    <View style={cStyles.panel}>
      <View style={cStyles.titleRow}>
        <Text style={cStyles.title}>Quick check-in</Text>
        {hasRecommendations && (
          <View style={cStyles.recBadge}>
            <Text style={cStyles.recBadgeText}>✨ Based on your data</Text>
          </View>
        )}
      </View>
      {CLARIFYING_QUESTIONS.map(q => (
        <View key={q.key} style={cStyles.qBlock}>
          <Text style={cStyles.qLabel}>{q.label}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cStyles.chips}>
            {q.options.map(opt => {
              const selected = answers[q.key] === opt;
              const isRecommended = recommended[q.key] === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[cStyles.chip, selected && cStyles.chipSelected, isRecommended && !selected && cStyles.chipRecommended]}
                  onPress={() => onAnswer(q.key, opt)}
                  activeOpacity={0.75}
                >
                  <Text style={[cStyles.chipText, selected && cStyles.chipTextSelected, isRecommended && !selected && cStyles.chipTextRecommended]}>
                    {isRecommended ? `✨ ${opt}` : opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ))}
      <TouchableOpacity
        style={[cStyles.genBtn, !allAnswered && cStyles.genBtnOff]}
        onPress={onGenerate}
        disabled={generating || !allAnswered}
        activeOpacity={0.85}
      >
        {generating
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={cStyles.genBtnText}>Build my workout →</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const cStyles = StyleSheet.create({
  panel: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#1e293b', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#334155' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { color: '#f8fafc', fontSize: 16, fontWeight: '800' },
  recBadge: { backgroundColor: '#312e81', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#4f46e5' },
  recBadgeText: { color: '#a5b4fc', fontSize: 11, fontWeight: '700' },
  qBlock: { marginBottom: 14 },
  qLabel: { color: '#94a3b8', fontSize: 13, marginBottom: 8 },
  chips: { gap: 8, paddingRight: 4 },
  chip: { backgroundColor: '#0f172a', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: '#334155' },
  chipSelected: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  chipRecommended: { backgroundColor: '#1e1b4b', borderColor: '#6366f1', borderStyle: 'dashed' },
  chipText: { color: '#64748b', fontSize: 13 },
  chipTextSelected: { color: '#fff', fontWeight: '700' },
  chipTextRecommended: { color: '#a5b4fc', fontWeight: '600' },
  genBtn: { backgroundColor: '#6366f1', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 4 },
  genBtnOff: { opacity: 0.4 },
  genBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen({ userId, onStartWorkout, onConnectWhoop, whoopConnectedAt = 0 }: Props) {
  const { latestData, syncing, lastSynced, whoopConnected, needsReconnect, missingScopes, sync, reload } = useWhoopData(userId);
  const { unit, toggle: toggleUnit } = useWeightUnit();

  // When Whoop is freshly connected (modal just closed), reload profile + sync data immediately
  useEffect(() => {
    if (whoopConnectedAt === 0) return;
    reload().then(() => sync());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whoopConnectedAt]);
  const { generatedWorkout, savedWorkoutId, loading: generating, error: genError, generate, replaceGeneratedWorkout } = useWorkoutGeneration(userId);

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: WELCOME },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [userCtx, setUserCtx] = useState<Record<string, unknown>>({});
  const [showWorkout, setShowWorkout] = useState(false);
  const [weekWorkouts, setWeekWorkouts] = useState(0);

  // Clarifying questions state
  const [showClarify, setShowClarify] = useState(false);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string>>({});
  const [recommendedAnswers, setRecommendedAnswers] = useState<Record<string, string>>({});

  // Mark complete state
  const [workoutCompleted, setWorkoutCompleted] = useState(false);
  const [showMarkComplete, setShowMarkComplete] = useState(false);
  const [markNotes, setMarkNotes] = useState('');
  const [marking, setMarking] = useState(false);

  // Chat input expand
  const [inputExpanded, setInputExpanded] = useState(false);

  // ─── Chat-proposed workout state ───────────────────────────────────────────
  // When the AI proposes a revised workout in chat, we store its message index
  // and the parsed workout so the user can apply it with one tap.
  const [proposedWorkouts, setProposedWorkouts] = useState<Record<number, GeneratedWorkout>>({});

  // ─── Workout logging via chat ──────────────────────────────────────────────
  // When the AI detects a logged workout description, we go through a flow:
  // idle → parsing → clarifying (if needed) → confirming → saved
  type LogState = 'idle' | 'parsing' | 'clarifying' | 'confirming' | 'saving' | 'saved';
  const [logState, setLogState] = useState<LogState>('idle');
  const [pendingWorkout, setPendingWorkout] = useState<ParsedWorkout | null>(null);
  const [pendingMessage, setPendingMessage] = useState('');
  const [pendingPartial, setPendingPartial] = useState<Partial<ParsedWorkout> | null>(null);
  const [logSummary, setLogSummary] = useState('');

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { loadContext(); }, [userId]);
  useEffect(() => {
    if (generatedWorkout) {
      setShowWorkout(true);
      setShowClarify(false);
      setWorkoutCompleted(false);
      setShowMarkComplete(false);
      setMarkNotes('');
    }
  }, [generatedWorkout]);

  const loadContext = useCallback(async () => {
    try {
      const [profile, goals, workouts, whoopWeek] = await Promise.all([
        getUserProfile(userId),
        getUserGoals(userId),
        getUserWorkouts(userId, 14),
        getWhoopDataRange(userId, 7),
      ]);
      const completed = (workouts as Workout[]).filter((w) => w.completed);
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      setWeekWorkouts(completed.filter((w) => new Date(w.date) >= weekAgo).length);
      setUserCtx({
        fitness_goal: profile?.fitness_goal,
        experience_level: profile?.experience_level,
        workout_frequency: profile?.workout_frequency,
        current_weight: profile?.current_weight,
        target_weight: profile?.target_weight,
        injuries_limitations: profile?.injuries_limitations,
        goals: goals?.map((g: { description: string }) => ({ description: g.description })),
        recovery_score: latestData?.recovery_score,
        sleep_score: latestData?.sleep_score,
        hrv_rmssd: latestData?.hrv_rmssd,
        resting_heart_rate: latestData?.resting_heart_rate,
        recentWorkouts: completed.slice(0, 5),
        recentWhoopData: whoopWeek,
      });
    } catch {}
  }, [userId, latestData]);

  // ─── Parse plain-English completion notes for RPE and duration hints ─────────
  function parseCompletionNotes(text: string): { rpe: number | null; duration_minutes: number | null } {
    const t = text.toLowerCase();
    // RPE: "rpe 8", "rpe8", "felt like a 7", "intensity 9", "8/10", "7 out of 10"
    let rpe: number | null = null;
    const rpeMatch =
      t.match(/\brpe\s*:?\s*(\d+(?:\.\d+)?)\b/) ||
      t.match(/\bfelt like\s+(?:a\s+)?(\d+)\b/) ||
      t.match(/\bintensity\s*:?\s*(\d+)\b/) ||
      t.match(/\b(\d+)\s*(?:\/|out of)\s*10\b/);
    if (rpeMatch) {
      const val = parseFloat(rpeMatch[1]);
      if (val >= 1 && val <= 10) rpe = Math.round(val);
    }
    // Duration: "45 min", "45mins", "1 hour", "1h 20m", "about 50 minutes"
    let duration_minutes: number | null = null;
    const hrMatch = t.match(/\b(\d+)\s*h(?:ours?|r)?\b/);
    const minMatch = t.match(/\b(\d+)\s*m(?:in(?:utes?)?)?\b/);
    if (hrMatch || minMatch) {
      const hrs = hrMatch ? parseInt(hrMatch[1], 10) : 0;
      const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
      const total = hrs * 60 + mins;
      if (total > 0 && total < 600) duration_minutes = total;
    }
    return { rpe, duration_minutes };
  }

  // ─── Smart recommendations for clarifying panel ──────────────────────────────
  function getRecommendedAnswers(): Record<string, string> {
    const recent = ((userCtx.recentWorkouts as Workout[]) ?? []).slice(0, 5);
    const recoveryScore = latestData?.recovery_score ?? null;

    // ── Focus: rotate based on muscle groups trained recently ──
    const recentTypes = recent.map(w => (w.workout_type ?? '').toLowerCase());
    const lastUpperIdx = recentTypes.findIndex(t => t.includes('upper'));
    const lastLowerIdx = recentTypes.findIndex(t => t.includes('lower'));
    const lastFullIdx  = recentTypes.findIndex(t => t.includes('full'));

    let focus = 'Full body';
    if (lastUpperIdx !== -1 && (lastLowerIdx === -1 || lastUpperIdx < lastLowerIdx)) {
      // Upper body was more recent → recommend lower body
      focus = 'Lower body';
    } else if (lastLowerIdx !== -1 && (lastUpperIdx === -1 || lastLowerIdx < lastUpperIdx)) {
      // Lower body was more recent → recommend upper body
      focus = 'Upper body';
    } else if (lastFullIdx === 0 || lastFullIdx === 1) {
      // Two recent full-body → suggest upper body for a change
      focus = 'Upper body';
    }
    // If no history, default to 'Full body'

    // ── Energy: map recovery score ──
    let energy = 'Pretty good';
    if (recoveryScore != null) {
      if (recoveryScore >= 67) energy = 'Great — let\'s push hard';
      else if (recoveryScore >= 34) energy = 'Pretty good';
      else if (recoveryScore >= 20) energy = 'A bit tired';
      else energy = 'Run down';
    }

    // ── Time: default 60 min, or match last selection ──
    const time = '60 min';

    return { focus, energy, time };
  }

  // ─── Open clarify panel with smart pre-selections ────────────────────────────
  function openClarifyPanel() {
    const recs = getRecommendedAnswers();
    setRecommendedAnswers(recs);
    // Pre-populate answers with recommendations (user can override any)
    setClarifyAnswers(recs);
    setShowClarify(true);
    setShowWorkout(false);
  }

  // ─── Mark generated workout as complete ──────────────────────────────────────
  async function handleMarkComplete() {
    if (!savedWorkoutId) return;
    setMarking(true);
    try {
      const { rpe, duration_minutes } = parseCompletionNotes(markNotes);
      await updateWorkout(savedWorkoutId, {
        completed: true,
        rpe: rpe ?? undefined,
        notes: markNotes.trim() || null,
        duration_minutes: duration_minutes ?? generatedWorkout?.estimatedDuration ?? null,
      });
      setWorkoutCompleted(true);
      setShowMarkComplete(false);
      setWeekWorkouts(prev => prev + 1);
    } catch {
      // silently ignore — user can try again
    } finally {
      setMarking(false);
    }
  }

  // ─── Detect if user is logging a workout ────────────────────────────────────
  function looksLikeWorkoutLog(text: string): boolean {
    const t = text.toLowerCase();
    // Past tense workout keywords
    const pastTense = /\b(did|done|finished|completed|just did|just finished|went to|had|hit|crushed|smashed|logged|trained)\b/;
    // Exercise keywords
    const exerciseWords = /\b(bench|squat|deadlift|press|pull|run|ran|row|curl|pushup|pull.?up|dip|lunge|workout|session|gym|lifting|cardio|yoga|swim|bike|cycling|hiit|circuit)\b/;
    // Number patterns (sets×reps, distances, times)
    const numbers = /\b\d+\s*(x|×|sets?|reps?|km|miles?|min|minutes?|kg|lbs?)\b/i;
    return pastTense.test(t) && (exerciseWords.test(t) || numbers.test(t));
  }

  // ─── Save a parsed workout to DB ────────────────────────────────────────────
  async function saveLoggedWorkout(workout: ParsedWorkout) {
    setLogState('saving');
    try {
      const saved = await insertWorkout({
        user_id: userId,
        workout_type: workout.type,
        date: new Date().toISOString(),
        completed: true,
        skipped: false,
        rpe: workout.rpe ?? undefined,
        notes: workout.notes || undefined,
        duration_minutes: workout.duration_minutes ?? undefined,
      }) as { id: string };

      const validExercises = (workout.exercises ?? []).filter(ex => ex.name?.trim());
      if (validExercises.length > 0) {
        await insertExercises(validExercises.map(ex => ({
          workout_id: saved.id,
          exercise_name: ex.name.trim(),
          completed_sets: ex.sets ?? undefined,
          completed_reps: ex.reps ?? undefined,
          completed_weight: ex.weight ?? undefined,
        })));
      }
      setLogState('saved');
      setWeekWorkouts(prev => prev + 1);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✅ **Workout logged!** ${logSummary || `${workout.type} saved to your history.`}\n\nYou can view and edit it in the **History** tab.`,
      }]);
      setTimeout(() => {
        setLogState('idle');
        setPendingWorkout(null);
        setPendingPartial(null);
        setLogSummary('');
      }, 500);
    } catch {
      setLogState('idle');
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, couldn't save that workout. Try again." }]);
    }
  }

  // ─── Handle the workout logging flow ────────────────────────────────────────
  async function handleWorkoutLog(text: string, isClarification = false) {
    setLogState('parsing');

    // Show user message in chat
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const result = await parseWorkout(
        isClarification ? pendingMessage : text,
        isClarification ? pendingPartial ?? undefined : undefined,
        isClarification ? text : undefined,
      );

      if (result.complete) {
        const r = result as ParseWorkoutResult;
        setLogSummary(r.summary);
        setPendingWorkout(r.workout);
        setLogState('confirming');
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Got it! Here's what I'm about to log:\n\n${r.summary}\n\nTap **Save** to confirm, or **Cancel** to discard.`,
        }]);
      } else {
        setPendingPartial(result.partialWorkout);
        if (!isClarification) setPendingMessage(text);
        setLogState('clarifying');
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: result.friendlyMessage,
        }]);
      }
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {
      setLogState('idle');
      setMessages(prev => [...prev, { role: 'assistant', content: "Couldn't parse that workout. Try describing it again, e.g. 'Did bench press 3×8 at 80kg, then rows 3×10'." }]);
    }
  }

  // ─── Send chat message ───────────────────────────────────────────────────────
  async function sendMessage(overrideText?: string) {
    const text = (overrideText ?? chatInput).trim();
    if (!text || chatLoading) return;
    setChatInput('');

    // If we're in the clarifying or confirming state, route to the log flow
    if (logState === 'clarifying') {
      await handleWorkoutLog(text, true);
      return;
    }

    // Detect if this looks like a workout the user has just done
    if (logState === 'idle' && looksLikeWorkoutLog(text)) {
      await handleWorkoutLog(text, false);
      return;
    }

    // Normal chat
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setChatLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    try {
      const ctx = { ...userCtx, recovery_score: latestData?.recovery_score, sleep_score: latestData?.sleep_score, hrv_rmssd: latestData?.hrv_rmssd, resting_heart_rate: latestData?.resting_heart_rate };
      const { reply, proposedWorkout } = await sendChatMessage(newMessages, ctx as Parameters<typeof sendChatMessage>[1]);
      // Calculate the stable index before appending the assistant message
      const replyIndex = newMessages.length;
      setMessages(prev => [...prev, { role: 'assistant' as const, content: reply }]);

      // If the reply embedded a structured workout, surface the Apply banner
      if (proposedWorkout) {
        setProposedWorkouts(pw => ({ ...pw, [replyIndex]: proposedWorkout }));
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, couldn't connect right now. Check your internet and try again." }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  // ─── Apply a chat-proposed workout ────────────────────────────────────────
  async function applyProposedWorkout(workout: GeneratedWorkout, messageIndex: number) {
    await replaceGeneratedWorkout(workout);
    // Remove the proposal card so it can't be applied twice
    setProposedWorkouts(pw => {
      const next = { ...pw };
      delete next[messageIndex];
      return next;
    });
    setShowWorkout(true);
    setWorkoutCompleted(false);
    setShowMarkComplete(false);
    setMarkNotes('');
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }

  // ─── Generate with clarification answers ─────────────────────────────────────
  async function handleGenerate() {
    const clarifications = Object.entries(clarifyAnswers)
      .map(([k, v]) => {
        const q = CLARIFYING_QUESTIONS.find(q => q.key === k);
        return q ? `${q.label} → ${v}` : '';
      })
      .filter(Boolean)
      .join('\n');

    // Save energy level answer as a note for AI context
    await generate(clarifications || undefined);

    // Add a chat message showing what we generated for
    if (clarifications) {
      const summary = `Generating workout:\n${clarifications}`;
      setMessages(prev => [...prev, { role: 'user', content: summary }, { role: 'assistant', content: "On it! Building your workout now... 💪" }]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }

  const recovery = latestData?.recovery_score;
  const recoveryColor = recovery == null ? '#64748b' : recovery >= 67 ? '#22c55e' : recovery >= 34 ? '#eab308' : '#ef4444';
  const recoveryLabel = recovery == null ? null : recovery >= 67 ? 'Ready to push' : recovery >= 34 ? 'Moderate day' : 'Recovery day';

  const QUICK_PROMPTS = [
    'What should I focus on today?',
    'I bench 80kg — what next?',
    'My 5K is 28 min — improve it',
    'I feel tired, what to do?',
    'How do I build more muscle?',
  ];

  return (
    <View style={styles.root}>
      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.greeting}>Good {timeOfDay()}</Text>
          <Text style={styles.appTitle}>AdaptiTrain</Text>
        </View>
        <View style={styles.topRight}>
          <Text style={styles.weekStat}>{weekWorkouts} sessions this week</Text>
          {recovery != null && (
            <View style={[styles.recoveryBadge, { backgroundColor: recoveryColor + '22', borderColor: recoveryColor + '60', borderWidth: 1 }]}>
              <View style={[styles.recoveryDot, { backgroundColor: recoveryColor }]} />
              <Text style={[styles.recoveryBadgeText, { color: recoveryColor }]}>{recovery}% · {recoveryLabel}</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Whoop status card ── */}
      {needsReconnect ? (
        // Token existed but lacked scopes — show amber reconnect prompt
        <TouchableOpacity style={styles.whoopReconnectCard} onPress={onConnectWhoop} activeOpacity={0.8}>
          <Text style={styles.whoopReconnectIcon}>⚠️</Text>
          <View style={styles.whoopConnectText}>
            <Text style={styles.whoopReconnectTitle}>Whoop needs reconnecting</Text>
            <Text style={styles.whoopReconnectSub}>Tap to re-authorise and unlock recovery data</Text>
          </View>
          <Text style={styles.whoopConnectArrow}>›</Text>
        </TouchableOpacity>
      ) : whoopConnected ? (
        <View style={styles.whoopCard}>
          <View style={styles.whoopCardHeader}>
            <View style={styles.whoopCardLeft}>
              <View style={styles.whoopDot} />
              <Text style={styles.whoopCardLabel}>WHOOP</Text>
              {syncing && <Text style={styles.whoopSyncing}> · Syncing…</Text>}
              {!syncing && lastSynced && <Text style={styles.whoopSyncTime}> · {relativeTime(lastSynced)}</Text>}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={toggleUnit}
                style={styles.unitToggle}
                activeOpacity={0.8}
              >
                <Text style={styles.unitToggleText}>{unit === 'kg' ? 'kg → lbs' : 'lbs → kg'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={sync} disabled={syncing} style={styles.whoopSyncBtn}>
                <Text style={[styles.whoopSyncBtnText, syncing && { opacity: 0.4 }]}>↻ Sync</Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* Missing scopes — token connected but recovery/sleep unavailable */}
          {missingScopes && !syncing && (
            <TouchableOpacity style={styles.missingScopesBar} onPress={onConnectWhoop} activeOpacity={0.85}>
              <Text style={styles.missingScopesText}>
                ⚠️ Recovery & sleep missing — tap to reconnect Whoop with full permissions →
              </Text>
            </TouchableOpacity>
          )}

          {/* Always show all 4 metrics once Whoop is connected — use '—' when syncing hasn't returned data yet */}
          <View style={styles.whoopMetrics}>
            <View style={styles.whoopMetric}>
              <Text style={[styles.whoopMetricValue, { color: latestData?.recovery_score != null ? recoveryColor : '#475569' }]}>
                {latestData?.recovery_score != null ? `${latestData.recovery_score}%` : '—'}
              </Text>
              <Text style={styles.whoopMetricLabel}>Recovery</Text>
            </View>
            <View style={styles.whoopMetric}>
              <Text style={[styles.whoopMetricValue, {
                color: latestData?.sleep_score != null
                  ? latestData.sleep_score > 75 ? '#22c55e' : latestData.sleep_score > 50 ? '#eab308' : '#ef4444'
                  : '#475569'
              }]}>
                {latestData?.sleep_score != null ? `${latestData.sleep_score}%` : '—'}
              </Text>
              <Text style={styles.whoopMetricLabel}>Sleep</Text>
            </View>
            <View style={styles.whoopMetric}>
              <Text style={[styles.whoopMetricValue, { color: latestData?.hrv_rmssd != null ? '#a5b4fc' : '#475569' }]}>
                {latestData?.hrv_rmssd != null ? `${Math.round(latestData.hrv_rmssd)}ms` : '—'}
              </Text>
              <Text style={styles.whoopMetricLabel}>HRV</Text>
            </View>
            <View style={styles.whoopMetric}>
              <Text style={[styles.whoopMetricValue, { color: latestData?.strain != null ? '#fb923c' : '#475569' }]}>
                {latestData?.strain != null ? latestData.strain.toFixed(1) : '—'}
              </Text>
              <Text style={styles.whoopMetricLabel}>Strain</Text>
            </View>
          </View>
          {!latestData && (
            <Text style={styles.whoopNoData}>
              {syncing ? 'Fetching your latest data…' : 'No data yet — tap Sync to fetch'}
            </Text>
          )}
        </View>
      ) : (
        <TouchableOpacity style={styles.whoopConnectCard} onPress={onConnectWhoop} activeOpacity={0.8}>
          <Text style={styles.whoopConnectIcon}>⌚</Text>
          <View style={styles.whoopConnectText}>
            <Text style={styles.whoopConnectTitle}>Connect Whoop</Text>
            <Text style={styles.whoopConnectSub}>Get AI workouts tailored to your recovery</Text>
          </View>
          <Text style={styles.whoopConnectArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* ── Generated workout card (collapsible) ── */}
      {generatedWorkout && (
        <View style={styles.workoutBanner}>
          <TouchableOpacity style={styles.workoutBannerHeader} onPress={() => setShowWorkout(v => !v)} activeOpacity={0.8}>
            <Text style={styles.workoutBannerTitle}>
              {workoutCompleted ? '✅' : '🏋️'} {generatedWorkout.workoutType} · {generatedWorkout.estimatedDuration} min
            </Text>
            {workoutCompleted && <Text style={styles.completedTag}>Logged ✓</Text>}
            <Text style={styles.chevron}>{showWorkout ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showWorkout && (
            <ScrollView
              style={styles.workoutBannerScroll}
              contentContainerStyle={styles.workoutBannerBody}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
            >
              <WorkoutCard
                workout={generatedWorkout}
                recoveryScore={recovery ?? null}
                userContext={{
                  experience_level: (userCtx.experience_level as string) ?? undefined,
                  fitness_goal: (userCtx.fitness_goal as string) ?? undefined,
                  injuries_limitations: (userCtx.injuries_limitations as string) ?? undefined,
                }}
              />

              {/* Action row */}
              {!workoutCompleted ? (
                <View style={styles.actionRow}>
                  {savedWorkoutId && (
                    <TouchableOpacity style={styles.startBtn} onPress={() => onStartWorkout(savedWorkoutId)} activeOpacity={0.85}>
                      <Text style={styles.startBtnText}>Start →</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.markCompleteBtn}
                    onPress={() => setShowMarkComplete(v => !v)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.markCompleteBtnText}>✓ Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.completedConfirm}>
                  <Text style={styles.completedConfirmText}>🎉 Workout logged!</Text>
                </View>
              )}

              {/* Mark complete inline form */}
              {showMarkComplete && !workoutCompleted && (
                <View style={styles.markCompletePanel}>
                  <Text style={styles.markCompleteTitle}>How did it go?</Text>
                  <Text style={styles.markCompleteHint}>
                    Describe what happened — e.g. "45 min, dropped squats to 60kg, felt strong, RPE 7"
                  </Text>
                  <TextInput
                    style={styles.markCompleteTextArea}
                    value={markNotes}
                    onChangeText={setMarkNotes}
                    placeholder={`How did ${generatedWorkout.workoutType} go? Any changes or notes?`}
                    placeholderTextColor="#475569"
                    multiline
                    autoFocus
                    textAlignVertical="top"
                  />
                  <Text style={styles.markCompleteHintSmall}>
                    💡 Mention RPE (e.g. "RPE 8"), time (e.g. "50 min"), or any changes made
                  </Text>
                  <TouchableOpacity style={styles.confirmBtn} onPress={handleMarkComplete} disabled={marking}>
                    {marking
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.confirmBtnText}>✓ Save & Complete</Text>}
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.regenBtn} onPress={() => openClarifyPanel()} disabled={generating}>
                <Text style={styles.regenBtnText}>↺ Generate different workout</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      )}

      {/* ── Error banner ── */}
      {genError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>⚠️ {genError}</Text>
        </View>
      )}

      {/* ── Clarifying questions panel ── */}
      {showClarify && !generatedWorkout && (
        <ClarifyPanel
          answers={clarifyAnswers}
          recommended={recommendedAnswers}
          onAnswer={(k, v) => setClarifyAnswers(prev => ({ ...prev, [k]: v }))}
          onGenerate={handleGenerate}
          generating={generating}
        />
      )}

      {/* ── Chat scroll ── */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg, i) => (
          <View key={i}>
            <ChatBubble message={msg} />
            {proposedWorkouts[i] && (
              <View style={styles.proposedWorkoutBanner}>
                <View style={styles.proposedWorkoutLeft}>
                  <Text style={styles.proposedWorkoutTitle}>🏋️ Revised workout ready</Text>
                  <Text style={styles.proposedWorkoutSub}>
                    {proposedWorkouts[i].workoutType} · {proposedWorkouts[i].estimatedDuration} min · {proposedWorkouts[i].exercises.length} exercises
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.proposedWorkoutApplyBtn}
                  onPress={() => applyProposedWorkout(proposedWorkouts[i], i)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.proposedWorkoutApplyText}>Apply →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
        {chatLoading && (
          <View style={bStyles.wrap}>
            <Text style={bStyles.avatar}>🤖</Text>
            <View style={[bStyles.bubble, styles.typingBubble]}>
              <ActivityIndicator size="small" color="#6366f1" />
            </View>
          </View>
        )}
        <View style={{ height: 8 }} />
      </ScrollView>

      {/* ── Workout log confirmation card ── */}
      {(logState === 'confirming' || logState === 'saving') && pendingWorkout && (
        <View style={styles.logConfirmCard}>
          <View style={styles.logConfirmHeader}>
            <Text style={styles.logConfirmTitle}>📋 Ready to log</Text>
            <Text style={styles.logConfirmType}>{pendingWorkout.type}</Text>
          </View>
          {pendingWorkout.exercises?.length > 0 && (
            <View style={styles.logConfirmExercises}>
              {pendingWorkout.exercises.map((ex, i) => (
                <Text key={i} style={styles.logConfirmEx}>
                  · {ex.name}{ex.sets ? ` ${ex.sets}×${ex.reps ?? '?'}` : ''}{ex.weight ? ` @ ${ex.weight}` : ''}
                </Text>
              ))}
            </View>
          )}
          {(pendingWorkout.duration_minutes || pendingWorkout.rpe) && (
            <Text style={styles.logConfirmMeta}>
              {pendingWorkout.duration_minutes ? `${pendingWorkout.duration_minutes} min` : ''}
              {pendingWorkout.duration_minutes && pendingWorkout.rpe ? ' · ' : ''}
              {pendingWorkout.rpe ? `RPE ${pendingWorkout.rpe}` : ''}
            </Text>
          )}
          <View style={styles.logConfirmActions}>
            <TouchableOpacity
              style={styles.logConfirmSave}
              onPress={() => saveLoggedWorkout(pendingWorkout)}
              activeOpacity={0.85}
            >
              {logState === 'saving'
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.logConfirmSaveText}>✓ Save workout</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.logConfirmCancel}
              onPress={() => { setLogState('idle'); setPendingWorkout(null); setMessages(prev => [...prev, { role: 'assistant', content: 'No problem, workout not logged.' }]); }}
              activeOpacity={0.85}
            >
              <Text style={styles.logConfirmCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Parsing spinner */}
      {logState === 'parsing' && (
        <View style={styles.parsingBar}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={styles.parsingText}>Reading your workout…</Text>
        </View>
      )}

      {/* ── Quick prompts ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickBar} contentContainerStyle={styles.quickContent} keyboardShouldPersistTaps="handled">
        {/* Generate workout — primary chip */}
        <TouchableOpacity
          style={[styles.quickChip, styles.quickChipPrimary]}
          onPress={() => openClarifyPanel()}
          disabled={generating}
          activeOpacity={0.8}
        >
          {generating
            ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 6 }} />
            : <Text style={styles.quickChipPrimaryIcon}>🤖</Text>
          }
          <Text style={styles.quickChipPrimaryText}>{generating ? 'Building…' : 'Generate workout'}</Text>
        </TouchableOpacity>

        {/* Log a workout chip */}
        <TouchableOpacity
          style={[styles.quickChip, styles.quickChipLog]}
          onPress={() => {
            setMessages(prev => [...prev, { role: 'assistant', content: "What did you do? Just describe it naturally — e.g. *\"Did bench press 4×8 at 80kg, incline DB press 3×10 at 30kg, cable flies 3×15\"*" }]);
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
          }}
          activeOpacity={0.8}
        >
          <Text style={styles.quickChipLogIcon}>📝</Text>
          <Text style={styles.quickChipLogText}>Log workout</Text>
        </TouchableOpacity>

        {QUICK_PROMPTS.map(p => (
          <TouchableOpacity key={p} style={styles.quickChip} onPress={() => sendMessage(p)} activeOpacity={0.7}>
            <Text style={styles.quickChipText}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Chat input ── */}
      <View style={[styles.inputBar, inputExpanded && styles.inputBarExpanded]}>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, inputExpanded && styles.inputExpanded]}
            placeholder={logState === 'clarifying' ? 'Answer above, then send…' : 'Ask your coach, or describe a workout you did…'}
            placeholderTextColor="#475569"
            value={chatInput}
            onChangeText={setChatInput}
            onSubmitEditing={inputExpanded ? undefined : () => sendMessage()}
            returnKeyType={inputExpanded ? 'default' : 'send'}
            multiline
            maxLength={4000}
          />
          <View style={styles.inputBtns}>
            <TouchableOpacity
              style={styles.expandBtn}
              onPress={() => setInputExpanded(v => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.expandBtnText}>{inputExpanded ? '↙' : '↕'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, (!chatInput.trim() || chatLoading) && styles.sendBtnOff]}
              onPress={() => sendMessage()}
              disabled={!chatInput.trim() || chatLoading}
              activeOpacity={0.85}
            >
              <Text style={styles.sendBtnText}>↑</Text>
            </TouchableOpacity>
          </View>
        </View>
        {inputExpanded && (
          <Text style={styles.charCount}>{chatInput.length} / 4000</Text>
        )}
      </View>
    </View>
  );
}

function timeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function relativeTime(date: Date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
    ...(Platform.OS === 'web' ? { display: 'flex' as 'flex', flexDirection: 'column' as 'column', height: '100%' as unknown as number } : {}),
  },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 12 },
  greeting: { fontSize: 13, color: '#64748b' },
  appTitle: { fontSize: 24, fontWeight: '900', color: '#f8fafc' },
  topRight: { alignItems: 'flex-end', gap: 6 },
  weekStat: { color: '#64748b', fontSize: 12 },
  recoveryBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, gap: 6 },
  recoveryDot: { width: 6, height: 6, borderRadius: 3 },
  recoveryBadgeText: { fontSize: 12, fontWeight: '700' },
  // Whoop connected card
  whoopCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#1e293b', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#22c55e33' },
  whoopCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  whoopCardLeft: { flexDirection: 'row', alignItems: 'center' },
  whoopDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e', marginRight: 6 },
  whoopCardLabel: { fontSize: 11, fontWeight: '800', color: '#22c55e', letterSpacing: 1, textTransform: 'uppercase' },
  whoopSyncing: { fontSize: 11, color: '#64748b' },
  whoopSyncTime: { fontSize: 11, color: '#475569' },
  whoopSyncBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  whoopSyncBtnText: { color: '#6366f1', fontSize: 12, fontWeight: '700' },
  unitToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  unitToggleText: { color: '#94a3b8', fontSize: 12, fontWeight: '700' },
  whoopMetrics: { flexDirection: 'row', gap: 0 },
  whoopMetric: { flex: 1, alignItems: 'center' },
  whoopMetricValue: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  whoopMetricLabel: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  whoopNoData: { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 4 },
  missingScopesBar: { backgroundColor: '#1c1507', borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#d9770640' },
  missingScopesText: { color: '#fbbf24', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  // Whoop not-connected card
  whoopConnectCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#1e293b', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#334155', borderStyle: 'dashed' },
  whoopConnectIcon: { fontSize: 28, marginRight: 12 },
  whoopConnectText: { flex: 1 },
  whoopConnectTitle: { fontSize: 14, fontWeight: '700', color: '#f8fafc', marginBottom: 2 },
  whoopConnectSub: { fontSize: 12, color: '#64748b' },
  whoopConnectArrow: { fontSize: 22, color: '#6366f1', fontWeight: '300' },
  // Whoop needs-reconnect card (amber warning)
  whoopReconnectCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#1c1507', borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d9770640' },
  whoopReconnectIcon: { fontSize: 24, marginRight: 12 },
  whoopReconnectTitle: { fontSize: 14, fontWeight: '700', color: '#fbbf24', marginBottom: 2 },
  whoopReconnectSub: { fontSize: 12, color: '#92400e' },
  workoutBanner: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#1e293b', borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
  workoutBannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  workoutBannerTitle: { color: '#f8fafc', fontSize: 14, fontWeight: '700', flex: 1 },
  chevron: { color: '#64748b', fontSize: 12, marginLeft: 8 },
  workoutBannerScroll: { maxHeight: 420 },
  workoutBannerBody: { paddingHorizontal: 14, paddingBottom: 14 },
  startBtn: { flex: 1, backgroundColor: '#6366f1', borderRadius: 12, padding: 14, alignItems: 'center' },
  startBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  regenBtn: { alignItems: 'center', padding: 10 },
  regenBtnText: { color: '#6366f1', fontSize: 13, fontWeight: '600' },
  errorBanner: { marginHorizontal: 16, backgroundColor: '#2d1515', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  errorText: { color: '#fca5a5', fontSize: 13 },
  chatScroll: { flex: 1 },
  chatContent: { paddingTop: 12, paddingBottom: 8 },
  typingBubble: { paddingVertical: 12, paddingHorizontal: 16 },
  quickBar: { flexShrink: 0, maxHeight: 46 },
  quickContent: { paddingHorizontal: 16, paddingVertical: 6, gap: 8 },
  quickChip: { backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#334155' },
  quickChipText: { color: '#94a3b8', fontSize: 13 },
  quickChipPrimary: { backgroundColor: '#4f46e5', borderColor: '#4f46e5', flexDirection: 'row', alignItems: 'center' },
  quickChipPrimaryIcon: { fontSize: 14, marginRight: 6 },
  quickChipPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  inputBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 30 : 14, backgroundColor: '#1e293b', borderTopWidth: 1, borderTopColor: '#334155' },
  inputBarExpanded: { paddingBottom: Platform.OS === 'ios' ? 30 : 14 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: { flex: 1, backgroundColor: '#0f172a', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, color: '#f8fafc', fontSize: 15, borderWidth: 1, borderColor: '#334155', maxHeight: 120, lineHeight: 22 },
  inputExpanded: { maxHeight: 200, height: 200 },
  inputBtns: { flexDirection: 'column', gap: 6, alignItems: 'center', flexShrink: 0 },
  expandBtn: { backgroundColor: '#334155', borderRadius: 18, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  expandBtnText: { color: '#94a3b8', fontSize: 16, fontWeight: '700' },
  charCount: { color: '#475569', fontSize: 11, textAlign: 'right', marginTop: 4 },
  sendBtn: { backgroundColor: '#6366f1', borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sendBtnOff: { opacity: 0.35 },
  sendBtnText: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 26 },
  // Workout banner
  completedTag: { color: '#22c55e', fontSize: 12, fontWeight: '700', marginRight: 6 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  completedConfirm: { backgroundColor: '#052e16', borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: '#16a34a40' },
  completedConfirmText: { color: '#22c55e', fontSize: 14, fontWeight: '700' },
  // Mark complete panel
  markCompletePanel: { backgroundColor: '#0f172a', borderRadius: 16, padding: 16, marginTop: 12, borderWidth: 1, borderColor: '#334155' },
  markCompleteTitle: { color: '#f8fafc', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  markCompleteHint: { color: '#64748b', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  markCompleteHintSmall: { color: '#475569', fontSize: 11, marginBottom: 12, lineHeight: 16 },
  markCompleteTextArea: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, color: '#f8fafc', fontSize: 15, borderWidth: 1, borderColor: '#334155', marginBottom: 10, minHeight: 90, lineHeight: 22 },
  confirmBtn: { backgroundColor: '#22c55e', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 2 },
  confirmBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  markCompleteBtn: { flex: 1, backgroundColor: '#052e16', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#16a34a40' },
  markCompleteBtnText: { color: '#22c55e', fontSize: 14, fontWeight: '700' },
  // Log workout quick chip
  quickChipLog: { backgroundColor: '#0f2a1e', borderColor: '#16a34a60', borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  quickChipLogIcon: { fontSize: 14, marginRight: 6 },
  quickChipLogText: { color: '#22c55e', fontSize: 13, fontWeight: '700' },
  // Log confirmation card
  logConfirmCard: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#0f2a1e', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#16a34a40' },
  logConfirmHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  logConfirmTitle: { color: '#22c55e', fontSize: 13, fontWeight: '700' },
  logConfirmType: { color: '#94a3b8', fontSize: 12 },
  logConfirmExercises: { marginBottom: 8 },
  logConfirmEx: { color: '#cbd5e1', fontSize: 13, marginBottom: 3 },
  logConfirmMeta: { color: '#64748b', fontSize: 12, marginBottom: 10 },
  logConfirmActions: { flexDirection: 'row', gap: 8 },
  logConfirmSave: { flex: 1, backgroundColor: '#16a34a', borderRadius: 10, padding: 12, alignItems: 'center' },
  logConfirmSaveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  logConfirmCancel: { backgroundColor: '#1e293b', borderRadius: 10, padding: 12, alignItems: 'center', paddingHorizontal: 20, borderWidth: 1, borderColor: '#334155' },
  logConfirmCancelText: { color: '#64748b', fontSize: 14 },
  // Parsing indicator
  parsingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  parsingText: { color: '#64748b', fontSize: 13 },
  // Chat-proposed workout banner
  proposedWorkoutBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginTop: 4, marginBottom: 8, backgroundColor: '#1e1b4b', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#4f46e5' },
  proposedWorkoutLeft: { flex: 1, marginRight: 12 },
  proposedWorkoutTitle: { color: '#a5b4fc', fontSize: 13, fontWeight: '800', marginBottom: 2 },
  proposedWorkoutSub: { color: '#6366f1', fontSize: 12 },
  proposedWorkoutApplyBtn: { backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  proposedWorkoutApplyText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
