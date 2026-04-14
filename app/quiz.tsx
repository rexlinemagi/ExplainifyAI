import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { saveQuizScore } from '../database/database';
import { useAuth } from '../hooks/AuthContext';
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface QuizQuestion {
  q: string;
  translatedQ?: string;
  options: string[];
  correct: number;
  type?: 'mcq' | 'tf';
  topicLabel?: string;
}
interface TopicTally { correct: number; total: number; }

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TIMER_MCQ     = 30;
const TIMER_TF      = 15;
const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const XP_PER_CORRECT = 10;

const CONFETTI_COLORS = [
  '#FF6B6B','#FFD93D','#6BCB77','#4D96FF',
  '#FF9F1C','#C77DFF','#00C48C','#FF6FD8',
];

const getMotivation = (streak: number, isCorrect: boolean): string | null => {
  if (!isCorrect) {
    if (streak >= 3) return '💭 Keep going, you had a great run!';
    if (streak >= 1) return '💪 Almost — keep pushing!';
    return null;
  }
  if (streak === 2) return '🔥 On a streak!';
  if (streak === 3) return '⚡ Three in a row!';
  if (streak > 3)   return `🚀 Unstoppable! ${streak} in a row!`;
  return '✅ Correct!';
};

// ─────────────────────────────────────────────────────────────────────────────
// Confetti hook
// ─────────────────────────────────────────────────────────────────────────────
interface ConfettiParticle {
  id: number;
  x: Animated.Value;
  y: Animated.Value;
  rotate: Animated.Value;
  opacity: Animated.Value;
  color: string;
  size: number;
  shape: 'rect' | 'circle';
}

