/**
 * Native Google / Apple sign-in — SCAFFOLDING (behind a dev build).
 *
 * These use native modules that are NOT present in Expo Go, so everything here
 * is gated on `isNativeAuthAvailable` and the heavy modules are lazy-`require`d
 * inside the handlers. In Expo Go the LoginScreen falls back to the existing
 * WebBrowser OAuth — importing this file is safe there.
 *
 * BEFORE THIS WORKS (see mobile/NATIVE_AUTH_SETUP.md):
 *   1. Fill the Google client IDs below + the iosUrlScheme in app.json.
 *   2. Enable Google + Apple providers in Supabase (Auth → Providers).
 *   3. Deploy the backend (POST /api/auth/oauth-native).
 *   4. Build a dev client:  eas build --profile development
 */
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import client from './client';

// Expo Go reports `storeClient`; dev/standalone builds report `bare`/`standalone`.
export const isNativeAuthAvailable =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

// TODO: from Google Cloud Console → Credentials → OAuth 2.0 client IDs.
const GOOGLE_WEB_CLIENT_ID = 'TODO_WEB_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = 'TODO_IOS_CLIENT_ID.apps.googleusercontent.com';

interface NativeSession { token: string; refresh_token?: string }

// Exchange a provider ID token for a Supabase session via our backend.
async function exchange(provider: 'google' | 'apple', idToken: string): Promise<NativeSession> {
  const res = await client.post('/api/auth/oauth-native', { provider, idToken });
  return res.data as NativeSession;
}

let googleConfigured = false;
function getGoogleSignin(): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@react-native-google-signin/google-signin');
  if (!googleConfigured) {
    mod.GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID, // required to receive an idToken
      iosClientId: GOOGLE_IOS_CLIENT_ID,
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
