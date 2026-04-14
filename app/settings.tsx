import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../hooks/AuthContext';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ta', label: 'தமிழ் (Tamil)', flag: '🇮🇳' },
  { code: 'hi', label: 'हिंदी (Hindi)', flag: '🇮🇳' },
  { code: 'ml', label: 'മലയാളം (Malayalam)', flag: '🇮🇳' },
  { code: 'te', label: 'తెలుగు (Telugu)', flag: '🇮🇳' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user, changeLanguage, logout } = useAuth();

  useEffect(() => { if (!user) router.replace('/'); }, [user]);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => { logout(); router.replace('/'); } },
    ]);
  };

  if (!user) return null;

  return (
    <SafeAreaView style={styles.container}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1C1340" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* PROFILE */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>
              {user.username.charAt(0).toUpperCase()}
            </Text>
          </View>

          <View>
            <Text style={styles.profileName}>{user.username}</Text>
            <Text style={styles.profileEmail}>{user.email}</Text>
          </View>
        </View>

        {/* SECTION */}
        <Text style={styles.sectionTitle}>App Language</Text>
        <Text style={styles.subtitle}>
          AI explanations will be delivered in your chosen language.
        </Text>

        {/* LANGUAGE CARD */}
        <View style={styles.card}>
          {LANGUAGES.map((lang, i) => {
            const active = user.preferred_language === lang.code;
            const last = i === LANGUAGES.length - 1;

            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => changeLanguage(lang.code)}
                activeOpacity={0.85}
                style={[
                  styles.langRow,
                  active && styles.activeLangRow,
                  last && styles.lastRow,
                ]}
              >
                <Text style={styles.flag}>{lang.flag}</Text>

                <Text style={[
                  styles.langTxt,
                  active && styles.activeLangTxt
                ]}>
                  {lang.label}
                </Text>

                {active && (
                  <Ionicons name="checkmark-circle" size={22} color="#7C5CBF" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* LOGOUT */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
          <Text style={styles.logoutTxt}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: '#F3F0FF',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 18,
  },

  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EDE9FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1C1340',
  },

  content: {
    paddingHorizontal: 20,
    paddingBottom: 60,
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    marginBottom: 30,
    gap: 14,

    shadowColor: '#7C5CBF',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },

  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#7C5CBF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  avatarLetter: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
  },

  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1340',
  },

  profileEmail: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1C1340',
  },

  subtitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 14,
    marginTop: 4,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 30,

    shadowColor: '#7C5CBF',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },

  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F0FA',
  },

  lastRow: {
    borderBottomWidth: 0,
  },

  activeLangRow: {
    backgroundColor: '#F3F0FF',
  },

  flag: {
    fontSize: 18,
  },

  langTxt: {
    flex: 1,
    fontSize: 15,
    color: '#555',
    fontWeight: '600',
  },

  activeLangTxt: {
    color: '#7C5CBF',
    fontWeight: '800',
  },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 18,
    backgroundColor: '#FFEAEA',
    gap: 10,

    shadowColor: '#FF3B30',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },

  logoutTxt: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '900',
  },
});