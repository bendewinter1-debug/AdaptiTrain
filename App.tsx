import React, { useState, useEffect } from 'react';
import { StatusBar, View, ActivityIndicator, StyleSheet, Modal, Platform, TouchableOpacity, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { supabase, getUserProfile } from './src/services/supabase';
import { colors, fontSize as fs, radius, spacing, fontWeight } from './src/theme';

// ─── Whoop OAuth callback handler ─────────────────────────────────────────────
// When Whoop redirects back to our app after auth, the popup loads the SPA
// again with ?code=... and ?state=... in the URL. We detect this at load time,
// postMessage the code back to the parent, and close the popup.
// We retry postMessage a few times to handle any timing edge-cases where the
// parent listener hasn't attached yet.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if ((code || error) && window.opener) {
    const msg = error
      ? { type: 'WHOOP_AUTH_ERROR', error }
      : { type: 'WHOOP_AUTH_SUCCESS', code, state };

    // Send immediately, then retry once after 200 ms in case parent hasn't
    // attached the message listener yet, then close.
    window.opener.postMessage(msg, window.location.origin);
    setTimeout(() => {
      try { window.opener?.postMessage(msg, window.location.origin); } catch {}
      window.close();
    }, 300);
  }
}
import OnboardingScreen from './src/screens/OnboardingScreen';
import WhoopAuthScreen from './src/screens/WhoopAuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Tab = createBottomTabNavigator();

type AppState = 'loading' | 'onboarding' | 'main';

const TAB_ICONS: Record<string, { focused: string; unfocused: string }> = {
  Home: { focused: 'home', unfocused: 'home-outline' },
  History: { focused: 'time', unfocused: 'time-outline' },
  Profile: { focused: 'person', unfocused: 'person-outline' },
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icon = TAB_ICONS[name];
  return (
    <Ionicons
      name={(focused ? icon?.focused : icon?.unfocused) as any}
      size={24}
      color={focused ? colors.primary : colors.textMuted}
    />
  );
}

