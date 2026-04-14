import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  clearChatHistory,
  getChatHistory,
  markTopicAsStudied,
  saveChatMessage,
  saveUserPdf,
} from '../database/database';
import { useAuth } from '../hooks/AuthContext';
import {
  findExplanation,
  findTopicsInText,
  getTopicSuggestions,
  type EngineResult,
  type FuzzySuggestion,
} from '../scripts/Engine';
import { extractTextFromOfflinePDF } from '../scripts/PdfParser';

interface ChatMessage {
  id: number;
  type: 'ai' | 'user';
  text: string;
  reaction?: string;
  timestamp?: Date;
}

const WELCOME =
  "Hey! I'm ExplainifyAI — your personal CS tutor.\n\nAsk me anything, upload a PDF, or tap a topic below. Every topic you learn earns you XP!";

const MAX_XP = 100;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_WIDE = SCREEN_WIDTH > 768;

// ─── Chip colour palette ──────────────────────────────────────────────────────
const CHIP_COLORS: [string, string, string][] = [
  ['#EDE9FE', '#5B21B6', '#DDD6FE'],
  ['#DBEAFE', '#1D4ED8', '#BFDBFE'],
  ['#D1FAE5', '#065F46', '#A7F3D0'],
  ['#FEF3C7', '#92400E', '#FDE68A'],
  ['#FCE7F3', '#9D174D', '#FBCFE8'],
  ['#FFEDD5', '#C2410C', '#FED7AA'],
  ['#E0F2FE', '#0369A1', '#BAE6FD'],
  ['#F3F4F6', '#374151', '#E5E7EB'],
];

// ─── Empty state starter cards ────────────────────────────────────────────────
const EMPTY_CARDS = [
  { q: 'Explain Virtual memory.',      icon: 'server-outline',        bg: '#EDE9FE', text: '#5B21B6', border: '#DDD6FE' },
  { q: 'Explain TCP/IP model.',          icon: 'wifi-outline',          bg: '#DBEAFE', text: '#1D4ED8', border: '#BFDBFE' },
  { q: 'Explain Big O notation.', icon: 'git-branch-outline',    bg: '#D1FAE5', text: '#065F46', border: '#A7F3D0' },
  { q: 'Explain Thread in operating systems.',    icon: 'hardware-chip-outline', bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
  { q: 'Explain Database management system.',     icon: 'cylinder-outline',      bg: '#FCE7F3', text: '#9D174D', border: '#FBCFE8' },
  { q: 'Explain CPU scheduling',   icon: 'layers-outline',        bg: '#FFEDD5', text: '#C2410C', border: '#FED7AA' },
];

// ─── Chip icons ───────────────────────────────────────────────────────────────
const CHIP_ICONS: Record<string, string> = {
  CPU: 'hardware-chip-outline', RAM: 'server-outline', Networking: 'wifi-outline',
  OS: 'layers-outline', Database: 'cylinder-outline', Security: 'shield-outline',
  Algorithm: 'git-branch-outline', default: 'bulb-outline',
};

// ─── Floating XP toast ───────────────────────────────────────────────────────
const XPToast = ({ visible, xp }: { visible: boolean; xp: number }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -44, duration: 600, useNativeDriver: true }),
      ]).start(() => {
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      });
    }
  }, [visible]);

  return (
    <Animated.View style={[styles.xpToast, { opacity, transform: [{ translateY }] }]} pointerEvents="none">
      <Ionicons name="flash" size={11} color="#fff" />
      <Text style={styles.xpToastText}>+{xp} XP</Text>
    </Animated.View>
  );
};

