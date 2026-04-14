import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../hooks/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    setError('');
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) { setError('Enter a valid email.'); return; }
    if (!password) { setError('Enter your password.'); return; }
    setLoading(true);
    try {
      const res = await login(trimmed, password);
      if (res.success) router.replace('/home');
      else setError(res.error ?? 'Incorrect email or password.');
    } catch {
      setError('Connection error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* On web this centers the card horizontally and vertically */}
      <View style={styles.outer}>
        <View style={styles.inner}>

          {/* Brand */}
          <View style={styles.brand}>
            <View style={styles.iconCircle}>
              <Ionicons name="sparkles" size={28} color="#7C3AED" />
            </View>
            <Text style={styles.brandName}>Explainify AI</Text>
            <Text style={styles.brandTag}>OFFLINE TUTOR</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.sub}>Welcome back. Enter your details below.</Text>

            {!!error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="you@university.edu"
              placeholderTextColor="#C4B5FD"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              blurOnSubmit={false}
            />

            <Text style={styles.label}>Password</Text>
            <View style={styles.passRow}>
              <TextInput
                ref={passwordRef}
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                placeholder="••••••••"
                placeholderTextColor="#C4B5FD"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eye}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.btn, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Sign In</Text>
              }
            </TouchableOpacity>

            <Text style={styles.foot}>
              New here?{' '}
              <Text style={styles.footLink} onPress={() => router.push('/signup')}>
                Create an account
              </Text>
            </Text>
          </View>

          <Text style={styles.bottom}>Offline · Private · Secure</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F1FF',
  },

  // Web: centers card on screen. Mobile: just stacks from top.
  outer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-start',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 0 : 64,
    paddingBottom: 40,
  },

  // On web cap the width so card doesn't stretch full screen
  inner: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 440 : undefined,
  },

  brand: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  brandName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#1E1B4B',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  brandTag: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7C3AED',
    letterSpacing: 2.5,
    marginTop: 4,
    textAlign: 'center',
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#EDE9FE',
    elevation: 3,
    // Web shadow
    ...Platform.select({
      web: {
        boxShadow: '0 8px 32px rgba(30,27,75,0.10)',
      },
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1E1B4B',
    textAlign: 'center',
    marginBottom: 4,
  },
  sub: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 4,
  },

  errorBox: {
    backgroundColor: '#FFF1F2',
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  errorText: {
    color: '#BE123C',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    height: 48,
    backgroundColor: '#F8F7FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDD6FE',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1E1B4B',
  },
  passRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eye: {
    padding: 8,
  },

  btn: {
    backgroundColor: '#1E1B4B',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  foot: {
    textAlign: 'center',
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 18,
  },
  footLink: {
    color: '#7C3AED',
    fontWeight: '700',
  },

  bottom: {
    marginTop: 20,
    fontSize: 11,
    color: '#A78BFA',
    textAlign: 'center',
    letterSpacing: 1,
    fontWeight: '600',
  },
});