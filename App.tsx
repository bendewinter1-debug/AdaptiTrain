import React, { useState, useEffect } from 'react';
import { StatusBar, View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';

import { supabase, getUserProfile } from './src/services/supabase';
import OnboardingScreen from './src/screens/OnboardingScreen';
import WhoopAuthScreen from './src/screens/WhoopAuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import ProfileScreen from './src/screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

type AppState = 'loading' | 'onboarding' | 'whoop_auth' | 'main';

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const icons: Record<string, string> = { Home: '🏠', History: '📋', Profile: '👤' };
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{icons[name] ?? '●'}</Text>;
}

function MainTabs({ userId, onStartWorkout, onSignOut, onConnectWhoop }: {
  userId: string;
  onStartWorkout: (id: string) => void;
  onSignOut: () => void;
  onConnectWhoop: () => void;
}) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: '#1e293b', borderTopColor: '#334155', borderTopWidth: 1 },
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#64748b',
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
      })}
    >
      <Tab.Screen name="Home">
        {() => <HomeScreen userId={userId} onStartWorkout={onStartWorkout} />}
      </Tab.Screen>
      <Tab.Screen name="History">
        {() => <HistoryScreen userId={userId} onViewWorkout={onStartWorkout} />}
      </Tab.Screen>
      <Tab.Screen name="Profile">
        {() => <ProfileScreen userId={userId} onSignOut={onSignOut} onConnectWhoop={onConnectWhoop} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUserId(session.user.id);
        await checkProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUserId(null);
        setAppState('onboarding');
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setAppState('onboarding');
      return;
    }
    setUserId(session.user.id);
    await checkProfile(session.user.id);
  }

  async function checkProfile(uid: string) {
    try {
      const profile = await getUserProfile(uid);
      if (!profile?.fitness_goal) {
        setAppState('onboarding');
      } else if (!profile?.whoop_access_token) {
        setAppState('whoop_auth');
      } else {
        setAppState('main');
      }
    } catch {
      setAppState('onboarding');
    }
  }

  function handleOnboardingComplete(uid: string) {
    setUserId(uid);
    setAppState('whoop_auth');
  }

  function handleWhoopConnected() {
    setAppState('main');
  }

  function handleWhoopSkipped() {
    setAppState('main');
  }

  function handleSignOut() {
    setUserId(null);
    setActiveWorkoutId(null);
    setAppState('onboarding');
  }

  if (appState === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <NavigationContainer theme={{ dark: true, colors: { primary: '#6366f1', background: '#0f172a', card: '#1e293b', text: '#f8fafc', border: '#334155', notification: '#6366f1' } }}>
        {appState === 'onboarding' && (
          <OnboardingScreen onComplete={handleOnboardingComplete} />
        )}

        {appState === 'whoop_auth' && userId && (
          <WhoopAuthScreen
            userId={userId}
            onConnected={handleWhoopConnected}
            onSkip={handleWhoopSkipped}
          />
        )}

        {appState === 'main' && userId && !activeWorkoutId && (
          <MainTabs
            userId={userId}
            onStartWorkout={(id) => setActiveWorkoutId(id)}
            onSignOut={handleSignOut}
            onConnectWhoop={() => setAppState('whoop_auth')}
          />
        )}

        {appState === 'main' && userId && activeWorkoutId && (
          <WorkoutScreen
            workoutId={activeWorkoutId}
            onComplete={() => setActiveWorkoutId(null)}
            onBack={() => setActiveWorkoutId(null)}
          />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
