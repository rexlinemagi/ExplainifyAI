import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getStudiedTopicsForUser } from '../database/database';
import { useAuth } from '../hooks/AuthContext';
import { buildCombinedQuiz } from '../scripts/Engine';

const QUESTION_OPTIONS = [5, 10, 15, 20];

export default function QuizSetupScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [topicCount, setTopicCount] = useState(0);
  const [maxAvailable, setMaxAvailable] = useState(0);
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  // Cache topic names so handleStart doesn't need to re-fetch
  const [topicNames, setTopicNames] = useState<string[]>([]);

  useEffect(() => {
    if (!user) { router.replace('/'); return; }

    getStudiedTopicsForUser(user.id).then((topics) => {
      const names = topics.map((t) => t.topic_name);
      setTopicNames(names);
      setTopicCount(names.length);

      if (names.length === 0) {
        setMaxAvailable(0);
        setLoading(false);
        return;
      }

      // Build a dry-run with no limit to count real available questions
      const lang = user.preferred_language ?? 'en';
      const allQuestions = buildCombinedQuiz(names, lang, 999);
      const available = allQuestions.length;
      setMaxAvailable(available);

      // Pre-select the largest option that fits within available questions
      const valid = QUESTION_OPTIONS.filter((n) => n <= available);
      setSelectedCount(valid.length > 0 ? valid[valid.length - 1] : available > 0 ? available : null);
      setLoading(false);
    });
  }, [user]);

  const handleStart = () => {
    if (!user || selectedCount === null) return;
    const lang = user.preferred_language ?? 'en';
    const quiz = buildCombinedQuiz(topicNames, lang, selectedCount);

    router.push({
      pathname: '/quiz',
      params: {
        topic: 'Mixed Topics',
        quizData: JSON.stringify(quiz),
        isCombined: 'true',
      },
    });
  };

  // ── LOADING ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#6200ee" style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  // ── NO TOPICS YET ────────────────────────────────────────────────────
  if (topicCount === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Quiz</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.emptyState}>
          <Ionicons name="book-outline" size={80} color="#DDD" />
          <Text style={styles.emptyTitle}>No topics studied yet!</Text>
          <Text style={styles.emptySub}>
            Head to the AI Lab and study some CS topics first, then come back here.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push({ pathname: '/learn', params: { mode: 'new' } })}
          >
            <Text style={styles.btnText}>Go to AI Lab</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── MAIN UI ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Quiz Setup</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* Info card */}
        <View style={styles.infoCard}>
          <Ionicons name="school" size={36} color="#6200ee" />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.infoTitle}>Combined Topic Quiz</Text>
            <Text style={styles.infoSub}>
              {topicCount} topic{topicCount !== 1 ? 's' : ''} studied
              {' · '}{maxAvailable} question{maxAvailable !== 1 ? 's' : ''} available
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>How many questions?</Text>

        <View style={styles.optionGrid}>
          {QUESTION_OPTIONS.map((n) => {
            const disabled = n > maxAvailable;
            const active = selectedCount === n;
            return (
              <TouchableOpacity
                key={n}
                style={[
                  styles.countBtn,
                  active && styles.countBtnActive,
                  disabled && styles.countBtnDisabled,
                ]}
                onPress={() => !disabled && setSelectedCount(n)}
                disabled={disabled}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.countBtnNum,
                  active && styles.countBtnNumActive,
                  disabled && styles.countBtnNumDisabled,
                ]}>
                  {n}
                </Text>
                <Text style={[
                  styles.countBtnSub,
                  active && { color: 'rgba(255,255,255,0.8)' },
                  disabled && { color: '#CCC' },
                ]}>
                  questions
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Show "all X" option if maxAvailable isn't already one of the presets */}
        {maxAvailable > 0 && !QUESTION_OPTIONS.includes(maxAvailable) && maxAvailable < 20 && (
          <TouchableOpacity
            style={[styles.allBtn, selectedCount === maxAvailable && styles.countBtnActive]}
            onPress={() => setSelectedCount(maxAvailable)}
          >
            <Text style={[styles.allBtnText, selectedCount === maxAvailable && { color: '#fff' }]}>
              All {maxAvailable} questions
            </Text>
          </TouchableOpacity>
        )}

        {selectedCount !== null && (
          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              You'll get <Text style={styles.summaryBold}>{selectedCount} questions</Text> drawn from{' '}
              <Text style={styles.summaryBold}>{topicCount} studied topics</Text> — a mix of
              multiple choice and true/false.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, !selectedCount && styles.primaryBtnDisabled]}
          onPress={handleStart}
          disabled={!selectedCount}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Start Quiz 🚀</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FBFBFF' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: Platform.OS === 'android' ? 40 : 50,
    borderBottomWidth: 1, borderBottomColor: '#EEE', backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  content: { padding: 24, flex: 1 },
  infoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0E7FF', padding: 20, borderRadius: 20, marginBottom: 28,
  },
  infoTitle: { fontSize: 16, fontWeight: 'bold', color: '#1A1A1A' },
  infoSub: { fontSize: 13, color: '#666', marginTop: 3 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 14 },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  countBtn: {
    width: '46%', padding: 20, borderRadius: 18, alignItems: 'center',
    borderWidth: 2, borderColor: '#EEE', backgroundColor: '#fff',
  },
  countBtnActive: { backgroundColor: '#6200ee', borderColor: '#6200ee' },
  countBtnDisabled: { backgroundColor: '#F9F9F9', borderColor: '#F0F0F0' },
  countBtnNum: { fontSize: 28, fontWeight: '900', color: '#1A1A1A' },
  countBtnNumActive: { color: '#fff' },
  countBtnNumDisabled: { color: '#CCC' },
  countBtnSub: { fontSize: 12, color: '#888', marginTop: 2 },
  allBtn: {
    borderWidth: 2, borderColor: '#6200ee', borderRadius: 14,
    paddingVertical: 12, alignItems: 'center', marginBottom: 12,
  },
  allBtnText: { color: '#6200ee', fontWeight: 'bold', fontSize: 14 },
  summary: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#EEE', marginTop: 8, marginBottom: 24,
  },
  summaryText: { fontSize: 14, color: '#555', lineHeight: 21 },
  summaryBold: { fontWeight: 'bold', color: '#6200ee' },
  primaryBtn: {
    backgroundColor: '#6200ee', paddingVertical: 16,
    borderRadius: 16, alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginTop: 20 },
  emptySub: {
    fontSize: 14, color: '#888', textAlign: 'center',
    marginTop: 8, marginBottom: 30, lineHeight: 21,
  },
});
