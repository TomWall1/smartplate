# Native Google / Apple sign-in — setup

The code is scaffolded and **gated behind a dev build**. In Expo Go it does
nothing (the Login screen falls back to the existing WebBrowser Google OAuth and
hides the Apple button), so testing in Expo Go is unaffected. To make native
sign-in actually work, complete the steps below and build a dev client.

## What's already in place
- `@react-native-google-signin/google-signin` + `expo-apple-authentication`
  installed; config plugins added to `app.json` (`ios.usesAppleSignIn`, the
  google-signin plugin with an `iosUrlScheme`).
- `eas.json` with `development` / `preview` / `production` build profiles.
- `src/api/nativeAuth.ts` — gated handlers (`signInWithGoogleNative`,
  `signInWithAppleNative`, `isAppleAvailable`, `isNativeAuthAvailable`).
- `LoginScreen` shows native Google (dev build) / Apple (iOS dev build) buttons,
  WebBrowser Google in Expo Go.
- Backend `POST /api/auth/oauth-native` exchanges a provider ID token for a
  Supabase session (needs deploy).

## Steps to finish
1. **Google Cloud Console** → APIs & Services → Credentials → create OAuth 2.0
   client IDs:
   - **Web** client ID → put in `nativeAuth.ts` `GOOGLE_WEB_CLIENT_ID` (this is
     what yields the `idToken`).
   - **iOS** client ID → `GOOGLE_IOS_CLIENT_ID` in `nativeAuth.ts`, and set the
     reversed form as `iosUrlScheme` in `app.json`
     (`com.googleusercontent.apps.<IOS_CLIENT_ID>`).
   - **Android** client ID → add your app's package + SHA-1 (from the EAS build
     credentials) in the console.
2. **Apple Developer**: ensure the App ID has the *Sign in with Apple*
   capability (the `usesAppleSignIn` plugin requests it at build time); create a
   Services ID + key if using Apple as a Supabase provider.
3. **Supabase** dashboard → Auth → Providers → enable **Google** and **Apple**
   with the matching client IDs, so `signInWithIdToken` accepts the tokens.
4. **Deploy the backend** (Render) so `/api/auth/oauth-native` is live.
5. **Build a dev client** and run on a device:
   ```sh
   npm i -g eas-cli        # if needed
   eas login
   eas build --profile development --platform ios      # and/or android
   ```
   Install the build, then `npx expo start --dev-client`. The native Google /
   Apple buttons will now use the on-device account pickers.

## Notes
- Apple requires *Sign in with Apple* on iOS if any other social login is
  offered (App Store Guideline 4.8) — that's why the Apple button is included.
- For a fully HIG-compliant Apple button you can later swap the custom button in
  `LoginScreen` for `AppleAuthentication.AppleAuthenticationButton` (it's a
  native view, so keep it gated to the dev build).
