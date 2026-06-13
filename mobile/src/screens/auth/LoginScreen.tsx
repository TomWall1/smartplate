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
import { Image } from 'expo-image';
import { fonts } from '../../theme';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { SUPABASE_URL } from '../../api/auth';
import {
  isNativeAuthAvailable,
  signInWithGoogleNative,
  signInWithAppleNative,
  isAppleAvailable,
} from '../../api/nativeAuth';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { login, googleLogin, enterGuestMode } = useAuth();

  // When this screen is the auth wall, RootNavigator swaps trees on success.
  // When it's opened as a modal over the app (a guest upgrading), there's no
  // tree swap — so dismiss the modal ourselves.
  const dismissIfModal = () => { if (navigation.canGoBack()) navigation.goBack(); };

  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading]   = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    isAppleAvailable().then(setAppleAvailable).catch(() => {});
  }, []);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      dismissIfModal();
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
      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'dealstodish', path: 'auth-callback' });
      const authUrl = `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectUri)}`;

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        // Supabase puts tokens in the URL hash fragment
        const hash = result.url.split('#')[1] ?? '';
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token') ?? undefined;

        if (accessToken) {
          await googleLogin(accessToken, refreshToken);
          dismissIfModal();
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

  // Native Google (dev build only) — Expo Go uses handleGoogleSignIn instead.
  async function handleNativeGoogle() {
    setGoogleLoading(true);
    try {
      const session = await signInWithGoogleNative();
      await googleLogin(session.token, session.refresh_token);
      dismissIfModal();
    } catch (err: any) {
      if (!/cancel/i.test(err?.message ?? '')) {
        Alert.alert('Google sign-in failed', err?.message ?? 'Something went wrong.');
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleApple() {
    setAppleLoading(true);
    try {
      const session = await signInWithAppleNative();
      await googleLogin(session.token, session.refresh_token);
      dismissIfModal();
    } catch (err: any) {
      if (err?.code !== 'ERR_REQUEST_CANCELED' && !/cancel/i.test(err?.message ?? '')) {
        Alert.alert('Apple sign-in failed', err?.message ?? 'Something went wrong.');
      }
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleGuestMode() {
    await enterGuestMode();
    // Already a guest (in-app modal) → dismiss it; first-run → tree swaps.
    dismissIfModal();
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.header}>
          <Image source={require('../../../assets/icon.png')} style={styles.logoImage} contentFit="cover" />
          <Text style={styles.logoText}>Deal to Dish</Text>
          <Text style={styles.tagline}>Cook smart. Save more.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>

          {/* Google Sign In */}
          <TouchableOpacity
            style={[styles.googleButton, googleLoading && styles.buttonDisabled]}
            onPress={isNativeAuthAvailable ? handleNativeGoogle : handleGoogleSignIn}
            disabled={googleLoading || appleLoading || loading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color="#2A241F" />
            ) : (
              <>
                <GoogleIcon />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Apple Sign In — only in a dev build on iOS (hidden in Expo Go) */}
          {appleAvailable && (
            <TouchableOpacity
              style={[styles.appleButton, appleLoading && styles.buttonDisabled]}
              onPress={handleApple}
              disabled={googleLoading || appleLoading || loading}
              activeOpacity={0.85}
            >
              {appleLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={18} color="#ffffff" />
                  <Text style={styles.appleButtonText}>Continue with Apple</Text>
                </>
              )}
            </TouchableOpacity>
          )}

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
              placeholderTextColor="#9A8E7E"
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
                placeholderTextColor="#9A8E7E"
                secureTextEntry={!showPassword}
                autoComplete="password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6B5F52" />
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
      <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: '#4285F4', lineHeight: 18 }}>G</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F4EEE2' },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },
  header: { alignItems: 'center', marginBottom: 32, gap: 8 },
  logoImage: { width: 76, height: 76, borderRadius: 18, marginBottom: 4 },
  logoText: { fontFamily: fonts.display, fontSize: 28, color: '#2A241F' },
  tagline: { fontFamily: fonts.ui, fontSize: 14, color: '#6B5F52' },
  card: { backgroundColor: '#ffffff', borderRadius: 20, padding: 24, gap: 16, borderWidth: 1.5, borderColor: '#E2D8C6', shadowColor: 'rgba(92,74,53,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 16, elevation: 4 },
  cardTitle: { fontFamily: fonts.display, fontSize: 22, color: '#2A241F', marginBottom: 4 },
  googleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderColor: '#E2D8C6', borderRadius: 12, paddingVertical: 13, backgroundColor: '#ffffff' },
  googleButtonText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#2A241F' },
  appleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 13, backgroundColor: '#000000' },
  appleButtonText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#ffffff' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2D8C6' },
  dividerText: { fontSize: 12, color: '#6B5F52' },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#2A241F' },
  forgotLink: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#36453B' },
  input: { borderWidth: 1.5, borderColor: '#E2D8C6', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#2A241F', backgroundColor: '#F4EEE2' },
  passwordWrapper: { position: 'relative' },
  passwordInput: { paddingRight: 48 },
  eyeButton: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  primaryButton: { backgroundColor: '#36453B', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  linkRow: { alignItems: 'center', paddingVertical: 4 },
  linkText: { fontSize: 14, color: '#6B5F52' },
  linkAccent: { color: '#36453B', fontFamily: 'Inter_600SemiBold' },
  guestButton: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  guestButtonText: { fontSize: 14, color: '#6B5F52', fontFamily: 'Inter_600SemiBold' },
});
