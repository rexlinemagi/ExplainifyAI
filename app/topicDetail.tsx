import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../hooks/AuthContext';
import { EngineResult, findExplanation, FuzzySuggestion } from '../scripts/Engine';

export default function TopicDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ topic?: string }>();

  // Always coerce to string — params can be string | string[] on web
  const topicName = Array.isArray(params.topic)
    ? params.topic[0] ?? ''
    : (params.topic ?? '');
  const displayName = topicName.replace(/_/g, ' ').trim();

  // Three states: loading (null), found (EngineResult), not found (false)
  const [result, setResult] = useState<EngineResult | null | false>(null);
  const [fuzzySuggestions, setFuzzySuggestions] = useState<FuzzySuggestion[]>([]);

  useEffect(() => {
    if (!user) { router.replace('/'); return; }
    if (!topicName) { setResult(false); return; }

    const lang = user.preferred_language ?? 'en';

    // Try multiple normalizations: original, underscored, spaced
    const attempts = [
      topicName,
      topicName.replace(/\s+/g, '_'),
      topicName.replace(/_/g, ' '),
      topicName.toLowerCase(),
      topicName.toLowerCase().replace(/\s+/g, '_'),
    ];

    for (const attempt of attempts) {
      const { result: engineResult } = findExplanation(attempt, lang);
      if (engineResult) {
        setResult(engineResult);
        setFuzzySuggestions([]);
        return;
      }
    }

    // Nothing matched — get fuzzy suggestions
    const { suggestions } = findExplanation(topicName, lang);
    setResult(false);
    setFuzzySuggestions(suggestions);
  }, [topicName, user]);

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color="#1E1B4B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {displayName || 'Topic'}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      {/* LOADING */}
      {result === null && (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#7C3AED" />
          <Text style={styles.loadingText}>Loading explanation...</Text>
        </View>
      )}

      {/* NOT FOUND */}
      {result === false && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.notFound}>
            <View style={styles.notFoundIcon}>
              <Ionicons name="search-outline" size={32} color="#C4B5FD" />
            </View>
            <Text style={styles.notFoundTitle}>No explanation found</Text>
            <Text style={styles.notFoundSub}>
              {displayName
                ? `"${displayName}" isn't in the offline database yet.`
                : 'No topic was provided.'}
            </Text>

            {/* Fuzzy suggestions if available */}
            {fuzzySuggestions.length > 0 && (
              <View style={styles.fuzzySection}>
                <Text style={styles.fuzzyLabel}>Did you mean?</Text>
                {fuzzySuggestions.map((s, i) => (
                  <TouchableOpacity
                    key={s.topic}
                    style={[styles.fuzzyBtn, { backgroundColor: FUZZY_COLORS[i % FUZZY_COLORS.length][0], borderColor: FUZZY_COLORS[i % FUZZY_COLORS.length][1] }]}
                    onPress={() => router.push({ pathname: '/topicDetail', params: { topic: s.topic } })}
                  >
                    <Ionicons name="bulb-outline" size={15} color={FUZZY_COLORS[i % FUZZY_COLORS.length][2]} />
                    <Text style={[styles.fuzzyBtnText, { color: FUZZY_COLORS[i % FUZZY_COLORS.length][2] }]}>
                      {s.label}
                    </Text>
                    <Ionicons name="arrow-forward" size={13} color={FUZZY_COLORS[i % FUZZY_COLORS.length][2]} style={{ opacity: 0.6 }} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={styles.labBtn}
              onPress={() => router.push({ pathname: '/learn', params: { mode: 'new' } })}
            >
              <View style={styles.labBtnIcon}>
                <Ionicons name="chatbubbles-outline" size={18} color="#7C3AED" />
              </View>
              <Text style={styles.labBtnText}>Try in AI Tutor</Text>
              <Ionicons name="arrow-forward" size={14} color="#7C3AED" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* FOUND */}
      {result !== null && result !== false && (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Banner */}
          <View style={styles.banner}>
            <View style={styles.bannerIcon}>
              <Ionicons name="book-outline" size={22} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerLabel}>TOPIC</Text>
              <Text style={styles.bannerTopic}>
                {result.topic.replace(/_/g, ' ')}
              </Text>
            </View>
          </View>

          {/* Explanation card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="sparkles" size={14} color="#7C3AED" />
              <Text style={styles.cardHeaderText}>Explanation</Text>
            </View>
            <Text style={styles.explanationText}>{result.response}</Text>
          </View>

          {/* Quiz CTA */}
          {result.quiz && result.quiz.length > 0 && (
            <TouchableOpacity
              style={styles.quizBtn}
              activeOpacity={0.88}
              onPress={() => router.push({
                pathname: '/quiz',
                params: { topic: result.topic, quizData: JSON.stringify(result.quiz) },
              })}
            >
              <View style={styles.quizBtnIcon}>
                <Text style={{ fontSize: 18 }}>🧠</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.quizBtnTitle}>Challenge yourself</Text>
                <Text style={styles.quizBtnSub}>Take a quick quiz on this topic</Text>
              </View>
              <View style={styles.quizStartPill}>
                <Text style={styles.quizStartText}>Start</Text>
                <Ionicons name="play" size={10} color="#fff" />
              </View>
            </TouchableOpacity>
          )}

          {/* Ask more */}
          <TouchableOpacity
            style={styles.labBtn}
            activeOpacity={0.88}
            onPress={() => router.push({ pathname: '/learn', params: { mode: 'new' } })}
          >
            <View style={styles.labBtnIcon}>
              <Ionicons name="chatbubbles-outline" size={18} color="#7C3AED" />
            </View>
            <Text style={styles.labBtnText}>Ask More in AI Tutor</Text>
            <Ionicons name="arrow-forward" size={14} color="#7C3AED" />
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const FUZZY_COLORS: [string, string, string][] = [
  ['#EDE9FE', '#DDD6FE', '#5B21B6'],
  ['#DBEAFE', '#BFDBFE', '#1D4ED8'],
  ['#D1FAE5', '#A7F3D0', '#065F46'],
];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F1FF',
  },

  // HEADER
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'android' ? 42 : 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EDE9FE',
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: '#F8F7FF',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#EDE9FE',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: '#1E1B4B',
    marginHorizontal: 12,
    textTransform: 'capitalize',
  },

  // LOADING
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  loadingText: {
    fontSize: 13,
    color: '#A78BFA',
    fontWeight: '600',
  },

  content: {
    padding: 18,
    paddingBottom: 50,
  },

  // BANNER
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#EDE9FE',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  bannerIcon: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  bannerLabel: {
    fontSize: 10, fontWeight: '800', color: '#A78BFA',
    letterSpacing: 1.5, marginBottom: 3,
  },
  bannerTopic: {
    fontSize: 18, fontWeight: '900', color: '#1E1B4B',
    textTransform: 'capitalize', letterSpacing: -0.3,
  },

  // EXPLANATION CARD
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EDE9FE',
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F1FF',
  },
  cardHeaderText: {
    fontSize: 11, fontWeight: '800', color: '#7C3AED',
    textTransform: 'uppercase', letterSpacing: 1,
  },
  explanationText: {
    fontSize: 15, color: '#374151', lineHeight: 26,
  },

  // QUIZ BUTTON
  quizBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1E1B4B',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
  },
  quizBtnIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  quizBtnTitle: { fontSize: 14, fontWeight: '800', color: '#fff' },
  quizBtnSub: { fontSize: 11, color: '#A78BFA', marginTop: 2, fontWeight: '500' },
  quizStartPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#7C3AED',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 10,
  },
  quizStartText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // ASK MORE / LAB BUTTON
  labBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    marginBottom: 12,
  },
  labBtnIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center', alignItems: 'center',
  },
  labBtnText: { flex: 1, color: '#5B21B6', fontWeight: '700', fontSize: 14 },

  // NOT FOUND
  notFound: {
    alignItems: 'center',
    paddingTop: 48,
    gap: 12,
  },
  notFoundIcon: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  notFoundTitle: { fontSize: 16, fontWeight: '800', color: '#1E1B4B' },
  notFoundSub: {
    fontSize: 13, color: '#94A3B8',
    textAlign: 'center', lineHeight: 20, marginBottom: 4,
  },

  // FUZZY SUGGESTIONS
  fuzzySection: {
    width: '100%',
    gap: 8,
    marginBottom: 8,
  },
  fuzzyLabel: {
    fontSize: 11, fontWeight: '800', color: '#C4B5FD',
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 4,
    textAlign: 'center',
  },
  fuzzyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  fuzzyBtnText: { flex: 1, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
});