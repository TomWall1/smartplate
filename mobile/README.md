# Deals to Dish — Mobile App

React Native (Expo) app for SmartPlate. Matches supermarket deals to recipes.

## Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Expo Go app on your device (iOS or Android)

## Setup

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go (Android) or the Camera app (iOS).

## Project structure

```
src/
├── api/          # Axios client + per-resource modules
├── context/      # AuthContext, PremiumContext
├── navigation/   # React Navigation root + stack/tab setup
├── screens/      # All screens grouped by feature
│   ├── auth/
│   ├── recipes/
│   ├── pantry/
│   ├── FavouritesScreen.tsx
│   └── ProfileScreen.tsx
├── components/   # Shared UI components
└── types/        # TypeScript interfaces
```

## Auth flow

1. LoginScreen / SignUpScreen
2. After sign-up → StateSelectionScreen
3. If logged in but no state → StateSelectionScreen
4. Otherwise → Main tab navigator

## Premium gating

- Pantry tab and Favourites tab show a `<PremiumGate>` overlay for free users.
- `usePremium()` hook reads `user.is_premium` from AuthContext.

## API

Base URL: `https://smartplate-backend.onrender.com`

All authenticated requests include `Authorization: Bearer <token>`.
Token is stored in `expo-secure-store` under the key `deals_to_dish_token`.
On 401, the token is cleared and the user is redirected to Login.

## Design tokens

| Token       | Value     | Usage                          |
|-------------|-----------|--------------------------------|
| Parchment   | `#FDFAF5` | App background                 |
| Bark        | `#5C4A35` | Primary text                   |
| Leaf        | `#7DB87A` | Buttons, active states         |
| Honey       | `#F4A94E` | Accent, deal savings, premium  |
| Berry       | `#D4667A` | Sale badges, errors            |
| Muted       | `#a09080` | Secondary text                 |

## Building for production

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure project
eas build:configure

# Build for iOS (requires Apple Developer account)
eas build --platform ios

# Build for Android
eas build --platform android
```
