import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert,
  Dimensions,
  KeyboardAvoidingView, Platform,
  SafeAreaView, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View
} from 'react-native';
import { useAuth } from '../hooks/AuthContext';

const { width } = Dimensions.get('window');

export default function SignUpScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [isFocused, setIsFocused] = useState('');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ name: '', email: '', password: '' });

  const clearError = (f: keyof typeof errors) => setErrors((p) => ({ ...p, [f]: '' }));

  const validate = () => {
    const e = { name: '', email: '', password: '' };
    let ok = true;
    if (!name.trim()) { e.name = 'Name is required'; ok = false; }
    const em = email.trim();
    if (!em) { e.email = 'Email is required'; ok = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { e.email = 'Enter a valid email address'; ok = false; }
    if (password.length < 6) { e.password = 'Password must be at least 6 characters'; ok = false; }
    setErrors(e);
    return ok;
  };

  const handleSignUp = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await register(name.trim(), email.trim(), password);
      if (res.success) { 
        Alert.alert('Welcome!', 'Your account has been created 🎉'); 
        router.replace('/home'); 
      } else { 
        Alert.alert('Sign Up Failed', res.error ?? 'That email is already in use.'); 
      }
    } catch { 
      Alert.alert('Error', 'Something went wrong. Please try again.'); 
    } finally { 
      setLoading(false); 
    }
  };

  const inpStyle = [
    styles.input, 
    Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)
  ];

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent} 
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Back Button (Fixed Position) */}
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#1A1A1A" />
          </TouchableOpacity>

          <View style={styles.cardContainer}>
            <View style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.title}>Create Account</Text>
                <Text style={styles.subtitle}>Join ExplainifyAI to start learning offline.</Text>
              </View>

              <View style={styles.form}>
                <Text style={styles.label}>Full Name</Text>
                <View style={[styles.inputWrapper, isFocused === 'name' && styles.focused, !!errors.name && styles.errorBorder]}>
                  <Ionicons name="person-outline" size={18} color={errors.name ? '#FF3B30' : isFocused === 'name' ? '#6200ee' : '#999'} />
                  <TextInput 
                    placeholder="John Doe" 
                    placeholderTextColor="#BBB"
                    value={name} 
                    onChangeText={(t) => { setName(t); clearError('name'); }}
                    onFocus={() => setIsFocused('name')} 
                    onBlur={() => setIsFocused('')} 
                    style={inpStyle} 
                  />
                </View>
                {!!errors.name && <Text style={styles.fieldError}>{errors.name}</Text>}

                <Text style={styles.label}>Email Address</Text>
                <View style={[styles.inputWrapper, isFocused === 'email' && styles.focused, !!errors.email && styles.errorBorder]}>
                  <Ionicons name="mail-outline" size={18} color={errors.email ? '#FF3B30' : isFocused === 'email' ? '#6200ee' : '#999'} />
                  <TextInput 
                    placeholder="hello@example.com" 
                    placeholderTextColor="#BBB"
                    value={email} 
                    onChangeText={(t) => { setEmail(t); clearError('email'); }}
                    onFocus={() => setIsFocused('email')} 
                    onBlur={() => setIsFocused('')}
                    keyboardType="email-address" 
                    autoCapitalize="none" 
                    style={inpStyle} 
                  />
                </View>
                {!!errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}

                <Text style={styles.label}>Password</Text>
                <View style={[styles.inputWrapper, isFocused === 'password' && styles.focused, !!errors.password && styles.errorBorder]}>
                  <Ionicons name="lock-closed-outline" size={18} color={errors.password ? '#FF3B30' : isFocused === 'password' ? '#6200ee' : '#999'} />
                  <TextInput 
                    placeholder="••••••••" 
                    placeholderTextColor="#BBB"
                    value={password}
                    onChangeText={(t) => { setPassword(t); clearError('password'); }}
                    onFocus={() => setIsFocused('password')} 
                    onBlur={() => setIsFocused('')}
                    secureTextEntry={!showPassword} 
                    style={inpStyle} 
                  />
                  <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#999" />
                  </TouchableOpacity>
                </View>
                {!!errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}

                <TouchableOpacity 
                  activeOpacity={0.8}
                  style={[styles.btn, loading && { opacity: 0.7 }]} 
                  onPress={handleSignUp} 
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Get Started</Text>}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.footerLink} onPress={() => router.push('/')}>
                <Text style={styles.footerText}>
                  Already have an account? <Text style={styles.bold}>Sign In</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 40 },
  backBtn: { 
    position: 'absolute',
    top: 20, 
    left: 20,
    zIndex: 10,
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: '#FFFFFF', 
    alignItems: 'center', 
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2
  },
  cardContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    width: '100%',
  },
  card: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 450, // This keeps it from stretching too wide
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 8,
    borderWidth: Platform.OS === 'ios' ? 0 : 1,
    borderColor: '#E1E1E1',
  },
  header: { marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '800', color: '#1A1A1A', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#666', marginTop: 8, textAlign: 'center', lineHeight: 22 },
  form: { width: '100%' },
  label: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#FBFBFF', 
    paddingHorizontal: 16, 
    height: 54,
    borderRadius: 12, 
    borderWidth: 1.5, 
    borderColor: '#E8E8E8' 
  },
  focused: { borderColor: '#6200ee', backgroundColor: '#FFF' },
  errorBorder: { borderColor: '#FF3B30' },
  input: { flex: 1, marginLeft: 12, fontSize: 16, color: '#1A1A1A' },
  fieldError: { color: '#FF3B30', fontSize: 11, marginTop: 4, fontWeight: '600' },
  btn: { 
    backgroundColor: '#6200ee', 
    height: 56,
    borderRadius: 12, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginTop: 24,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  footerLink: { marginTop: 24, alignItems: 'center' },
  footerText: { color: '#666', fontSize: 14 },
  bold: { color: '#6200ee', fontWeight: '700' },
});