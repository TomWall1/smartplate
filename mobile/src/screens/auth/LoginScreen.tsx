import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { getOAuthConfig } from '../../api/auth';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { login, googleLogin, enterGuestMode } = useAuth();

  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // Navigation resolves automatically via AuthContext — no navigate() needed
    } catch (err: any) {
      const message = err?.response?.data?.error ?? 'Login failed. Please check your credentials.';
      Alert.alert('Login failed', message);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      const { supabaseUrl } = await getOAuthConfig();
      if (!supabaseUrl) {
        Alert.alert('Unavailable', 'Google sign-in is not configured.');
        return;
      }

      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'dealstodish', path: 'auth-callback' });
      const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUri)}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        // Supabase puts tokens in the URL hash fragment
        const hash = result.url.split('#')[1] ?? '';
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');

        if (accessToken) {
          await googleLogin(accessToken);
          // AuthContext updates → RootNavigator re-renders → modal dismissed automatically
        } else {
          Alert.alert('Sign-in failed', 'Could not retrieve access token. Please try again.');
        }
      }
      // result.type === 'cancel' — user closed browser, do nothing
    } catch (err: any) {
      Alert.alert('Google sign-in failed', err?.message ?? 'Something went wrong.');
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleGuestMode() {
    await enterGuestMode();
    // RootNavigator re-renders to show main app automatically
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="leaf" size={36} color="#7DB87A" />
          </View>
          <Text style={styles.logoText}>Deals to Dish</Text>
          <Text style={styles.tagline}>Cook smart. Save more.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>

          {/* Google Sign In */}
          <TouchableOpacity
            style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={googleLoading || loading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color="#5C4A35" />
            ) : (
              <>
                <GoogleIcon />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Email */}
          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#c8b8a8"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
            />
          </View>

          {/* Password */}
          <View style={styles.field}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Password</Text>
              <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.passwordWrapper}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                placeholderTextColor="#c8b8a8"
                secureTextEntry={!showPassword}
                autoComplete="password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#a09080" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Sign in button */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading || googleLoading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
          </TouchableOpacity>

          {/* Create account link */}
          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('SignUp')}>
            <Text style={styles.linkText}>
              Don't have an account? <Text style={styles.linkAccent}>Create one</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {/* Guest mode */}
        <TouchableOpacity style={styles.guestButton} onPress={handleGuestMode} activeOpacity={0.7}>
          <Text style={styles.guestButtonText}>Browse without an account →</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function GoogleIcon() {
  return (
    <View style={{ width: 18, height: 18 }}>
      {/* Simple coloured G using a text character — no SVG needed in RN */}
      <Text style={{ fontSize: 15, fontWeight: '700', color: '#4285F4', lineHeight: 18 }}>G</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FDFAF5' },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },
  header: { alignItems: 'center', marginBottom: 32, gap: 8 },
  logoCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#D6EDD4', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  logoText: { fontSize: 28, fontWeight: '800', color: '#5C4A35' },
  tagline: { fontSize: 14, color: '#a09080' },
  card: { backgroundColor: '#ffffff', borderRadius: 20, padding: 24, gap: 16, borderWidth: 1.5, borderColor: '#e8e0d4', shadowColor: 'rgba(92,74,53,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16, elevation: 4 },
  cardTitle: { fontSize: 22, fontWeight: '700', color: '#5C4A35', marginBottom: 4 },
  googleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: '#e8e0d4', borderRadius: 12, paddingVertical: 13, backgroundColor: '#ffffff' },
  googleButtonText: { fontSize: 15, fontWeight: '600', color: '#5C4A35' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#e8e0d4' },
  dividerText: { fontSize: 12, color: '#a09080' },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#5C4A35' },
  forgotLink: { fontSize: 13, fontWeight: '600', color: '#7DB87A' },
  input: { borderWidth: 1.5, borderColor: '#e8e0d4', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#5C4A35', backgroundColor: '#FDFAF5' },
  passwordWrapper: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeButton: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  primaryButton: { backgroundColor: '#7DB87A', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  linkRow: { alignItems: 'center', paddingVertical: 4 },
  linkText: { fontSize: 14, color: '#a09080' },
  linkAccent: { color: '#7DB87A', fontWeight: '600' },
  guestButton: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  guestButtonText: { fontSize: 14, color: '#a09080', fontWeight: '600' },
});