function useConfetti() {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  const idRef = useRef(0);

  const burst = (originX: number, originY: number) => {
    const newParticles: ConfettiParticle[] = Array.from({ length: 22 }, () => {
      const x   = new Animated.Value(originX);
      const y   = new Animated.Value(originY);
      const rot = new Animated.Value(0);
      const opa = new Animated.Value(1);
      const id  = idRef.current++;

      const angle = (Math.random() * 360 * Math.PI) / 180;
      const speed = 80 + Math.random() * 160;
      const destX = originX + Math.cos(angle) * speed;
      const destY = originY + Math.sin(angle) * speed - 60;

      Animated.parallel([
        Animated.timing(x,   { toValue: destX,              duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(y,   { toValue: destY + 120,         duration: 700, easing: Easing.in(Easing.quad),  useNativeDriver: true }),
        Animated.timing(rot, { toValue: Math.random() * 6 - 3, duration: 700, useNativeDriver: true }),
        Animated.sequence([
          Animated.delay(400),
          Animated.timing(opa, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start(() => setParticles(p => p.filter(pp => pp.id !== id)));

      return {
        id, x, y, rotate: rot, opacity: opa,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size:  5 + Math.random() * 8,
        shape: (Math.random() > 0.5 ? 'rect' : 'circle') as 'rect' | 'circle',
      };
    });

    setParticles(p => [...p, ...newParticles]);
  };

  return { particles, burst };
}

// ─────────────────────────────────────────────────────────────────────────────
// XP Floater hook
// ─────────────────────────────────────────────────────────────────────────────
interface XPFloater { id: number; y: Animated.Value; opacity: Animated.Value; xp: number; }

function useXPFloaters() {
  const [floaters, setFloaters] = useState<XPFloater[]>([]);
  const idRef = useRef(0);

  const pop = (xp: number) => {
    const id  = idRef.current++;
    const y   = new Animated.Value(0);
    const opa = new Animated.Value(1);

    Animated.parallel([
      Animated.timing(y,   { toValue: -70, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(opa, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start(() => setFloaters(f => f.filter(ff => ff.id !== id)));

    setFloaters(f => [...f, { id, y, opacity: opa, xp }]);
  };

  return { floaters, pop };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export default function QuizScreen() {
  const router   = useRouter();
  const { user } = useAuth();
  const params   = useLocalSearchParams<{ topic?: string; quizData?: string; isCombined?: string; }>();

  const topicTitle = params.topic ?? 'Quiz';
  const isCombined = params.isCombined === 'true';

  const [quizData,       setQuizData]       = useState<QuizQuestion[]>([]);
  const [currentStep,    setCurrentStep]    = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isFinished,     setIsFinished]     = useState(false);
  const [parseError,     setParseError]     = useState(false);

  const scoreRef = useRef(0);
  const xpRef    = useRef(0);
  const [scoreDisplay, setScoreDisplay] = useState(0);
  const [xpDisplay,    setXpDisplay]    = useState(0);

  const topicTallyRef = useRef<Record<string, TopicTally>>({});
  const [topicResults, setTopicResults] = useState<{ label: string; correct: number; total: number }[]>([]);

  const [timeLeft,   setTimeLeft]   = useState(TIMER_MCQ);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerBarAnim = useRef(new Animated.Value(1)).current;

  const radius = 22;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;

  const animatedStroke = timerBarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const [motivationMsg,    setMotivationMsg]    = useState<string | null>(null);
  const motivationOpacity = useRef(new Animated.Value(0)).current;
  const motivationScale   = useRef(new Animated.Value(0.7)).current;
  const streakRef = useRef(0);

  const cardSlideAnim   = useRef(new Animated.Value(50)).current;
  const cardOpacityAnim = useRef(new Animated.Value(0)).current;
  const shakeAnim       = useRef(new Animated.Value(0)).current;
  const scoreBounce     = useRef(new Animated.Value(1)).current;
  const flameScale      = useRef(new Animated.Value(1)).current;

  const { particles, burst } = useConfetti();
  const { floaters, pop }    = useXPFloaters();
  const optionBtnYRef        = useRef<number>(420);

  // ── Streaming streak value to state for render ─────────────────────────────
  const [streakDisplay, setStreakDisplay] = useState(0);

  useEffect(() => { if (!user) router.replace('/'); }, [user]);

  useEffect(() => {
    if (!params.quizData) return;
    try {
      const parsed: QuizQuestion[] = JSON.parse(params.quizData);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('empty');
      setQuizData(parsed);
      if (params.isCombined === 'true') {
        const tally: Record<string, TopicTally> = {};
        parsed.forEach(q => {
          const key = q.topicLabel ?? 'Unknown';
          if (!tally[key]) tally[key] = { correct: 0, total: 0 };
          tally[key].total += 1;
        });
        topicTallyRef.current = tally;
      }
    } catch { setParseError(true); }
  }, [params.quizData]);

  useEffect(() => {
    if (quizData.length === 0 || isFinished) return;

    cardSlideAnim.setValue(50);
    cardOpacityAnim.setValue(0);
    Animated.parallel([
      Animated.spring(cardSlideAnim,   { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      Animated.timing(cardOpacityAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();

    const current  = quizData[currentStep];
    const duration = current?.type === 'tf' ? TIMER_TF : TIMER_MCQ;

    setTimeLeft(duration);
    setSelectedOption(null);

    timerBarAnim.setValue(1);
    Animated.timing(timerBarAnim, {
      toValue: 0, duration: duration * 1000, useNativeDriver: false,
    }).start();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current!); handleAnswer(-1, true); return 0; }
        return prev - 1;
      });
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, quizData.length]);

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue:  12, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:   9, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  -9, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:   5, duration: 35, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:   0, duration: 35, useNativeDriver: true }),
    ]).start();
  };

  const triggerScoreBounce = () => {
    scoreBounce.setValue(1);
    Animated.sequence([
      Animated.spring(scoreBounce, { toValue: 1.5, tension: 200, friction: 4, useNativeDriver: true }),
      Animated.spring(scoreBounce, { toValue: 1,   tension: 200, friction: 6, useNativeDriver: true }),
    ]).start();
  };

  const triggerFlameGrow = (streak: number) => {
    const target = Math.min(1 + streak * 0.14, 2.0);
    Animated.spring(flameScale, { toValue: target, tension: 120, friction: 5, useNativeDriver: true }).start();
  };

  const showMotivation = (msg: string) => {
    setMotivationMsg(msg);
    motivationOpacity.setValue(0);
    motivationScale.setValue(0.7);
    Animated.parallel([
      Animated.spring(motivationScale,   { toValue: 1, tension: 180, friction: 7, useNativeDriver: true }),
      Animated.timing(motivationOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      Animated.sequence([
        Animated.delay(1300),
        Animated.timing(motivationOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setMotivationMsg(null));
    });
  };

  const handleAnswer = (index: number, timedOut = false) => {
    if (selectedOption !== null || quizData.length === 0) return;

    if (timerRef.current) clearInterval(timerRef.current);
    timerBarAnim.stopAnimation();

    setSelectedOption(timedOut ? -1 : index);

    const question  = quizData[currentStep];
    const isCorrect = !timedOut && index === question.correct;

    if (isCorrect) {
      scoreRef.current += 1;
      xpRef.current    += XP_PER_CORRECT;
      setScoreDisplay(scoreRef.current);
      setXpDisplay(xpRef.current);
      streakRef.current += 1;
      setStreakDisplay(streakRef.current);

      if (isCombined && question.topicLabel) {
        const key = question.topicLabel;
        if (topicTallyRef.current[key]) topicTallyRef.current[key].correct += 1;
      }

      burst(180, optionBtnYRef.current);
      pop(XP_PER_CORRECT);
      triggerScoreBounce();
      triggerFlameGrow(streakRef.current);
    } else {
      streakRef.current = 0;
      setStreakDisplay(0);
      triggerShake();
      flameScale.setValue(1);
    }

    const msg = timedOut
      ? "⏰ Time's up!"
      : getMotivation(streakRef.current, isCorrect);
    if (msg) showMotivation(msg);

    setTimeout(() => {
      if (currentStep < quizData.length - 1) {
        setCurrentStep(s => s + 1);
      } else {
        if (user) {
          if (isCombined) {
            Object.entries(topicTallyRef.current).forEach(([label, tally]) => {
              saveQuizScore(user.id, label, tally.correct, tally.total);
            });
          } else {
            saveQuizScore(user.id, topicTitle, scoreRef.current, quizData.length);
          }
        }
        if (isCombined) {
          setTopicResults(
            Object.entries(topicTallyRef.current).map(([label, t]) => ({
              label, correct: t.correct, total: t.total,
            }))
          );
        }
        setIsFinished(true);
      }
    }, timedOut ? 600 : 1050);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ERROR / LOADING
  // ─────────────────────────────────────────────────────────────────────────
  if (parseError || (!params.quizData && quizData.length === 0)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredWrapper}>
          <View style={styles.errorCard}>
            <Text style={styles.errorIcon}>😵</Text>
            <Text style={styles.errorTitle}>No Quiz Data</Text>
            <Text style={styles.errorSub}>Go to the AI Lab, study a topic, and tap the quiz card.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/learn')} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>← Back to AI Lab</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (quizData.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredWrapper}>
          <View style={styles.errorCard}>
            <Text style={styles.loadingEmoji}>⚡</Text>
            <Text style={styles.loadingText}>Loading quiz…</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FINISHED
  // ─────────────────────────────────────────────────────────────────────────
  if (isFinished) {
    const pct      = Math.round((scoreRef.current / quizData.length) * 100);
    const emoji    = pct >= 80 ? '🏆' : pct >= 50 ? '🎯' : '💪';
    const message  = pct >= 80 ? 'You crushed it!' : pct >= 50 ? 'Solid effort!' : 'Keep grinding!';
    const subMsg   = pct >= 80 ? 'Absolutely legendary.' : pct >= 50 ? 'Getting better every day.' : 'Every mistake is a lesson.';
    const ringColor = pct >= 80 ? '#00C48C' : pct >= 50 ? '#FF9F43' : '#FF6B6B';

    return (
      <SafeAreaView style={styles.finishSafe}>
        <ScrollView contentContainerStyle={styles.finishScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.finishHero}>
            <View style={[styles.finishEmojiOuter, { borderColor: ringColor + '35', backgroundColor: ringColor + '12' }]}>
              <View style={[styles.finishEmojiInner, { borderColor: ringColor + '60' }]}>
                <Text style={styles.finishEmoji}>{emoji}</Text>
              </View>
            </View>
            <Text style={styles.finishMessage}>{message}</Text>
            <Text style={styles.finishSubMsg}>{subMsg}</Text>

            <View style={[styles.finishScoreStrip, { borderColor: ringColor + '40' }]}>
              <View style={styles.finishStatBlock}>
                <Text style={[styles.finishStatNum, { color: ringColor }]}>{scoreRef.current}/{quizData.length}</Text>
                <Text style={styles.finishStatLabel}>Correct</Text>
              </View>
              <View style={styles.finishStatDivider} />
              <View style={styles.finishStatBlock}>
                <Text style={[styles.finishStatNum, { color: '#7C5CBF' }]}>{pct}%</Text>
                <Text style={styles.finishStatLabel}>Accuracy</Text>
              </View>
              <View style={styles.finishStatDivider} />
              <View style={styles.finishStatBlock}>
                <Text style={[styles.finishStatNum, { color: '#FF9F43' }]}>{xpRef.current}</Text>
                <Text style={styles.finishStatLabel}>XP earned</Text>
              </View>
            </View>
          </View>

          {!isCombined && (
            <View style={styles.topicPillFinish}>
              <Text style={styles.topicPillEmoji}>📚</Text>
              <Text style={styles.topicPillText} numberOfLines={1}>{topicTitle.replace(/_/g, ' ')}</Text>
            </View>
          )}

          {isCombined && topicResults.length > 0 && (
            <View style={styles.breakdownCard}>
              <Text style={styles.breakdownTitle}>📊  Topic Breakdown</Text>
              {topicResults
                .sort((a, b) => b.correct / b.total - a.correct / a.total)
                .map(t => {
                  const tPct  = Math.round((t.correct / t.total) * 100);
                  const color = tPct >= 80 ? '#00C48C' : tPct >= 50 ? '#FF9F43' : '#FF6B6B';
                  return (
                    <View key={t.label} style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel} numberOfLines={1}>{t.label}</Text>
                      <View style={styles.breakdownRight}>
                        <View style={styles.breakdownBarBg}>
                          <View style={[styles.breakdownBarFill, { width: `${tPct}%` as any, backgroundColor: color }]} />
                        </View>
                        <Text style={[styles.breakdownScore, { color }]}>{t.correct}/{t.total}</Text>
                      </View>
                    </View>
                  );
                })}
            </View>
          )}

          <View style={styles.finishBtns}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/AnalyticsPage')} activeOpacity={0.85}>
              <Text style={styles.primaryBtnText}>📈  View Progress</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghostBtn} onPress={() => router.replace('/quizSetup')} activeOpacity={0.85}>
              <Text style={styles.ghostBtnText}>🔁  Try Another Quiz</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ACTIVE QUIZ
  // ─────────────────────────────────────────────────────────────────────────
  const current     = quizData[currentStep];
  const progress    = ((currentStep + 1) / quizData.length) * 100;
  const timerUrgent = timeLeft <= 5;
  const timerWarn   = timeLeft <= 10 && !timerUrgent;
  const timerColor  = timerUrgent ? '#FF4757' : timerWarn ? '#FF9F43' : '#7C5CBF';
  const isEnglish   = !current.translatedQ;
  const isTF        = current.type === 'tf';
  const showFlame   = streakDisplay >= 2;

  return (
    <SafeAreaView style={styles.safeArea}>

      {/* ── CONFETTI + XP FLOATER LAYER ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {particles.map(p => (
          <Animated.View
            key={p.id}
            style={{
              position: 'absolute',
              width:  p.size,
              height: p.shape === 'rect' ? p.size * 0.5 : p.size,
              borderRadius: p.shape === 'circle' ? p.size : 2,
              backgroundColor: p.color,
              transform: [
                { translateX: p.x },
                { translateY: p.y },
                {
                  rotate: p.rotate.interpolate({
                    inputRange:  [-3, 3],
                    outputRange: ['-180deg', '180deg'],
                  }),
                },
              ],
              opacity: p.opacity,
            }}
          />
        ))}
        {floaters.map(f => (
          <Animated.View
            key={f.id}
            style={[
              styles.xpFloater,
              { transform: [{ translateX: -14 }, { translateY: f.y }], opacity: f.opacity },
            ]}
          >
            <Text style={styles.xpFloaterText}>+{f.xp} XP ⚡</Text>
          </Animated.View>
        ))}
      </View>

      {/* ── TOP BAR ── */}
      <Animated.View style={[styles.topBar, { transform: [{ translateX: shakeAnim }] }]}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="close" size={18} color="#666" />
        </TouchableOpacity>

        <View style={styles.topBarCenter}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {isCombined ? '🎮 Mixed Quiz' : `🎮 ${topicTitle.replace(/_/g, ' ')}`}
          </Text>
        </View>

        <View style={styles.topBarRight}>
          {showFlame && (
            <Animated.View style={[styles.flameBadge, { transform: [{ scale: flameScale }] }]}>
              <Text style={styles.flameEmoji}>{streakDisplay >= 5 ? '🔥🔥' : '🔥'}</Text>
              <Text style={styles.flameCount}>{streakDisplay}</Text>
            </Animated.View>
          )}
          <Animated.View style={[styles.scoreBadge, { transform: [{ scale: scoreBounce }] }]}>
            <Text style={styles.scoreBadgeText}>⭐ {scoreDisplay}</Text>
          </Animated.View>
        </View>
      </Animated.View>

      {/* ── PROGRESS ── */}
      <View style={styles.progressSection}>
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>
            <Text style={styles.progressCurrent}>{currentStep + 1}</Text>
            <Text style={styles.progressTotal}> / {quizData.length}</Text>
          </Text>
          <Text style={styles.xpLabel}>⚡ {xpDisplay} XP</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]}>
            <View style={styles.progressShine} />
          </View>
        </View>
      </View>

      <View style={styles.timerCircleWrapper}>
      <Svg width={60} height={60}>
        {/* Background */}
        <Circle
          stroke="#E2DFF5"
          fill="none"
          cx="30"
          cy="30"
          r={radius}
          strokeWidth={strokeWidth}
        />

        {/* Animated ring */}
        <AnimatedCircle
          stroke={timerColor}
          fill="none"
          cx="30"
          cy="30"
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference}`}
          strokeDashoffset={animatedStroke}
          strokeLinecap="round"
          rotation="-90"
          origin="30,30"
        />
      </Svg>

      <Text style={[styles.timerCircleText, { color: timerColor }]}>
        {timeLeft}
      </Text>
    </View>

      {/* ── QUESTION CARD ── */}
      <Animated.View
        style={[
          styles.quizCard,
          {
            transform: [
              { translateY: cardSlideAnim },
              { translateX: shakeAnim },
            ],
            opacity: cardOpacityAnim,
          },
        ]}
      >
        <View style={styles.cardTopRow}>
          <View style={[styles.typeBadge, isTF ? styles.typeBadgeTF : styles.typeBadgeMCQ]}>
            <Text style={[styles.typeBadgeText, { color: isTF ? '#0A8A6A' : '#5B3FB5' }]}>
              {isTF ? '◆ True / False' : '◆ Multiple Choice'}
            </Text>
          </View>
          {current.topicLabel && (
            <Text style={styles.inlineTopicChip} numberOfLines={1}>{current.topicLabel}</Text>
          )}
        </View>

        <Text style={styles.questionText}>{current.q}</Text>
        {!isEnglish && (
          <Text style={styles.questionTranslated}>{current.translatedQ}</Text>
        )}

        {motivationMsg && (
          <Animated.View
            style={[
              styles.motivationBanner,
              { opacity: motivationOpacity, transform: [{ scale: motivationScale }] },
            ]}
          >
            <Text style={styles.motivationText}>{motivationMsg}</Text>
          </Animated.View>
        )}
      </Animated.View>

      {/* ── OPTIONS ── */}
      <View
        style={styles.optionsList}
        onLayout={e => { optionBtnYRef.current = e.nativeEvent.layout.y + 30; }}
      >
        {current.options.map((option, index) => {
          const isSelected = selectedOption === index;
          const isCorrect  = index === current.correct;
          const revealed   = selectedOption !== null;

          const containerStyles: ViewStyle[] = [styles.optionBtn];
          if (revealed) {
            if (isCorrect)               containerStyles.push(styles.optionCorrect as ViewStyle);
            else if (isSelected)         containerStyles.push(styles.optionWrong   as ViewStyle);
            else                         containerStyles.push(styles.optionDimmed  as ViewStyle);
          }

          return (
            <TouchableOpacity
              key={index}
              style={containerStyles}
              onPress={() => handleAnswer(index)}
              disabled={selectedOption !== null}
              activeOpacity={0.78}
            >
              <View style={[
                styles.optionLetter,
                revealed && isCorrect            ? styles.optionLetterCorrect :
                revealed && isSelected           ? styles.optionLetterWrong   :
                revealed                         ? styles.optionLetterDimmed  :
                                                   styles.optionLetterDefault,
              ]}>
                {revealed && isCorrect ? (
                  <Ionicons name="checkmark" size={15} color="#fff" />
                ) : revealed && isSelected && !isCorrect ? (
                  <Ionicons name="close" size={15} color="#fff" />
                ) : (
                  <Text style={[
                    styles.optionLetterText,
                    revealed && !isCorrect && !isSelected ? { color: '#CCC' } : {},
                  ]}>
                    {OPTION_LABELS[index] ?? index + 1}
                  </Text>
                )}
              </View>

              <Text style={[
                styles.optionLabel,
                revealed && isCorrect                 ? styles.optionLabelCorrect :
                revealed && isSelected && !isCorrect  ? styles.optionLabelWrong   :
                revealed && !isCorrect && !isSelected ? styles.optionLabelDimmed  : {},
              ]}>
                {option}
              </Text>

              {revealed && isCorrect && (
                <Ionicons name="checkmark-circle" size={22} color="#00C48C" style={styles.optionRightIcon} />
              )}
              {revealed && isSelected && !isCorrect && (
                <Ionicons name="close-circle" size={22} color="#FF4757" style={styles.optionRightIcon} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor: '#F0EDF8',
    paddingHorizontal: 16,
    paddingTop: 6,
  },

  // TOP BAR
  topBar: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 16, marginTop: 4, gap: 8,
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#E7E3F5',
    alignItems: 'center', justifyContent: 'center',
  },
  topBarCenter: { flex: 1, alignItems: 'center' },
  topBarTitle:  { fontSize: 14, fontWeight: '800', color: '#1C1340', letterSpacing: 0.3 },
  topBarRight:  { flexDirection: 'row', alignItems: 'center', gap: 7 },
  flameBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 9, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#FFB74D',
  },
  flameEmoji: { fontSize: 14 },
  flameCount: { fontSize: 12, fontWeight: '900', color: '#E65100' },
  scoreBadge: {
    backgroundColor: '#EDE9FF',
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1.5, borderColor: '#C5B8EE',
  },
  scoreBadgeText: { fontSize: 12, fontWeight: '900', color: '#5B3FB5' },

  // XP FLOATER
  xpFloater: {
    position: 'absolute', top: 110, right: 26,
    backgroundColor: '#FFD93D',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 30,
    shadowColor: '#FFD93D', shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },
  xpFloaterText: { fontSize: 13, fontWeight: '900', color: '#7A4F00' },

  // PROGRESS
  progressSection: { marginBottom: 8 },
  progressRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  progressLabel:   {},
  progressCurrent: { fontSize: 16, fontWeight: '900', color: '#5B3FB5' },
  progressTotal:   { fontSize: 13, fontWeight: '500', color: '#AAA' },
  xpLabel:         { fontSize: 12, fontWeight: '800', color: '#C4931A' },
  progressTrack: {
    height: 10, backgroundColor: '#E2DFF5',
    borderRadius: 10, overflow: 'hidden',
  },
  progressFill: {
    height: 10, borderRadius: 10,
    backgroundColor: '#7C5CBF', overflow: 'hidden',
  },
  progressShine: {
    position: 'absolute', top: 2, left: 8,
    width: 28, height: 3, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },

  // TIMER
  timerSection: {
    height: 7, backgroundColor: '#E2DFF5',
    borderRadius: 10, overflow: 'hidden',
    marginBottom: 16, position: 'relative',
  },
  timerFill:  { height: 7, borderRadius: 10 },
  timerCount: {
    position: 'absolute', right: 0, top: -19,
    fontSize: 11, fontWeight: '900',
  },

  timerCircleWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  timerCircleText: {
    position: 'absolute',
    fontSize: 14,
    fontWeight: '900',
  },

  // QUIZ CARD
  quizCard: {
    backgroundColor: '#fff', borderRadius: 24,
    padding: 20, marginBottom: 14,
    shadowColor: '#5B3FB5',
    shadowOpacity: 0.13, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
    borderWidth: 1, borderColor: '#EAE6F8',
  },
  cardTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  typeBadge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 30 },
  typeBadgeMCQ: { backgroundColor: '#EDE9FF' },
  typeBadgeTF:  { backgroundColor: '#D6F5EE' },
  typeBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  inlineTopicChip: {
    fontSize: 11, color: '#B0A0DC',
    fontStyle: 'italic', maxWidth: 130, textAlign: 'right',
  },
  questionText: {
    fontSize: 19, fontWeight: '800', color: '#1C1340',
    lineHeight: 28, letterSpacing: -0.2,
  },
  questionTranslated: {
    fontSize: 14, color: '#999', fontStyle: 'italic',
    lineHeight: 21, marginTop: 8,
  },
  motivationBanner: {
    marginTop: 14, alignSelf: 'flex-start',
    backgroundColor: '#FFF8E7',
    borderRadius: 30, paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1.5, borderColor: '#FFD93D',
  },
  motivationText: { fontSize: 13, fontWeight: '800', color: '#8A6200' },

  // OPTIONS
  optionsList: { gap: 10 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 18, backgroundColor: '#fff',
    borderWidth: 2, borderColor: '#E8E3F5',
    shadowColor: '#5B3FB5',
    shadowOpacity: 0.07, shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  } as ViewStyle,
  optionCorrect: {
    backgroundColor: '#EDFAF4', borderColor: '#00C48C',
    shadowColor: '#00C48C', shadowOpacity: 0.2,
  } as ViewStyle,
  optionWrong: {
    backgroundColor: '#FFF0F1', borderColor: '#FF4757',
    shadowColor: '#FF4757', shadowOpacity: 0.2,
  } as ViewStyle,
  optionDimmed: {
    backgroundColor: '#FAFAFA', borderColor: '#F0EEF5',
    shadowOpacity: 0, elevation: 0,
  } as ViewStyle,
  optionLetter: {
    width: 34, height: 34, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  optionLetterDefault: { backgroundColor: '#EDE9FF' },
  optionLetterCorrect: { backgroundColor: '#00C48C' },
  optionLetterWrong:   { backgroundColor: '#FF4757' },
  optionLetterDimmed:  { backgroundColor: '#F0EEF5' },
  optionLetterText:    { fontSize: 13, fontWeight: '900', color: '#5B3FB5' },
  optionLabel: {
    fontSize: 15, fontWeight: '600', color: '#2A1F50',
    flex: 1, lineHeight: 21,
  },
  optionLabelCorrect: { color: '#006B4F', fontWeight: '700' },
  optionLabelWrong:   { color: '#B0001A', fontWeight: '700' },
  optionLabelDimmed:  { color: '#C0B8D8' },
  optionRightIcon:    { marginLeft: 4 },

  // FINISHED
  finishSafe:   { flex: 1, backgroundColor: '#F0EDF8' },
  finishScroll: {
    paddingHorizontal: 20, paddingTop: 44,
    paddingBottom: 60, alignItems: 'center',
  },
  finishHero:       { alignItems: 'center', marginBottom: 20, width: '100%' },
  finishEmojiOuter: {
    width: 130, height: 130, borderRadius: 65,
    borderWidth: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  finishEmojiInner: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 5, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  finishEmoji:   { fontSize: 46 },
  finishMessage: { fontSize: 28, fontWeight: '900', color: '#1C1340', letterSpacing: -0.5, marginBottom: 6 },
  finishSubMsg:  { fontSize: 14, color: '#999', marginBottom: 22 },
  finishScoreStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 22, borderWidth: 1.5,
    width: '100%', paddingVertical: 18, paddingHorizontal: 20,
    shadowColor: '#5B3FB5', shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  finishStatBlock:   { flex: 1, alignItems: 'center', gap: 2 },
  finishStatNum:     { fontSize: 26, fontWeight: '900' },
  finishStatLabel:   { fontSize: 11, color: '#AAA', fontWeight: '600' },
  finishStatDivider: { width: 1, height: 40, backgroundColor: '#EEE' },
  topicPillFinish: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#EDE9FF', paddingHorizontal: 14,
    paddingVertical: 7, borderRadius: 30, marginBottom: 20,
    borderWidth: 1, borderColor: '#C5B8EE',
  },
  topicPillEmoji: { fontSize: 13 },
  topicPillText:  { fontSize: 12, color: '#5B3FB5', fontWeight: '800', maxWidth: 200 },
  breakdownCard: {
    backgroundColor: '#fff', borderRadius: 22, padding: 22,
    width: '100%', marginBottom: 22,
    shadowColor: '#5B3FB5', shadowOpacity: 0.08, shadowRadius: 14, elevation: 3,
    borderWidth: 1, borderColor: '#EAE6F8',
  },
  breakdownTitle: { fontWeight: '900', fontSize: 15, color: '#1C1340', marginBottom: 18 },
  breakdownRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  breakdownLabel: { fontSize: 13, color: '#555', fontWeight: '700', minWidth: 90, maxWidth: '38%' },
  breakdownRight: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  breakdownBarBg: { flex: 1, height: 8, backgroundColor: '#F0EEF8', borderRadius: 10, overflow: 'hidden' },
  breakdownBarFill:  { height: 8, borderRadius: 10 },
  breakdownScore: { fontSize: 12, fontWeight: '900', minWidth: 30, textAlign: 'right' },
  finishBtns:     { width: '100%', gap: 12 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#5B3FB5', paddingVertical: 17,
    borderRadius: 20, width: '100%',
    shadowColor: '#5B3FB5', shadowOpacity: 0.4, shadowRadius: 14, elevation: 5,
  },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 0.3 },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 20, width: '100%',
    borderWidth: 2, borderColor: '#C5B8EE', backgroundColor: '#fff',
  },
  ghostBtnText: { color: '#5B3FB5', fontWeight: '800', fontSize: 15 },

  // ERROR / LOADING
  centeredWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  errorCard: {
    backgroundColor: '#fff', borderRadius: 28, padding: 36,
    alignItems: 'center', width: '100%',
    shadowColor: '#5B3FB5', shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  errorIcon:    { fontSize: 52, marginBottom: 14 },
  errorTitle:   { fontSize: 20, fontWeight: '900', color: '#1C1340', marginBottom: 10 },
  errorSub:     { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  loadingEmoji: { fontSize: 48, marginBottom: 12 },
  loadingText:  { fontSize: 17, fontWeight: '800', color: '#7C5CBF' },
});