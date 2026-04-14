import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initializeDatabase } from '../database/database';
import { AuthProvider } from '../hooks/AuthContext';

type BootState = 'loading' | 'ready' | 'error';

export default function RootLayout() {
  const [bootState, setBootState] = useState<BootState>('loading');

  const boot = () => {
    setBootState('loading');
    initializeDatabase()
      .then(() => setBootState('ready'))
      .catch(() => setBootState('error'));
  };

  useEffect(() => { boot(); }, []);

  if (bootState === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#6200ee" />
        <Text style={styles.splashText}>Starting up…</Text>
      </View>
    );
  }

  if (bootState === 'error') {
    return (
      <View style={styles.splash}>
        <Text style={styles.errorText}>⚠️ Database failed to initialise.{'\n'}Please restart the app.</Text>
        <TouchableOpacity onPress={boot} style={styles.retryBtn}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="signup" />
          <Stack.Screen name="home" />
          <Stack.Screen name="learn" />
          <Stack.Screen name="quiz" />
          <Stack.Screen name="quizSetup" />
          <Stack.Screen name="ExplorePage" />
          <Stack.Screen name="AnalyticsPage" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="topicDetail" />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FBFBFF', gap: 16 },
  splashText: { color: '#6200ee', fontSize: 14, fontWeight: '600' },
  errorText: { color: '#FF5252', fontSize: 15, textAlign: 'center', paddingHorizontal: 30, lineHeight: 24 },
  retryBtn: { backgroundColor: '#6200ee', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: '#fff', fontWeight: 'bold' },
});
