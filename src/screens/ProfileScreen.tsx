import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { getUserProfile, getUserGoals, updateUserProfile, updateGoal, signOut } from '../services/supabase';
import type { User, Goal } from '../types';

interface Props {
  userId: string;
  onSignOut: () => void;
  onConnectWhoop: () => void;
}

export default function ProfileScreen({ userId, onSignOut, onConnectWhoop }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editing, setEditing] = useState(false);
  const [currentWeight, setCurrentWeight] = useState('');

  useEffect(() => {
    load();
  }, [userId]);

  async function load() {
    try {
      const [u, g] = await Promise.all([getUserProfile(userId), getUserGoals(userId)]);
      setUser(u);
      setGoals(g);
      setCurrentWeight(u?.current_weight?.toString() ?? '');
    } catch {}
  }

  async function handleSave() {
    if (!user) return;
    try {
      await updateUserProfile(userId, { current_weight: currentWeight ? parseFloat(currentWeight) : null });
      await load();
      setEditing(false);
    } catch (err) {
      Alert.alert('Error', 'Failed to save');
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          await signOut();
          onSignOut();
        }
      },
    ]);
  }

  const whoopConnected = !!user?.whoop_access_token;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      {/* Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <Text style={styles.value}>{user?.email ?? '—'}</Text>
          <View style={styles.divider} />
          <Text style={styles.label}>Goal</Text>
          <Text style={styles.value}>{formatGoal(user?.fitness_goal)}</Text>
          <View style={styles.divider} />
          <Text style={styles.label}>Experience</Text>
          <Text style={styles.value}>{capitalize(user?.experience_level ?? '—')}</Text>
          <View style={styles.divider} />
          <Text style={styles.label}>Workout frequency</Text>
          <Text style={styles.value}>{user?.workout_frequency ?? '—'} days / week</Text>
        </View>
      </View>

      {/* Weight */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Weight</Text>
          {!editing ? (
            <TouchableOpacity onPress={() => setEditing(true)}>
              <Text style={styles.editBtn}>Edit</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={handleSave}>
              <Text style={styles.editBtn}>Save</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.flex1}>
              <Text style={styles.label}>Current</Text>
              {editing ? (
                <TextInput style={styles.input} value={currentWeight} onChangeText={setCurrentWeight} keyboardType="numeric" placeholderTextColor="#64748b" />
              ) : (
                <Text style={styles.value}>{user?.current_weight ? `${user.current_weight} lbs` : '—'}</Text>
              )}
            </View>
            <View style={styles.flex1}>
              <Text style={styles.label}>Target</Text>
              <Text style={styles.value}>{user?.target_weight ? `${user.target_weight} lbs` : '—'}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Goals */}
      {goals.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Goals</Text>
          {goals.map((g) => (
            <View key={g.id} style={styles.goalCard}>
              <Text style={styles.goalDesc}>{g.description}</Text>
              {g.target_value && (
                <View style={styles.progressRow}>
                  <Text style={styles.progressText}>
                    {g.current_value ?? '?'} / {g.target_value} {g.unit}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Whoop */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Whoop</Text>
        <View style={styles.card}>
          <View style={styles.whoopRow}>
            <View>
              <Text style={[styles.value, { color: whoopConnected ? '#22c55e' : '#ef4444' }]}>
                {whoopConnected ? '● Connected' : '● Not connected'}
              </Text>
              <Text style={styles.label}>{whoopConnected ? 'Recovery data syncing' : 'Connect to enable AI workouts'}</Text>
            </View>
            <TouchableOpacity style={styles.whoopBtn} onPress={onConnectWhoop}>
              <Text style={styles.whoopBtnText}>{whoopConnected ? 'Reconnect' : 'Connect'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Injuries */}
      {user?.injuries_limitations && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Injuries / Limitations</Text>
          <View style={styles.card}>
            <Text style={styles.value}>{user.injuries_limitations}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function formatGoal(goal?: string | null): string {
  if (!goal) return '—';
  const map: Record<string, string> = { weight_loss: 'Weight Loss', strength: 'Build Strength', endurance: 'Improve Endurance', general: 'General Fitness' };
  return map[goal] ?? goal;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, paddingTop: 56, paddingBottom: 60 },
  title: { fontSize: 28, fontWeight: '800', color: '#f8fafc', marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#94a3b8', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  editBtn: { color: '#6366f1', fontSize: 15, fontWeight: '600' },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16 },
  label: { fontSize: 12, color: '#64748b', marginBottom: 2 },
  value: { fontSize: 16, color: '#f8fafc', fontWeight: '500', marginBottom: 4 },
  divider: { height: 1, backgroundColor: '#334155', marginVertical: 10 },
  row: { flexDirection: 'row', gap: 16 },
  flex1: { flex: 1 },
  input: { color: '#f8fafc', fontSize: 16, borderBottomWidth: 1, borderBottomColor: '#6366f1', paddingVertical: 4 },
  goalCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, marginBottom: 8 },
  goalDesc: { color: '#f8fafc', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  progressRow: { flexDirection: 'row' },
  progressText: { color: '#64748b', fontSize: 13 },
  whoopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  whoopBtn: { backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  whoopBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  signOutBtn: { backgroundColor: '#1e293b', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#ef4444' },
  signOutText: { color: '#ef4444', fontSize: 16, fontWeight: '700' },
});
