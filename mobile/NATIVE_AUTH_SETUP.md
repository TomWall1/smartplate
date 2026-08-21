# Native Google / Apple sign-in — setup

The code is scaffolded and **gated behind a dev build**. In Expo Go it does
nothing (the Login screen falls back to the WebBrowser Google OAuth and hides
the Apple button), so testing in Expo Go is unaffected.

> **Why Expo Go can't do Google sign-in.** `AuthSession.makeRedirectUri` can't
> register the `dealstodish` scheme inside Expo Go, so it returns
> `exp://<LAN-IP>:8081/--/auth-callback`. That isn't in Supabase's Redirect URLs
> allowlist, so Supabase falls back to the project's **Site URL** — the browser
> lands on the marketing site and the app never receives a token. A dev build
> registers the real scheme and fixes this.

## Status

- [x] `@react-native-google-signin/google-signin` + `expo-apple-authentication`
      installed; config plugins in `app.json`.
- [x] `expo-dev-client` installed (required by `developmentClient: true`).
- [x] `eas.json` — `development` / `preview` / `production` profiles; the
      internal ones build an installable `.apk`.
- [x] `src/api/nativeAuth.ts` — gated handlers, client IDs read from
      `app.json` → `expo.extra`.
- [x] Backend `POST /api/auth/oauth-native` (`backend/routes/auth.js`).
- [x] Google client IDs filled in (`app.json` → `expo.extra`), web + iOS.
- [x] Apple Team ID `M8SK624GS6` in `eas.json` → `submit.production.ios`.
- [ ] Backend deployed to Render.
- [ ] Dev build produced.

## Android path (no paid developer account needed)

### 1. Link the EAS project

```sh
cd mobile
npx eas-cli login
npx eas-cli init          # writes expo.extra.eas.projectId into app.json
```

### 2. First dev build

```sh
npx eas-cli build --profile development --platform android
```

EAS generates an upload keystore for you. Install the resulting `.apk` from the
build link on the phone.

### 3. Get the SHA-1 that Google needs

Only exists after step 2 — this is why the build comes first:

```sh
npx eas-cli credentials --platform android
# → Keystore → shows SHA1 Fingerprint
```

### 4. Google Cloud Console → APIs & Services → Credentials

- **Web client ID** — reuse the one the web app already uses for Supabase Google
  OAuth. Put it in `app.json` → `expo.extra.googleWebClientId`. This is what
  yields the `idToken`, and its value is the token's `aud`.
- **Android client ID** — create one with package `com.smartplate.dealstodish`
  and the SHA-1 from step 3. Nothing to paste into the app; Google matches the
  app signature at sign-in time.

### 5. Supabase

Auth → Providers → Google should already be enabled (the web app uses it). The
**Web** client ID must be listed there, since `signInWithIdToken` validates the
token's `aud` against it. No Android client ID needed on this screen.

### 6. Deploy the backend

Render must have `/api/auth/oauth-native` live. Auto-deploy is unreliable — push
and confirm the deploy manually.

### 7. Run against the dev build

```sh
npm run start:dev         # expo start --dev-client
```

The Google button now opens the on-device account picker instead of a browser.

## iOS path (Apple Developer Program active)

- [x] iOS OAuth client ID created and wired, with the reversed form as
      `iosUrlScheme` in the google-signin plugin config.
- [ ] Supabase → Auth → Providers → **Apple** enabled, with
      `com.smartplate.dealstodish` in the authorized client IDs. Native
      sign-in validates the token's `aud` against that bundle ID — no Services
      ID or signing key needed (those are for the web redirect flow only).
- [ ] Register the iPhone with EAS, then build:

```sh
npx eas-cli device:create      # open the link on the iPhone, install the profile
npx eas-cli build --profile development --platform ios
```

The *Sign in with Apple* capability on the App ID is requested automatically at
build time by the `usesAppleSignIn` plugin.

## Notes

- Apple requires *Sign in with Apple* on iOS if any other social login is
  offered (App Store Guideline 4.8) — that's why the Apple button exists.
- Until `googleWebClientId` is filled in, `isGoogleNativeConfigured` is false and
  even a dev build uses the WebBrowser flow. That flow *works* in a dev build,
  provided `dealstodish://auth-callback` is added to Supabase's Redirect URLs.
- For a fully HIG-compliant Apple button, swap the custom button in
  `LoginScreen` for `AppleAuthentication.AppleAuthenticationButton` (a native
  view, so keep it gated to the dev build).
