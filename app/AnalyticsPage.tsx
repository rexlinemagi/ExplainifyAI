import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';
import {
  DBQuizScore,
  DBStudiedTopic,
  getUserAnalytics,
  getUserStreak,
  getStudiedTopicsForUser,
} from '../database/database';
import { useAuth } from '../hooks/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
//  Chart config factory — keeps colours swappable per chart
// ─────────────────────────────────────────────────────────────────────────────
const mkChartCfg = (r: number, g: number, b: number) => ({
  backgroundColor: '#fff',
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  decimalPlaces: 0,
  color: (o = 1) => `rgba(${r},${g},${b},${o})`,
  labelColor: (o = 1) => `rgba(100,100,100,${o})`,
  propsForLabels: { fontSize: 11 },
});

const PIE_COLORS = ['#6200ee', '#03DAC6', '#FF5252', '#FFC107', '#4CAF50', '#2196F3'];

// ─────────────────────────────────────────────────────────────────────────────
//  ChartCard — measures its own inner width and passes it to children
// ─────────────────────────────────────────────────────────────────────────────
const CARD_PADDING = 14; // matches styles.card padding

const ChartCard = ({
  title,
  children,
}: {
  title: string;
  children: (width: number) => React.ReactNode;
}) => {
  const [innerWidth, setInnerWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    // Available width = card width minus left+right padding
    setInnerWidth(e.nativeEvent.layout.width - CARD_PADDING * 2);
  };

  return (
    <View style={styles.card} onLayout={onLayout}>
      <Text style={styles.cardTitle}>{title}</Text>
      {/* Only render chart once we have a real measurement */}
      {innerWidth > 0 && children(innerWidth)}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [streak, setStreak] = useState(0);
  const [studiedTopics, setStudiedTopics] = useState<DBStudiedTopic[]>([]);
  const [quizScores, setQuizScores] = useState<DBQuizScore[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<DBQuizScore[]>([]);
  const [avgAcc, setAvgAcc] = useState(0);

  // Chart data states
  const [lineData, setLineData] = useState({
    labels: ['Q1'],
    datasets: [{ data: [0] }],
  });
  const [pieData, setPieData] = useState<any[]>([]);
  const [barData, setBarData] = useState({
    labels: ['–'],
    datasets: [{ data: [0] }],
  });

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      setLoading(true);

      Promise.all([
        getUserAnalytics(user.id),
        getStudiedTopicsForUser(user.id),
        getUserStreak(user.id),
      ]).then(([scores, topics, s]) => {
        setQuizScores(scores);
        setStudiedTopics(topics);
        setStreak(s);
        setRecentAttempts([...scores].reverse().slice(0, 10));

        if (scores.length > 0) {
          // Average accuracy
          const avg =
            scores.reduce((a, sc) => a + (sc.score / sc.total_questions) * 100, 0) /
            scores.length;
          setAvgAcc(Math.round(avg));

          // Line chart — last 6 attempts as %
          const recent = scores.slice(-6);
          setLineData({
            labels: recent.map((_, i) => `Q${i + 1}`),
            datasets: [
              {
                data: recent.map((sc) =>
                  Math.min(100, Math.round((sc.score / sc.total_questions) * 100)),
                ),
              },
            ],
          });

          // Topic attempt counts
          const topicCounts: Record<string, number> = {};
          scores.forEach((sc) => {
            const k = sc.topic_name.replace(/_/g, ' ');
            topicCounts[k] = (topicCounts[k] || 0) + 1;
          });

          // Pie
          setPieData(
            Object.entries(topicCounts).map(([name, pop], i) => ({
              name,
              population: pop,
              color: PIE_COLORS[i % PIE_COLORS.length],
              legendFontColor: '#666',
              legendFontSize: 11,
            })),
          );

          // Bar — top 4, labels truncated to 5 chars max
          const sorted = Object.entries(topicCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
          setBarData({
            labels: sorted.map(([t]) => (t.length > 6 ? t.slice(0, 5) + '…' : t)),
            datasets: [{ data: sorted.map(([, v]) => v) }],
          });
        }

        setLoading(false);
      });
    }, [user]),
  );

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#6200ee" />
      </View>
    );
  }

  const hasQuizData = quizScores.length > 0;
  const hasTopicData = studiedTopics.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Analytics</Text>
        <TouchableOpacity onPress={() => router.replace('/home')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="home-outline" size={22} color="#333" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>📊 My Analytics</Text>

      {/* ── SUMMARY CHIPS ──────────────────────────────────────────────── */}
      <View style={styles.summaryRow}>
        <SummaryChip icon="flame-outline"  label="Streak"   value={`${streak}🔥`}               color="#E65100" bg="#FFF3E0" />
        <SummaryChip icon="book-outline"   label="Topics"   value={String(studiedTopics.length)} color="#6200ee" bg="#F0E7FF" />
        <SummaryChip icon="school-outline" label="Attempts" value={String(quizScores.length)}    color="#03DAC6" bg="#E0FDF4" />
      </View>

      {hasQuizData && (
        <View style={styles.avgChip}>
          <Ionicons name="trending-up-outline" size={16} color="#FF5252" />
          <Text style={styles.avgChipText}>
            Average Accuracy:{' '}
            <Text style={{ color: '#FF5252', fontWeight: '900' }}>{avgAcc}%</Text>
          </Text>
        </View>
      )}

      {/* ── STUDIED TOPICS ─────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Topics Studied</Text>
      {!hasTopicData ? (
        <EmptyCard text="No topics studied yet. Head to the AI Lab!" />
      ) : (
        <View style={styles.topicsGrid}>
          {studiedTopics.map((t) => (
            <TouchableOpacity
              key={t.topic_name}
              style={styles.topicChip}
              onPress={() =>
                router.push({ pathname: '/topicDetail', params: { topic: t.topic_name } })
              }
            >
              <Text style={styles.topicChipName} numberOfLines={1}>
                {t.topic_name.replace(/_/g, ' ')}
              </Text>
              <View style={styles.topicChipBadge}>
                <Text style={styles.topicChipCount}>{t.study_count}×</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── RECENT ATTEMPTS LIST ───────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Recent Quiz Attempts</Text>
      {!hasQuizData ? (
        <EmptyCard text="No quizzes taken yet. Take a quiz to see your history!" />
      ) : (
        <View style={styles.attemptsCard}>
          {recentAttempts.map((row, i) => {
            const pct = Math.round((row.score / row.total_questions) * 100);
            const color = pct >= 80 ? '#2E7D32' : pct >= 50 ? '#E65100' : '#C62828';
            const bg    = pct >= 80 ? '#E8F5E9' : pct >= 50 ? '#FFF3E0' : '#FFEBEE';
            const isLast = i === recentAttempts.length - 1;
            return (
              <View key={row.id} style={[styles.attemptRow, isLast && styles.attemptRowLast]}>
                <View style={styles.attemptInfo}>
                  <Text style={styles.attemptTopic} numberOfLines={1}>
                    {row.topic_name.replace(/_/g, ' ')}
                  </Text>
                  <Text style={styles.attemptDate}>
                    {new Date(row.attempt_date).toLocaleDateString(undefined, {
                      day: 'numeric', month: 'short', year: 'numeric',
                    })}
                  </Text>
                </View>
                <View style={[styles.attemptScoreBadge, { backgroundColor: bg }]}>
                  <Text style={[styles.attemptScoreText, { color }]}>
                    {row.score}/{row.total_questions}
                  </Text>
                  <Text style={[styles.attemptPct, { color }]}>{pct}%</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── CHARTS ─────────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Quiz Performance Charts</Text>
      {!hasQuizData ? (
        <EmptyCard text="Charts will appear once you've taken some quizzes." />
      ) : (
        <>
          {/* Line chart */}
          <ChartCard title="Accuracy Progression (%)">
            {(w) => (
              <LineChart
                data={lineData}
                width={w}
                height={200}
                yAxisSuffix="%"
                chartConfig={mkChartCfg(98, 0, 238)}
                bezier
                fromZero
                style={styles.chart}
              />
            )}
          </ChartCard>

          {/* Pie chart */}
          <ChartCard title="Topics Quizzed">
            {(w) => (
              <PieChart
                data={pieData}
                width={w}
                height={200}
                chartConfig={{ color: (o = 1) => `rgba(0,0,0,${o})` }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="10"
                absolute
              />
            )}
          </ChartCard>

          {/* Bar chart */}
          <ChartCard title="Attempts per Topic (Top 4)">
            {(w) => (
              <BarChart
                data={barData}
                width={w}
                height={200}
                yAxisLabel=""
                yAxisSuffix=""
                fromZero
                chartConfig={mkChartCfg(3, 218, 198)}
                style={styles.chart}
              />
            )}
          </ChartCard>
        </>
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sub-components
// ─────────────────────────────────────────────────────────────────────────────
const SummaryChip = ({
  icon, label, value, color, bg,
}: {
  icon: any; label: string; value: string; color: string; bg: string;
}) => (
  <View style={[styles.chip, { backgroundColor: bg, borderColor: color }]}>
    <Ionicons name={icon} size={15} color={color} />
    <Text style={[styles.chipValue, { color }]}>{value}</Text>
    <Text style={styles.chipLabel}>{label}</Text>
  </View>
);

const EmptyCard = ({ text }: { text: string }) => (
  <View style={styles.emptyCard}>
    <Text style={styles.emptyText}>{text}</Text>
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
//  Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FBFBFF' },
  safeArea: { flex: 1, backgroundColor: '#FBFBFF' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    paddingTop: Platform.OS === 'android' ? 40 : 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#EEE',
  },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: '#1A1A1A' },
  container: { flex: 1, backgroundColor: '#FBFBFF' },
  content: { padding: 20, paddingBottom: 50 },
  title: { fontSize: 26, fontWeight: '900', color: '#1A1A1A', marginBottom: 18 },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: {
    flex: 1, borderRadius: 14, padding: 10, alignItems: 'center',
    borderWidth: 1.5, gap: 3,
  },
  chipValue: { fontSize: 17, fontWeight: '900' },
  chipLabel: { fontSize: 10, color: '#777', textAlign: 'center' },

  avgChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#FFEBEE', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 16, marginBottom: 4,
  },
  avgChipText: { fontSize: 14, color: '#555' },

  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 22, marginBottom: 12 },

  topicsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  topicChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: '#EEE',
  },
  topicChipName: { fontSize: 13, color: '#333', fontWeight: '600', maxWidth: 110 },
  topicChipBadge: { backgroundColor: '#F0E7FF', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  topicChipCount: { fontSize: 11, color: '#6200ee', fontWeight: 'bold' },

  attemptsCard: {
    backgroundColor: '#fff', borderRadius: 18,
    borderWidth: 1, borderColor: '#EEE', overflow: 'hidden', marginBottom: 4,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 5,
  },
  attemptRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5', gap: 12,
  },
  attemptRowLast: { borderBottomWidth: 0 },
  attemptInfo: { flex: 1 },
  attemptTopic: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', textTransform: 'capitalize' },
  attemptDate: { fontSize: 11, color: '#aaa', marginTop: 2 },
  attemptScoreBadge: { alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  attemptScoreText: { fontSize: 14, fontWeight: '900' },
  attemptPct: { fontSize: 10, fontWeight: '600', marginTop: 1 },

  // ── Chart card — CARD_PADDING must match the padding value below ──────
  card: {
    backgroundColor: '#fff',
    padding: CARD_PADDING,        // ← must equal the CARD_PADDING constant above
    borderRadius: 18,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    overflow: 'hidden',           // clips any chart that still tries to peek out
  },
  cardTitle: { fontWeight: 'bold', fontSize: 14, color: '#333', marginBottom: 12 },
  chart: { borderRadius: 10, alignSelf: 'center' },

  emptyCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20,
    borderWidth: 1, borderColor: '#EEE', marginBottom: 10,
  },
  emptyText: { color: '#999', fontSize: 13, textAlign: 'center' },
});