function MainTabs({ userId, onStartWorkout, onSignOut, onConnectWhoop, whoopConnectedAt, activeWorkoutId, onResumeWorkout }: {
  userId: string;
  onStartWorkout: (id: string) => void;
  onSignOut: () => void;
  onConnectWhoop: () => void;
  whoopConnectedAt: number;
  activeWorkoutId: string | null;
  onResumeWorkout: () => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        })}
      >
        <Tab.Screen name="Home">
          {() => <HomeScreen userId={userId} onStartWorkout={onStartWorkout} onConnectWhoop={onConnectWhoop} whoopConnectedAt={whoopConnectedAt} />}
        </Tab.Screen>
        <Tab.Screen name="History">
          {() => <HistoryScreen userId={userId} onViewWorkout={onStartWorkout} />}
        </Tab.Screen>
        <Tab.Screen name="Profile">
          {() => <ProfileScreen userId={userId} onSignOut={onSignOut} onConnectWhoop={onConnectWhoop} />}
        </Tab.Screen>
      </Tab.Navigator>
      {/* Floating pill shown when a workout is running in the background */}
      {activeWorkoutId && (
        <TouchableOpacity style={styles.resumePill} onPress={onResumeWorkout} activeOpacity={0.85}>
          <View style={styles.resumePillInner}>
            <Ionicons name="barbell-outline" size={18} color={colors.textPrimary} />
            <Text style={styles.resumePillText}>Workout in progress — tap to resume</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);
  const [workoutMinimized, setWorkoutMinimized] = useState(false);
  const [showWhoopModal, setShowWhoopModal] = useState(false);
  const [whoopConnectedAt, setWhoopConnectedAt] = useState<number>(0);

  useEffect(() => {
    const timeout = setTimeout(() => setAppState('onboarding'), 4000);
    checkAuth().finally(() => clearTimeout(timeout));

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        setUserId(null);
        setAppState('onboarding');
        setShowWhoopModal(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function checkAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setAppState('onboarding'); return; }
      setUserId(session.user.id);
      await checkProfile(session.user.id);
    } catch {
      setAppState('onboarding');
    }
  }

  async function checkProfile(uid: string) {
    try {
      const profile = await getUserProfile(uid);
      if (profile?.fitness_goal) {
        setAppState('main');
        // Show the Whoop modal on first login only:
        // - no token AND not skipped AND never connected before
        const skipped = typeof window !== 'undefined'
          && window.localStorage.getItem(`whoop_skipped_${uid}`) === 'true';
        const everConnected = typeof window !== 'undefined'
          && window.localStorage.getItem(`whoop_ever_connected_${uid}`) === 'true';
        if (!profile.whoop_access_token && !skipped && !everConnected) {
          setShowWhoopModal(true);
        }
      } else {
        setAppState('onboarding');
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      setAppState(code === 'PGRST116' ? 'onboarding' : 'onboarding');
    }
  }

  function handleOnboardingComplete(uid: string) {
    setUserId(uid);
    setAppState('main');
    // Clear skip flag on fresh signup so modal shows once
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(`whoop_skipped_${uid}`);
    }
    setShowWhoopModal(true);
  }

  function handleSignOut() {
    setUserId(null);
    setActiveWorkoutId(null);
    setShowWhoopModal(false);
    setAppState('onboarding');
  }

  if (appState === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <NavigationContainer theme={{ dark: true, colors: { primary: colors.primary, background: colors.background, card: colors.surface, text: colors.textPrimary, border: colors.border, notification: colors.primary } }}>
        {appState === 'onboarding' && (
          <OnboardingScreen
            onComplete={handleOnboardingComplete}
            onSignIn={async (uid) => {
              setUserId(uid);
              await checkProfile(uid);
            }}
          />
        )}

        {appState === 'main' && userId && (
          // Always render MainTabs so timer keeps running when workout is minimized
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1, display: (activeWorkoutId && !workoutMinimized) ? 'none' : 'flex' }}>
              <MainTabs
                userId={userId}
                onStartWorkout={(id) => { setActiveWorkoutId(id); setWorkoutMinimized(false); }}
                onSignOut={handleSignOut}
                onConnectWhoop={() => setShowWhoopModal(true)}
                whoopConnectedAt={whoopConnectedAt}
                activeWorkoutId={activeWorkoutId}
                onResumeWorkout={() => setWorkoutMinimized(false)}
              />
            </View>
            {activeWorkoutId && (
              <View style={{ flex: 1, display: workoutMinimized ? 'none' : 'flex' }}>
                <WorkoutScreen
                  workoutId={activeWorkoutId}
                  onComplete={() => { setActiveWorkoutId(null); setWorkoutMinimized(false); }}
                  onBack={() => { setActiveWorkoutId(null); setWorkoutMinimized(false); }}
                  onMinimize={() => setWorkoutMinimized(true)}
                />
              </View>
            )}
          </View>
        )}
      </NavigationContainer>

      {/* Whoop connect modal — appears over the app, not as a full screen */}
      {userId && (
        <Modal
          visible={showWhoopModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowWhoopModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <WhoopAuthScreen
                userId={userId}
                onConnected={() => { setShowWhoopModal(false); setWhoopConnectedAt(Date.now()); }}
                onSkip={() => setShowWhoopModal(false)}
              />
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resumePill: {
    position: 'absolute',
    bottom: spacing[70],
    left: spacing[16],
    right: spacing[16],
    backgroundColor: colors.primaryDark,
    borderRadius: radius['2xl'],
    padding: spacing[14],
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  resumePillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[8],
  },
  resumePillText: {
    color: colors.textPrimary,
    fontSize: fs.md,
    fontWeight: fontWeight.bold,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius['5xl'],
    borderTopRightRadius: radius['5xl'],
    maxHeight: '90%',
    overflow: 'hidden',
  },
});