// ─── Compact XP pill (in header) ─────────────────────────────────────────────
const XPPill = ({ xp, level }: { xp: number; level: number }) => {
  const fillAnim = useRef(new Animated.Value(0)).current;
  const pct = Math.min((xp % MAX_XP) / MAX_XP, 1);

  useEffect(() => {
    Animated.spring(fillAnim, { toValue: pct, tension: 50, friction: 8, useNativeDriver: true }).start();
  }, [pct]);

  return (
    <View style={styles.xpPill}>
      <Text style={styles.xpPillLevel}>Lv.{level}</Text>
      <View style={styles.xpPillBar}>
        <Animated.View style={[styles.xpPillFill, {
          transform: [{ translateX: fillAnim.interpolate({ inputRange: [0, 1], outputRange: [-50, 0] }) }],
        }]} />
      </View>
      <Text style={styles.xpPillNum}>{xp % MAX_XP}<Text style={styles.xpPillMax}>/{MAX_XP}</Text></Text>
    </View>
  );
};

// ─── Message bubble ───────────────────────────────────────────────────────────
const MessageBubble = ({
  msg,
  onReact,
}: {
  msg: ChatMessage;
  onReact: (id: number, emoji: string) => void;
}) => {
  const anim = useRef(new Animated.Value(0)).current;
  const reactionScale = useRef(new Animated.Value(0)).current;
  const [showReactions, setShowReactions] = useState(false);
  const isUser = msg.type === 'user';

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, tension: 65, friction: 8, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (msg.reaction) {
      reactionScale.setValue(0);
      Animated.spring(reactionScale, { toValue: 1, tension: 80, friction: 5, useNativeDriver: true }).start();
    }
  }, [msg.reaction]);

  const timeStr = msg.timestamp
    ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const REACTIONS = ['👍', '🔥', '💡', '😮'];

  return (
    <Animated.View style={[
      styles.bubbleRow,
      isUser ? styles.bubbleRowUser : styles.bubbleRowAI,
      { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] },
    ]}>
      {!isUser && (
        <View style={styles.avatarDot}>
          <Ionicons name="sparkles" size={12} color="#fff" />
        </View>
      )}

      <View style={{ maxWidth: IS_WIDE ? '60%' : '80%' }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => !isUser && setShowReactions(v => !v)}
          delayLongPress={300}
        >
          <View style={[styles.bubble, isUser ? styles.userBubble : styles.aiBubble]}>
            <Text style={isUser ? styles.userText : styles.aiText}>{msg.text}</Text>
            {timeStr ? (
              <Text style={[styles.timeText, isUser && styles.timeTextUser]}>{timeStr}</Text>
            ) : null}
          </View>
        </TouchableOpacity>

        {showReactions && !isUser && (
          <View style={styles.reactionPicker}>
            {REACTIONS.map(emoji => (
              <TouchableOpacity
                key={emoji}
                style={styles.reactionOption}
                onPress={() => { onReact(msg.id, emoji); setShowReactions(false); }}
              >
                <Text style={{ fontSize: 20 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {msg.reaction && (
          <Animated.View style={[
            isUser ? styles.reactionBadgeUser : styles.reactionBadgeAI,
            { transform: [{ scale: reactionScale }] },
          ]}>
            <Text style={{ fontSize: 14 }}>{msg.reaction}</Text>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
};

// ─── Typing indicator ─────────────────────────────────────────────────────────
const TypingIndicator = () => {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(Animated.sequence([
        Animated.timing(dot, { toValue: -7, duration: 280, delay: i * 130, useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.delay(350),
      ]))
    );
    Animated.parallel(anims).start();
    return () => anims.forEach(a => a.stop());
  }, []);

  return (
    <View style={[styles.bubbleRow, styles.bubbleRowAI]}>
      <View style={styles.avatarDot}><Ionicons name="sparkles" size={12} color="#fff" /></View>
      <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
        {dots.map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
        ))}
      </View>
    </View>
  );
};

// ─── Coloured suggestion chip ─────────────────────────────────────────────────
const SuggestionChip = ({ label, onPress, index }: { label: string; onPress: () => void; index: number }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const iconName = (CHIP_ICONS[label] ?? CHIP_ICONS.default) as any;
  const [bg, textColor, border] = CHIP_COLORS[index % CHIP_COLORS.length];

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, delay: index * 50, tension: 70, friction: 8, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 300, delay: index * 50, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.91, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start()}
      activeOpacity={1}
    >
      <Animated.View style={[styles.chip, {
        backgroundColor: bg, borderColor: border,
        transform: [{ scale }, { translateX: slideAnim }],
        opacity: opacityAnim,
      }]}>
        <Ionicons name={iconName} size={12} color={textColor} style={{ marginRight: 5 }} />
        <Text style={[styles.chipText, { color: textColor }]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

// ─── Empty state ──────────────────────────────────────────────────────────────
const EmptyPrompt = ({ onSend }: { onSend: (t: string) => void }) => (
  <View style={styles.emptyState}>
    <View style={styles.emptyIcon}>
      <Ionicons name="sparkles" size={28} color="#7C3AED" />
    </View>
    <Text style={styles.emptyTitle}>What would you like to learn?</Text>
    <Text style={styles.emptySub}>Tap any card to get started instantly.</Text>
    <View style={styles.emptyCards}>
      {EMPTY_CARDS.map(({ q, icon, bg, text, border }) => (
        <TouchableOpacity
          key={q}
          style={[styles.emptyCard, { backgroundColor: bg, borderColor: border }]}
          onPress={() => onSend(q)}
          activeOpacity={0.85}
        >
          <View style={[styles.emptyCardIcon, { backgroundColor: border }]}>
            <Ionicons name={icon as any} size={15} color={text} />
          </View>
          <Text style={[styles.emptyCardText, { color: text }]}>{q}</Text>
          <Ionicons name="arrow-forward" size={13} color={text} style={{ opacity: 0.6 }} />
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

// ─── XP bar (kept for backward compat, used in xpRow) ────────────────────────
const XPBar = ({ xp, maxXp }: { xp: number; maxXp: number }) => {
  const fillAnim = useRef(new Animated.Value(0)).current;
  const pct = Math.min(xp / maxXp, 1);

  useEffect(() => {
    Animated.spring(fillAnim, { toValue: pct, tension: 50, friction: 8, useNativeDriver: true }).start();
  }, [pct]);

  return (
    <View style={styles.xpBarBg}>
      <Animated.View style={[styles.xpBarFill, {
        transform: [{ translateX: fillAnim.interpolate({ inputRange: [0, 1], outputRange: [-120, 0] }) }],
      }]} />
    </View>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function LearnScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showQuizBtn, setShowQuizBtn] = useState(false);
  const [currentTopicData, setCurrentTopicData] = useState<EngineResult | null>(null);
  const [fuzzySuggestions, setFuzzySuggestions] = useState<FuzzySuggestion[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [xp, setXp] = useState(0);
  const [xpToastVisible, setXpToastVisible] = useState(false);
  const [xpGain, setXpGain] = useState(10);
  const [topicsLearned, setTopicsLearned] = useState(0);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [levelUpVisible, setLevelUpVisible] = useState(false);
  const [newLevel, setNewLevel] = useState(2);

  const quizAnim = useRef(new Animated.Value(0)).current;
  const sendScale = useRef(new Animated.Value(1)).current;
  const headerShake = useRef(new Animated.Value(0)).current;

  useEffect(() => { if (!user) router.replace('/'); }, [user]);
  useEffect(() => { setSuggestions(getTopicSuggestions(user?.preferred_language ?? 'en', 8)); }, [user?.preferred_language]);

  // Load persisted XP for this user on mount
  useEffect(() => {
    if (!user) return;
    AsyncStorage.getItem(`xp_${user.id}`).then(val => {
      if (val !== null) setXp(parseInt(val, 10));
    });
    AsyncStorage.getItem(`topics_learned_${user.id}`).then(val => {
      if (val !== null) setTopicsLearned(parseInt(val, 10));
    });
  }, [user?.id]);

  useFocusEffect(useCallback(() => {
    if (!user || historyLoaded) return;
    getChatHistory(user.id).then((rows) => {
      if (rows.length === 0) {
        setMessages([]);
        setIsFirstMessage(true);
      } else {
        setMessages(rows.map(r => ({
          id: r.id,
          type: r.role as 'ai' | 'user',
          text: r.content,
          timestamp: new Date(),
        })));
        setIsFirstMessage(false);
      }
      setHistoryLoaded(true);
    });
  }, [user, historyLoaded]));

  const push = (role: 'user' | 'ai', text: string) => {
    const msg: ChatMessage = { id: Date.now() + Math.random(), type: role, text, timestamp: new Date() };
    setMessages(prev => [...prev, msg]);
    if (user) saveChatMessage(user.id, role, text);
  };

  const addReaction = (id: number, emoji: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, reaction: emoji } : m));
  };

  const gainXp = (amount: number) => {
    setXpGain(amount);
    setXp(prev => {
      const oldLevel = Math.floor(prev / MAX_XP) + 1;
      const next     = prev + amount;
      const nextLevel = Math.floor(next / MAX_XP) + 1;
      if (user) AsyncStorage.setItem(`xp_${user.id}`, String(next));
      // Trigger level-up toast if level changed
      if (nextLevel > oldLevel) {
        setNewLevel(nextLevel);
        setTimeout(() => setLevelUpVisible(true), 300);
        setTimeout(() => setLevelUpVisible(false), 3500);
      }
      return next;
    });
    setXpToastVisible(false);
    setTimeout(() => setXpToastVisible(true), 50);
    setTimeout(() => setXpToastVisible(false), 1200);
  };

  const shakeHeader = () => {
    headerShake.setValue(0);
    Animated.sequence([
      Animated.timing(headerShake, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(headerShake, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(headerShake, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(headerShake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleClearChat = () => {
    const doClear = async () => {
      if (user) await clearChatHistory(user.id);
      setMessages([]);
      setIsFirstMessage(true);
      setShowQuizBtn(false);
      setCurrentTopicData(null);
      setFuzzySuggestions([]);
      setTopicsLearned(0);
    };

    if (Platform.OS === 'web') {
      // Alert.alert is a no-op on web — use browser confirm instead
      if (window.confirm('Delete your entire chat history?')) doClear();
    } else {
      Alert.alert('Clear Chat', 'Delete your entire chat history?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: doClear },
      ]);
    }
  };

  const handleFileUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      if (user) saveUserPdf(user.id, file.name, file.uri);
      setIsFirstMessage(false);
      push('user', `Uploading: ${file.name}`);
      setIsTyping(true);
      setShowQuizBtn(false);
      const rawText = await extractTextFromOfflinePDF(file.uri);
      if (rawText && rawText.trim().length > 10) {
        const found = findTopicsInText(rawText, user?.preferred_language ?? 'en');
        if (found.length > 0) {
          push('ai', `Found these CS topics in your file:\n\n• ${found.join('\n• ')}\n\nWhich topic should I explain?`);
          gainXp(5);
        } else {
          push('ai', "I read the file but couldn't match any syllabus topics. Try typing a topic directly!");
        }
      } else {
        push('ai', 'No readable text found. Please use a text-based PDF.');
      }
    } catch {
      push('ai', 'Failed to read the file. Please try again.');
      shakeHeader();
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text) return;

    setIsFirstMessage(false);

    Animated.sequence([
      Animated.spring(sendScale, { toValue: 0.85, useNativeDriver: true }),
      Animated.spring(sendScale, { toValue: 1, useNativeDriver: true }),
    ]).start();

    push('user', text);
    setInput('');
    setIsTyping(true);
    setShowQuizBtn(false);
    setFuzzySuggestions([]);

    setTimeout(() => {
      const lang = user?.preferred_language ?? 'en';
      const { result, suggestions: fuzz } = findExplanation(text, lang);

      if (result) {
        push('ai', result.response);
        setFuzzySuggestions([]);
        if (result.quiz?.length > 0) {
          setCurrentTopicData(result);
          setShowQuizBtn(true);
          quizAnim.setValue(0);
          Animated.spring(quizAnim, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }).start();
        }
        if (user) markTopicAsStudied(user.id, result.topic);
        gainXp(10);
        setTopicsLearned(t => {
          const next = t + 1;
          if (user) AsyncStorage.setItem(`topics_learned_${user.id}`, String(next));
          return next;
        });
      } else if (fuzz.length > 0) {
        const first = fuzz[0].label;
        const rest = fuzz.slice(1).map(s => `"${s.label}"`).join(' or ');
        const hint = rest ? `Did you mean "${first}"? (or ${rest})` : `Did you mean "${first}"?`;
        push('ai', `${hint}\n\nTap one of the suggestions below or try rephrasing!`);
        setFuzzySuggestions(fuzz);
        setShowQuizBtn(false);
        setCurrentTopicData(null);
        shakeHeader();
      } else {
        push('ai', "I don't have an offline explanation for that yet. Try topics like 'CPU', 'Process', 'Virtual Memory', or 'OS'.");
        setFuzzySuggestions([]);
        shakeHeader();
      }
      setIsTyping(false);
    }, 800);
  };

  if (!user) return null;

  const hasInput = input.trim().length > 0;
  const level = Math.floor(xp / MAX_XP) + 1;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>

        {/* HEADER */}
        <Animated.View style={[styles.header, { transform: [{ translateX: headerShake }] }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={18} color="#1E1B4B" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <View style={styles.aiAvatar}>
              <Ionicons name="sparkles" size={15} color="#fff" />
            </View>
            <View>
              <Text style={styles.headerTitle}>AI Tutor</Text>
              <View style={styles.headerStatusRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.headerOnline}>Ready to teach</Text>
              </View>
            </View>
          </View>

          {/* Compact XP pill replaces the old level badge */}
          <XPPill xp={xp} level={level} />

          <TouchableOpacity style={[styles.headerBtn, { marginLeft: 4 }]} onPress={handleClearChat}>
            <Ionicons name="trash-outline" size={17} color="#EF4444" />
          </TouchableOpacity>
        </Animated.View>

        {/* Floating XP toast */}
        <View style={styles.toastAnchor} pointerEvents="none">
          <XPToast visible={xpToastVisible} xp={xpGain} />
        </View>

        {/* Level-up celebration toast */}
        {levelUpVisible && (
          <View style={styles.levelUpOverlay} pointerEvents="none">
            <View style={styles.levelUpToast}>
              <Text style={styles.levelUpEmoji}>🎉</Text>
              <View>
                <Text style={styles.levelUpTitle}>LEVEL UP!</Text>
                <Text style={styles.levelUpSub}>You reached Level {newLevel}</Text>
              </View>
              <Text style={styles.levelUpEmoji}>⭐</Text>
            </View>
          </View>
        )}

        {/* BODY: wide screen gets a side panel */}
        <View style={styles.body}>

          {IS_WIDE && (
            <View style={styles.sidePanel}>
              <Text style={styles.sidePanelTitle}>Session</Text>
              <View style={styles.sideStat}>
                <Ionicons name="trophy-outline" size={14} color="#7C3AED" />
                <Text style={styles.sideStatText}>{topicsLearned} topics learned</Text>
              </View>
              <View style={styles.sideStat}>
                <Ionicons name="flash-outline" size={14} color="#7C3AED" />
                <Text style={styles.sideStatText}>{xp} XP earned</Text>
              </View>
              <View style={styles.sideStat}>
                <Ionicons name="star-outline" size={14} color="#7C3AED" />
                <Text style={styles.sideStatText}>Level {level}</Text>
              </View>
              <View style={styles.sideDivider} />
              <Text style={styles.sidePanelTitle}>Quick Topics</Text>
              {suggestions.slice(0, 6).map((s, i) => (
                <TouchableOpacity key={s} style={styles.sideTopicBtn} onPress={() => handleSend(s)}>
                  <Ionicons name={(CHIP_ICONS[s] ?? CHIP_ICONS.default) as any} size={13} color={CHIP_COLORS[i % CHIP_COLORS.length][1]} />
                  <Text style={[styles.sideTopicText, { color: CHIP_COLORS[i % CHIP_COLORS.length][1] }]}>{s}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.sideUploadBtn} onPress={handleFileUpload}>
                <Ionicons name="cloud-upload-outline" size={15} color="#7C3AED" />
                <Text style={styles.sideUploadText}>Upload PDF</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.chatWrapper}>
            {/* CHAT */}
            <ScrollView
              ref={scrollRef}
              style={styles.chatArea}
              contentContainerStyle={styles.chatContent}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
              showsVerticalScrollIndicator={false}
            >
              {/* Topics learned ribbon */}
              {topicsLearned > 0 && (
                <View style={styles.learnedBadge}>
                  <Ionicons name="trophy" size={11} color="#D97706" />
                  <Text style={styles.learnedBadgeText}>{topicsLearned} topic{topicsLearned > 1 ? 's' : ''} learned this session</Text>
                </View>
              )}

              {/* Empty state */}
              {isFirstMessage && messages.length === 0 && (
                <EmptyPrompt onSend={handleSend} />
              )}

              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} onReact={addReaction} />
              ))}

              {isTyping && <TypingIndicator />}

              {showQuizBtn && currentTopicData && (
                <Animated.View style={{
                  opacity: quizAnim,
                  transform: [{ translateY: quizAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
                }}>
                  <TouchableOpacity
                    style={styles.quizCard}
                    activeOpacity={0.88}
                    onPress={() => router.push({
                      pathname: '/quiz',
                      params: { topic: currentTopicData.topic, quizData: JSON.stringify(currentTopicData.quiz) },
                    })}
                  >
                    <View style={styles.quizCardLeft}>
                      <View style={styles.quizCardIcon}>
                        <Text style={{ fontSize: 20 }}>🧠</Text>
                      </View>
                      <View>
                        <Text style={styles.quizCardTitle}>Challenge yourself!</Text>
                        <Text style={styles.quizCardSub}>{currentTopicData.topic.replace(/_/g, ' ')}</Text>
                      </View>
                    </View>
                    <View style={styles.quizStartBtn}>
                      <Text style={styles.quizStartBtnText}>Start</Text>
                      <Ionicons name="play" size={11} color="#fff" />
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* Fuzzy suggestions */}
              {fuzzySuggestions.length > 0 && (
                <View style={styles.fuzzyRow}>
                  {fuzzySuggestions.map((s, i) => (
                    <TouchableOpacity
                      key={s.topic}
                      style={[styles.fuzzyChip, { backgroundColor: CHIP_COLORS[i % CHIP_COLORS.length][0], borderColor: CHIP_COLORS[i % CHIP_COLORS.length][2] }]}
                      onPress={() => { setFuzzySuggestions([]); handleSend(s.label); }}
                    >
                      <Ionicons name="search-outline" size={12} color={CHIP_COLORS[i % CHIP_COLORS.length][1]} />
                      <Text style={[styles.fuzzyChipText, { color: CHIP_COLORS[i % CHIP_COLORS.length][1] }]}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={{ height: 10 }} />
            </ScrollView>

            {/* SUGGESTION CHIPS — always visible */}
            <View style={styles.chipsWrapper}>
              <Text style={styles.chipsLabel}>Tap a topic to explore</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
                {suggestions.map((s, i) => (
                  <SuggestionChip key={s} label={s} onPress={() => handleSend(s)} index={i} />
                ))}
              </ScrollView>
            </View>

            {/* INPUT BAR */}
            <View style={styles.inputBar}>
              <TouchableOpacity style={styles.attachBtn} onPress={handleFileUpload}>
                <Ionicons name="attach" size={19} color="#7C3AED" />
              </TouchableOpacity>

              <TextInput
                style={styles.input}
                placeholder="Ask me anything CS..."
                placeholderTextColor="#BDB5E8"
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => handleSend()}
                returnKeyType="send"
                blurOnSubmit={false}
              />

              <TouchableOpacity onPress={() => handleSend()} disabled={!hasInput} activeOpacity={0.8}>
                <Animated.View style={[styles.sendBtn, !hasInput && styles.sendBtnOff, { transform: [{ scale: sendScale }] }]}>
                  <Ionicons name="arrow-up" size={18} color="#fff" />
                </Animated.View>
              </TouchableOpacity>
            </View>
          </View>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F1FF' },

  // HEADER
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11,
    paddingTop: Platform.OS === 'android' ? 42 : 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#EDE9FE',
    gap: 8,
  },
  headerBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: '#F8F7FF',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#EDE9FE',
  },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiAvatar: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: '#7C3AED',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 14, fontWeight: '800', color: '#1E1B4B' },
  headerStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  headerOnline: { fontSize: 10, color: '#10B981', fontWeight: '600' },

  // XP PILL
  xpPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#F5F3FF',
    borderRadius: 20, borderWidth: 1, borderColor: '#DDD6FE',
    paddingHorizontal: 8, paddingVertical: 4,
  },
  xpPillLevel: { fontSize: 10, fontWeight: '900', color: '#5B21B6' },
  xpPillBar: {
    width: 40, height: 4, backgroundColor: '#DDD6FE',
    borderRadius: 4, overflow: 'hidden',
  },
  xpPillFill: {
    height: 4, backgroundColor: '#7C3AED',
    borderRadius: 4, width: '100%',
  },
  xpPillNum: { fontSize: 10, fontWeight: '700', color: '#7C3AED' },
  xpPillMax: { fontSize: 9, color: '#C4B5FD', fontWeight: '500' },

  // XP BAR ROW
  xpRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#F0ECFF',
  },
  xpBarBg: {
    flex: 1, height: 6, backgroundColor: '#EDE9FE', borderRadius: 6, overflow: 'hidden',
  },
  xpBarFill: {
    height: 6, backgroundColor: '#7C3AED', borderRadius: 6, width: '100%',
  },
  xpLabel: { fontSize: 10, color: '#A78BFA', fontWeight: '700', marginLeft: 8, minWidth: 52 },

  // LEVEL UP TOAST
  levelUpOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 9999,
  },
  levelUpToast: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#1E1B4B',
    paddingHorizontal: 28, paddingVertical: 18,
    borderRadius: 24,
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 12,
    borderWidth: 1.5, borderColor: '#7C3AED',
  },
  levelUpEmoji: { fontSize: 28 },
  levelUpTitle: { fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: 1 },
  levelUpSub: { fontSize: 13, color: '#A78BFA', fontWeight: '600', marginTop: 2 },

  // TOAST
  toastAnchor: {
    position: 'absolute', top: Platform.OS === 'android' ? 100 : 80,
    right: 20, zIndex: 999, alignItems: 'center',
  },
  xpToast: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#7C3AED', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, elevation: 6,
  },
  xpToastText: { color: '#fff', fontWeight: '900', fontSize: 12 },

  // BODY
  body: { flex: 1, flexDirection: 'row' },

  // WIDE SIDE PANEL
  sidePanel: {
    width: 200, backgroundColor: '#fff',
    borderRightWidth: 1, borderRightColor: '#EDE9FE',
    paddingHorizontal: 16, paddingVertical: 20, gap: 4,
  },
  sidePanelTitle: {
    fontSize: 10, fontWeight: '800', color: '#C4B5FD',
    textTransform: 'uppercase', letterSpacing: 1.2,
    marginBottom: 8, marginTop: 4,
  },
  sideStat: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5 },
  sideStatText: { fontSize: 12, color: '#4B5563', fontWeight: '600' },
  sideDivider: { height: 1, backgroundColor: '#EDE9FE', marginVertical: 12 },
  sideTopicBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 7, paddingHorizontal: 8,
    borderRadius: 10, marginBottom: 2,
  },
  sideTopicText: { fontSize: 12, fontWeight: '600' },
  sideUploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 'auto',
    backgroundColor: '#EDE9FE', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  sideUploadText: { fontSize: 12, color: '#5B21B6', fontWeight: '700' },

  // CHAT
  chatWrapper: { flex: 1 },
  chatArea: { flex: 1, backgroundColor: '#F3F1FF' },
  chatContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },

  learnedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FEF3C7', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    alignSelf: 'center', marginBottom: 12,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  learnedBadgeText: { fontSize: 11, fontWeight: '700', color: '#92400E' },

  // EMPTY STATE
  emptyState: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 16 },
  emptyIcon: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1E1B4B', textAlign: 'center', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginBottom: 20, lineHeight: 19 },
  emptyCards: { width: '100%', gap: 8 },
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 14, borderWidth: 1,
  },
  emptyCardIcon: {
    width: 32, height: 32, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center',
  },
  emptyCardText: { fontSize: 13, fontWeight: '700', flex: 1 },

  // BUBBLES
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10 },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAI: { justifyContent: 'flex-start' },
  avatarDot: {
    width: 28, height: 28, borderRadius: 10,
    backgroundColor: '#7C3AED',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 8, marginBottom: 2,
  },
  bubble: { padding: 13, borderRadius: 20 },
  userBubble: {
    backgroundColor: '#1E1B4B', borderBottomRightRadius: 5,
    elevation: 3,
  },
  aiBubble: {
    backgroundColor: '#fff', borderBottomLeftRadius: 5,
    elevation: 2, borderWidth: 1, borderColor: '#EDE9FE',
  },
  userText: { color: '#fff', fontSize: 14, lineHeight: 21 },
  aiText: { color: '#1E1B4B', fontSize: 14, lineHeight: 21 },
  timeText: { fontSize: 10, color: '#94A3B8', marginTop: 5, textAlign: 'right' },
  timeTextUser: { color: 'rgba(255,255,255,0.45)' },

  // REACTIONS
  reactionPicker: {
    flexDirection: 'row', gap: 6,
    backgroundColor: '#fff', borderRadius: 20, padding: 8,
    marginTop: 4, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#EDE9FE', elevation: 4,
  },
  reactionOption: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#F8F7FF', justifyContent: 'center', alignItems: 'center',
  },
  reactionBadgeAI: {
    position: 'absolute', bottom: -10, left: 8,
    backgroundColor: '#fff', borderRadius: 12, padding: 3,
    borderWidth: 1, borderColor: '#EDE9FE',
  },
  reactionBadgeUser: {
    position: 'absolute', bottom: -10, right: 8,
    backgroundColor: '#fff', borderRadius: 12, padding: 3,
    borderWidth: 1, borderColor: '#EDE9FE',
  },

  // TYPING
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 16, paddingHorizontal: 18 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#C4B5FD' },

  // QUIZ CARD
  quizCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1E1B4B', borderRadius: 20, padding: 16, marginTop: 6, elevation: 4,
  },
  quizCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quizCardIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center', alignItems: 'center',
  },
  quizCardTitle: { fontSize: 13, fontWeight: '800', color: '#fff' },
  quizCardSub: { fontSize: 11, color: '#A78BFA', marginTop: 2, fontWeight: '600', textTransform: 'capitalize' },
  quizStartBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#7C3AED', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
  },
  quizStartBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  // FUZZY SUGGESTIONS
  fuzzyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  fuzzyChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1,
  },
  fuzzyChipText: { fontSize: 12, fontWeight: '700' },

  // CHIPS
  chipsWrapper: {
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#EDE9FE',
    paddingTop: 8, paddingBottom: 10,
  },
  chipsLabel: {
    fontSize: 10, fontWeight: '700', color: '#C4B5FD',
    textTransform: 'uppercase', letterSpacing: 1,
    paddingHorizontal: 14, marginBottom: 7,
  },
  chipsContent: { paddingHorizontal: 14, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700' },

  // INPUT
  inputBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#EDE9FE', gap: 8,
  },
  attachBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#EDE9FE', justifyContent: 'center', alignItems: 'center',
  },
  input: {
    flex: 1, height: 44, backgroundColor: '#F8F7FF',
    borderRadius: 14, paddingHorizontal: 16,
    fontSize: 14, color: '#1E1B4B',
    borderWidth: 1.5, borderColor: '#EDE9FE',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: '#1E1B4B', justifyContent: 'center', alignItems: 'center',
    elevation: 3,
  },
  sendBtnOff: { backgroundColor: '#D1D5DB', elevation: 0 },
});