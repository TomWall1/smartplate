/**
 * Native Google / Apple sign-in — SCAFFOLDING (behind a dev build).
 *
 * These use native modules that are NOT present in Expo Go, so everything here
 * is gated on `isNativeAuthAvailable` and the heavy modules are lazy-`require`d
 * inside the handlers. In Expo Go the LoginScreen falls back to the existing
 * WebBrowser OAuth — importing this file is safe there.
 *
 * BEFORE THIS WORKS (see mobile/NATIVE_AUTH_SETUP.md):
 *   1. Fill googleWebClientId / googleIosClientId in app.json → expo.extra.
 *   2. Enable Google + Apple providers in Supabase (Auth → Providers).
 *   3. Deploy the backend (POST /api/auth/oauth-native).
 *   4. Build a dev client:  eas build --profile development --platform android
 */
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import client from './client';

// Expo Go reports `storeClient`; dev/standalone builds report `bare`/`standalone`.
export const isNativeAuthAvailable =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// Client IDs live in app.json → expo.extra (same pattern as apiBaseUrl in
// client.ts) so filling them in never means touching this file.
const extra = (Constants.expoConfig?.extra ?? {}) as {
  googleWebClientId?: string;
  googleIosClientId?: string;
};

const PLACEHOLDER = /^TODO_/;
const configured = (v?: string) => (v && !PLACEHOLDER.test(v) ? v : undefined);

const GOOGLE_WEB_CLIENT_ID = configured(extra.googleWebClientId);
const GOOGLE_IOS_CLIENT_ID = configured(extra.googleIosClientId);

/** True once the Google client IDs are filled in for this platform. */
export const isGoogleNativeConfigured =
  !!GOOGLE_WEB_CLIENT_ID && (Platform.OS !== 'ios' || !!GOOGLE_IOS_CLIENT_ID);

interface NativeSession { token: string; refresh_token?: string }

// Exchange a provider ID token for a Supabase session via our backend.
async function exchange(provider: 'google' | 'apple', idToken: string): Promise<NativeSession> {
  const res = await client.post('/api/auth/oauth-native', { provider, idToken });
  return res.data as NativeSession;
}

let googleConfigured = false;
function getGoogleSignin(): any {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(
      'Google sign-in is not configured — set expo.extra.googleWebClientId in app.json ' +
        '(see mobile/NATIVE_AUTH_SETUP.md).',
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@react-native-google-signin/google-signin');
  if (!googleConfigured) {
    mod.GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID, // required to receive an idToken
      iosClientId: GOOGLE_IOS_CLIENT_ID, // undefined on Android — ignored
      offlineAccess: false,
    });
    googleConfigured = true;
  }
  return mod.GoogleSignin;
}

export async function signInWithGoogleNative(): Promise<NativeSession> {
  const GoogleSignin = getGoogleSignin();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
  // v13+ wraps in { data: {...} }; older returns flat — handle both.
  const idToken: string | undefined = result?.data?.idToken ?? result?.idToken;
  if (!idToken) throw new Error('Google did not return an ID token');
  return exchange('google', idToken);
}

export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !isNativeAuthAvailable) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AppleAuthentication = require('expo-apple-authentication');
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithAppleNative(): Promise<NativeSession> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AppleAuthentication = require('expo-apple-authentication');
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error('Apple did not return an identity token');
  return exchange('apple', credential.identityToken);
}
