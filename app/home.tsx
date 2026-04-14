import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  DBPdf, DBQuizScore,
  getStreakInfo,
  getStudiedTopicsForUser,
  getUserAnalytics, getUserPdfs,
} from '../database/database';
import { useAuth } from '../hooks/AuthContext';

const { width } = Dimensions.get('window');
const IS_WEB = Platform.OS === 'web';

// Animated stat box with count-up effect
const StatBox = ({ icon, val, label, color, delay = 0 }: { icon: any; val: string; label: string; color: string; delay?: number }) => {
  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, delay, useNativeDriver: true, tension: 80, friction: 6 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.statBox, { borderTopColor: color, transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
      <View style={[styles.statIconRing, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statVal, { color }]}>{val}</Text>
      <Text style={styles.statLab}>{label}</Text>
    </Animated.View>
  );
};

const SidebarItem = ({ icon, label, active, onPress }: { icon: any; label: string; active?: boolean; onPress: () => void }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();

  return (
    <TouchableOpacity onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} activeOpacity={1}>
      <Animated.View style={[styles.menuItem, active && styles.menuItemActive, { transform: [{ scale: scaleAnim }] }]}>
        {active && <View style={styles.menuActiveBar} />}
        <View style={[styles.menuIconWrap, active && styles.menuIconWrapActive]}>
          <Ionicons name={icon} size={18} color={active ? '#fff' : '#9CA3AF'} />
        </View>
        <Text style={[styles.menuText, active && styles.menuTextActive]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const QuickAction = ({ icon, label, gradient, onPress, delay = 0 }: { icon: any; label: string; gradient: string[]; onPress: () => void; delay?: number }) => {
  const translateY = useRef(new Animated.Value(30)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, delay, useNativeDriver: true, tension: 70, friction: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePressIn = () => Animated.spring(scaleAnim, { toValue: 0.94, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();

  return (
    <TouchableOpacity onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} activeOpacity={1} style={{ flex: 1 }}>
      <Animated.View style={[styles.quickCard, { backgroundColor: gradient[0], transform: [{ translateY }, { scale: scaleAnim }], opacity }]}>
        <View style={styles.quickCardInner}>
          <View style={[styles.quickIconBubble, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Ionicons name={icon} size={22} color="#fff" />
          </View>
          <Text style={styles.quickText}>{label}</Text>
          <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.7)" style={{ marginTop: 4 }} />
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

// Pulsing orb for hero background
const PulseOrb = ({ style }: { style: any }) => {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return <Animated.View style={[style, { transform: [{ scale: pulse }] }]} />;
};

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [recentPdfs, setRecentPdfs] = useState<DBPdf[]>([]);
  const [quizHistory, setQuizHistory] = useState<DBQuizScore[]>([]);
  const [stats, setStats] = useState({ pdfs: 0, quizzes: 0, topics: 0, streak: 0, lastStreak: 0 });

  // Hero entrance animation
  const heroAnim = useRef(new Animated.Value(0)).current;
  const sidebarAnim = useRef(new Animated.Value(-260)).current;

  useEffect(() => {
    Animated.spring(heroAnim, { toValue: 1, tension: 55, friction: 7, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (!user) router.replace('/');
  }, [user]);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [pdfs, analytics, topics, s] = await Promise.all([
        getUserPdfs(user.id), getUserAnalytics(user.id),
        getStudiedTopicsForUser(user.id), getStreakInfo(user.id),
      ]);
      setStats({ pdfs: pdfs.length, quizzes: analytics.length, topics: topics.length, streak: s.current, lastStreak: s.lastStreak });
      setRecentPdfs(pdfs.slice(0, 2));
      setQuizHistory([...analytics].reverse().slice(0, 3));
    } catch (e) { console.error(e); }
  }, [user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleMenu = () => {
    if (!IS_WEB) {
      Animated.spring(sidebarAnim, {
        toValue: isMenuOpen ? -260 : 0,
        tension: 80, friction: 9, useNativeDriver: true,
      }).start();
    }
    setIsMenuOpen(!isMenuOpen);
  };

  const handleLogout = () => { logout(); router.replace('/'); };
  if (!user) return null;

  const getTimeGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F7FF" />
      <View style={styles.mainWrapper}>

        {/* OVERLAY */}
        {isMenuOpen && !IS_WEB && (
          <Animated.View style={[styles.overlay]}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={toggleMenu} />
          </Animated.View>
        )}

        {/* SIDEBAR */}
        {(isMenuOpen || IS_WEB) && (
          <Animated.View style={[styles.sidebar, IS_WEB ? styles.sidebarWeb : { transform: [{ translateX: sidebarAnim }] }]}>
            {/* Logo */}
            <View style={styles.logoRow}>
              <View style={styles.logoGradient}>
                <Text style={styles.logoLetter}>E</Text>
              </View>
              <View>
                <Text style={styles.brandName}>Explainify</Text>
                <Text style={styles.brandTagline}>AI</Text>
              </View>
            </View>

            <View style={styles.sidebarDivider} />

            <View style={styles.sidebarTop}>
              <SidebarItem icon="home" label="Dashboard" active onPress={() => setIsMenuOpen(false)} />
              <SidebarItem icon="chatbubbles-outline" label="AI Tutor" onPress={() => { setIsMenuOpen(false); router.push({ pathname: '/learn', params: { mode: 'new' } }); }} />
              <SidebarItem icon="help-circle-outline" label="Quiz" onPress={() => { setIsMenuOpen(false); router.push('/quizSetup'); }} />
              <SidebarItem icon="folder-open-outline" label="Resource Vault" onPress={() => { setIsMenuOpen(false); router.push('/ExplorePage'); }} />
              <SidebarItem icon="analytics-outline" label="My Stats" onPress={() => { setIsMenuOpen(false); router.push('/AnalyticsPage'); }} />
            </View>

            <View style={styles.sidebarBottom}>
              <View style={styles.userCard}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarLetter}>{user.username?.[0]?.toUpperCase() ?? 'U'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{user.username}</Text>
                  <Text style={styles.userRole}>✨ Explainify Scholar</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                <Ionicons name="log-out-outline" size={16} color="#EF4444" />
                <Text style={styles.logoutTxt}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* MAIN CONTENT */}
        <ScrollView
          style={styles.dashboard}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* TOP HEADER */}
          <View style={styles.topHeader}>
            <TouchableOpacity style={styles.menuBtn} onPress={toggleMenu}>
              <Ionicons name={isMenuOpen && !IS_WEB ? 'close' : 'menu-outline'} size={22} color="#1E1B4B" />
            </TouchableOpacity>

            <View style={styles.topRight}>
              {stats.streak > 0 && (
                <Animated.View style={[styles.streakChip, { transform: [{ scale: heroAnim }] }]}>
                  <Text style={styles.streakFire}>🔥</Text>
                  <Text style={styles.streakText}>{stats.streak}d streak</Text>
                </Animated.View>
              )}
              <TouchableOpacity style={styles.settingsBtn} onPress={() => router.push('/settings')}>
                <Ionicons name="settings-outline" size={20} color="#1E1B4B" />
              </TouchableOpacity>
            </View>
          </View>

          {/* STREAK BROKEN */}
          {stats.streak === 0 && stats.lastStreak > 0 && (
            <View style={styles.streakBrokenBanner}>
              <Text style={styles.streakBrokenEmoji}>💔</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.streakBrokenTitle}>Streak lost</Text>
                <Text style={styles.streakBrokenSub}>Last streak: {stats.lastStreak} days · Study today to restart!</Text>
              </View>
            </View>
          )}

          {/* HERO CARD */}
          <Animated.View style={[styles.hero, {
            opacity: heroAnim,
            transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }]
          }]}>
            {/* Decorative orbs */}
            <PulseOrb style={styles.heroOrb1} />
            <PulseOrb style={styles.heroOrb2} />

            <View style={styles.heroContent}>
              <Text style={styles.heroGreeting}>{getTimeGreeting()},</Text>
              <Text style={styles.heroTitle}>{user.username} 👋</Text>
              <Text style={styles.heroSub}>Your offline AI tutor is ready to help you excel.</Text>

              <View style={styles.heroProgressArea}>
                <View style={styles.heroProgressRow}>
                  <Text style={styles.heroProgressLabel}>Today's Progress</Text>
                  <Text style={styles.heroProgressPct}>100%</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <Animated.View style={[styles.progressBarFill, {
                    transform: [{
                      translateX: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [-300, 0] })
                    }],
                  }]} />
                </View>
              </View>

              <TouchableOpacity
                style={styles.heroBtn}
                onPress={() => router.push({ pathname: '/learn', params: { mode: 'new' } })}
                activeOpacity={0.85}
              >
                <Text style={styles.heroBtnText}>Start Learning</Text>
                <Ionicons name="rocket-outline" size={16} color="#5B21B6" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* STATS */}
          <View style={styles.statsRow}>
            <StatBox icon="document-text-outline" val={String(stats.pdfs)} label="PDFs" color="#7C3AED" delay={100} />
            <StatBox icon="library-outline" val={String(stats.topics)} label="Topics" color="#0EA5E9" delay={200} />
            <StatBox icon="trophy-outline" val={String(stats.quizzes)} label="Quizzes" color="#10B981" delay={300} />
          </View>

          {/* QUICK ACTIONS */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.sectionPill}><Text style={styles.sectionPillText}>3 options</Text></View>
          </View>
          <View style={styles.quickRow}>
            <QuickAction icon="chatbubbles-outline" label="AI Tutor" gradient={['#7C3AED', '#5B21B6']} onPress={() => router.push({ pathname: '/learn', params: { mode: 'new' } })} delay={100} />
            <QuickAction icon="help-circle-outline" label="Take Quiz" gradient={['#0EA5E9', '#0284C7']} onPress={() => router.push('/quizSetup')} delay={200} />
            <QuickAction icon="bar-chart-outline" label="My Stats" gradient={['#10B981', '#059669']} onPress={() => router.push('/AnalyticsPage')} delay={300} />
          </View>

          {/* RECENT UPLOADS */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Uploads</Text>
            <TouchableOpacity onPress={() => router.push('/ExplorePage')}>
              <Text style={styles.seeAll}>See all →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.materialsRow}>
            {recentPdfs.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="cloud-upload-outline" size={32} color="#C4B5FD" />
                <Text style={styles.emptyTitle}>No uploads yet</Text>
                <Text style={styles.emptyText}>Head to AI Tutor to upload your first PDF.</Text>
              </View>
            ) : (
              recentPdfs.map((pdf, i) => (
                <TouchableOpacity
                  key={pdf.id}
                  style={[styles.mCard, { backgroundColor: i % 2 === 0 ? '#EEF2FF' : '#F0FDF4' }]}
                  onPress={() => router.push('/ExplorePage')}
                  activeOpacity={0.85}
                >
                  <View style={[styles.pdfIcon, { backgroundColor: i % 2 === 0 ? '#C4B5FD' : '#6EE7B7' }]}>
                    <Ionicons name="document-text" size={18} color={i % 2 === 0 ? '#5B21B6' : '#059669'} />
                  </View>
                  <Text style={styles.mTitle} numberOfLines={2}>{pdf.file_name}</Text>
                  <Text style={[styles.reviewLink, { color: i % 2 === 0 ? '#7C3AED' : '#059669' }]}>Open Vault →</Text>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* QUIZ HISTORY */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Quiz Results</Text>
            <TouchableOpacity onPress={() => router.push('/AnalyticsPage')}>
              <Text style={styles.seeAll}>View all →</Text>
            </TouchableOpacity>
          </View>

          {quizHistory.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="school-outline" size={32} color="#C4B5FD" />
              <Text style={styles.emptyTitle}>No quizzes yet</Text>
              <Text style={styles.emptyText}>Take your first quiz to see results here.</Text>
            </View>
          ) : (
            quizHistory.map((quiz, i) => {
              const pct = Math.round((quiz.score / quiz.total_questions) * 100);
              const barColor = pct >= 80 ? '#10B981' : pct >= 50 ? '#F59E0B' : '#EF4444';
              return (
                <View key={quiz.id} style={styles.quizItem}>
                  <View style={styles.quizScoreCircle}>
                    <Text style={[styles.quizScoreNum, { color: barColor }]}>{pct}%</Text>
                  </View>
                  <View style={styles.quizInfo}>
                    <Text style={styles.quizTopic}>{quiz.topic_name.replace(/_/g, ' ')}</Text>
                    <View style={styles.quizBarBg}>
                      <View style={[styles.quizBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                    </View>
                    <Text style={styles.quizScore}>{quiz.score} / {quiz.total_questions} correct</Text>
                  </View>
                  <TouchableOpacity style={styles.retakeBtn} onPress={() => router.push('/quizSetup')}>
                    <Ionicons name="refresh-outline" size={14} color="#7C3AED" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  mainWrapper: { flex: 1, flexDirection: 'row' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,10,40,0.55)',
    zIndex: 90,
  },

  // SIDEBAR
  sidebar: {
    width: 252,
    backgroundColor: '#1E1B4B',
    padding: 22,
    paddingTop: 32,
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    height: '100%',
    zIndex: 100,
    elevation: 12,
    shadowColor: '#1E1B4B',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
  },
  sidebarWeb: { position: 'relative', elevation: 0, shadowOpacity: 0 },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12 },
  logoGradient: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: '#7C3AED',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8,
  },
  logoLetter: { color: '#fff', fontWeight: '900', fontSize: 20 },
  brandName: { fontSize: 16, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  brandTagline: { fontSize: 10, color: '#A78BFA', letterSpacing: 2, fontWeight: '600' },
  sidebarDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 16 },
  sidebarTop: { flex: 1 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 11, borderRadius: 12, marginBottom: 4,
    overflow: 'hidden',
  },
  menuItemActive: { backgroundColor: 'rgba(124,58,237,0.2)' },
  menuActiveBar: {
    position: 'absolute', left: 0, top: 8, bottom: 8,
    width: 3, backgroundColor: '#7C3AED', borderRadius: 3,
  },
  menuIconWrap: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 10,
  },
  menuIconWrapActive: { backgroundColor: '#7C3AED' },
  menuText: { fontSize: 13, color: '#94A3B8', fontWeight: '500' },
  menuTextActive: { color: '#E9D5FF', fontWeight: '700' },
  sidebarBottom: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 18 },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  avatarCircle: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#7C3AED',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 15 },
  userName: { fontWeight: '700', fontSize: 13, color: '#F1F5F9' },
  userRole: { fontSize: 10, color: '#7C3AED', marginTop: 2, fontWeight: '600' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    padding: 10, borderRadius: 10,
  },
  logoutTxt: { color: '#EF4444', fontWeight: '700', fontSize: 12 },

  // DASHBOARD
  dashboard: { flex: 1 },
  scrollContent: { padding: 18, paddingTop: 8, paddingBottom: 30 },
  topHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20, paddingTop: Platform.OS === 'android' ? 10 : 4,
  },
  menuBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#1E1B4B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  streakChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FEF3C7', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#FDE68A',
  },
  streakFire: { fontSize: 13 },
  streakText: { fontSize: 12, fontWeight: '700', color: '#D97706' },
  settingsBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#1E1B4B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },

  // HERO
  hero: {
    backgroundColor: '#1E1B4B',
    borderRadius: 24, marginBottom: 18,
    overflow: 'hidden',
    minHeight: 190,
  },
  heroOrb1: {
    position: 'absolute', width: 180, height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(124,58,237,0.35)',
    top: -50, right: -40,
  },
  heroOrb2: {
    position: 'absolute', width: 120, height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(14,165,233,0.2)',
    bottom: -30, left: 20,
  },
  heroContent: { padding: 22, paddingBottom: 24 },
  heroGreeting: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '500', marginBottom: 2 },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginBottom: 6 },
  heroSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 18, lineHeight: 19 },
  heroProgressArea: { marginBottom: 18 },
  heroProgressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  heroProgressLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },
  heroProgressPct: { color: '#A78BFA', fontSize: 11, fontWeight: '700' },
  progressBarBg: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, overflow: 'hidden',
  },
  progressBarFill: { height: 6, borderRadius: 8, backgroundColor: '#7C3AED', width: '100%' },
  heroBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', alignSelf: 'flex-start',
    paddingVertical: 10, paddingHorizontal: 18,
    borderRadius: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8,
  },
  heroBtnText: { color: '#5B21B6', fontWeight: '800', fontSize: 13 },

  // STATS
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  statBox: {
    flex: 1, backgroundColor: '#fff', padding: 14, borderRadius: 18,
    alignItems: 'center', borderTopWidth: 3,
    shadowColor: '#1E1B4B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
  },
  statIconRing: {
    width: 36, height: 36, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  statVal: { fontSize: 20, fontWeight: '900', marginBottom: 2 },
  statLab: { fontSize: 10, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.5 },

  // SECTION HEADERS
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1E1B4B', letterSpacing: -0.3 },
  sectionPill: { backgroundColor: '#EDE9FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  sectionPillText: { fontSize: 10, color: '#7C3AED', fontWeight: '700' },
  seeAll: { fontSize: 12, color: '#7C3AED', fontWeight: '700' },

  // QUICK ACTIONS
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  quickCard: {
    borderRadius: 18, padding: 14, minHeight: 110,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 4,
  },
  quickCardInner: { flex: 1, justifyContent: 'space-between' },
  quickIconBubble: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  quickText: { color: '#fff', fontWeight: '800', fontSize: 12, lineHeight: 16 },

  // MATERIALS
  materialsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  mCard: {
    flex: 1, minWidth: '45%', padding: 16, borderRadius: 18, minHeight: 120,
    shadowColor: '#1E1B4B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8,
  },
  pdfIcon: {
    width: 38, height: 38, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  mTitle: { fontWeight: '700', marginTop: 10, fontSize: 12, color: '#1E1B4B', lineHeight: 17 },
  reviewLink: { fontSize: 11, marginTop: 8, fontWeight: '700' },

  // EMPTY STATES
  emptyCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 24,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#EDE9FE', borderStyle: 'dashed',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#1E1B4B', marginTop: 10, marginBottom: 4 },
  emptyText: { color: '#94A3B8', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  // QUIZ ITEMS
  quizItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', padding: 14, borderRadius: 18, marginBottom: 10,
    shadowColor: '#1E1B4B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 1,
  },
  quizScoreCircle: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: '#F8F7FF', justifyContent: 'center', alignItems: 'center',
  },
  quizScoreNum: { fontSize: 14, fontWeight: '900' },
  quizInfo: { flex: 1 },
  quizTopic: { fontWeight: '700', fontSize: 13, color: '#1E1B4B', textTransform: 'capitalize', marginBottom: 6 },
  quizBarBg: { height: 4, backgroundColor: '#F1F5F9', borderRadius: 4, marginBottom: 4, overflow: 'hidden' },
  quizBarFill: { height: 4, borderRadius: 4 },
  quizScore: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  retakeBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center',
  },

  // STREAK BROKEN
  streakBrokenBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF1F2', borderRadius: 18, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#FECDD3',
  },
  streakBrokenEmoji: { fontSize: 28 },
  streakBrokenTitle: { fontSize: 13, fontWeight: '800', color: '#BE123C' },
  streakBrokenSub: { fontSize: 11, color: '#9F1239', marginTop: 2, lineHeight: 16 },
});