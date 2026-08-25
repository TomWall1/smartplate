import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { usePremium } from '../context/PremiumContext';
import { colors, fonts } from '../theme';
import { setAnalyticsContext } from '../lib/analytics';
import { decodeEntities } from '../lib/displayText';

// Auth / onboarding screens
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import StoreSelectionScreen from '../screens/onboarding/StoreSelectionScreen';
import StateSelectionScreen from '../screens/auth/StateSelectionScreen';

// Main screens
import DealsScreen from '../screens/DealsScreen';
import RecipeListScreen from '../screens/recipes/RecipeListScreen';
import RecipeDetailScreen from '../screens/recipes/RecipeDetailScreen';
import PremiumHubScreen from '../screens/PremiumHubScreen';
import FavouritesScreen from '../screens/FavouritesScreen';
import PantryInputScreen from '../screens/pantry/PantryInputScreen';
import PantryResultsScreen from '../screens/pantry/PantryResultsScreen';
import AccountScreen from '../screens/AccountScreen';
import DealRecipesScreen from '../screens/DealRecipesScreen';
import PaywallScreen from '../screens/PaywallScreen';

import { PantryMatchResult } from '../types';

// ─── Param list types ─────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
};

export type OnboardingStackParamList = {
  StoreSelection: undefined;
  StateSelection: undefined;
  Login: undefined;
  SignUp: undefined;
};

export type RootStackParamList = {
  App: undefined;
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  StoreSelection: undefined;
  StateSelection: undefined;
  Paywall: undefined;
};

export type DealsStackParamList = {
  Deals: undefined;
  DealRecipeDetail: { id: string; title: string };
  DealRecipes: { dealName: string };
};

export type RecipesStackParamList = {
  RecipeList: undefined;
  RecipeDetail: { id: string; title: string };
};

export type PremiumStackParamList = {
  PremiumHub: undefined;
  Favourites: undefined;
  FavouriteDetail: { id: string; title: string };
  PantryInput: undefined;
  PantryResults: { results: PantryMatchResult[] };
  PantryRecipeDetail: { id: string; title: string };
};

export type AccountStackParamList = {
  Account: undefined;
};

export type MainTabParamList = {
  DealsTab: undefined;
  RecipesTab: undefined;
  PremiumTab: undefined;
  AccountTab: undefined;
};

// ─── Stack navigators ─────────────────────────────────────────────────────────

const AuthStack      = createNativeStackNavigator<AuthStackParamList>();
const OnboardStack   = createNativeStackNavigator<OnboardingStackParamList>();
const RootStack      = createNativeStackNavigator<RootStackParamList>();
const DealsStack     = createNativeStackNavigator<DealsStackParamList>();
const RecipesStack   = createNativeStackNavigator<RecipesStackParamList>();
const PremiumStack   = createNativeStackNavigator<PremiumStackParamList>();
const AccountStack   = createNativeStackNavigator<AccountStackParamList>();
const MainTab        = createBottomTabNavigator<MainTabParamList>();

const headerOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.ink,
  headerTitleStyle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  headerBackTitleVisible: false,
  headerShadowVisible: false,
};

// ─── Tab stack navigators ─────────────────────────────────────────────────────

function DealsNavigator() {
  return (
    <DealsStack.Navigator screenOptions={headerOptions}>
      <DealsStack.Screen name="Deals" component={DealsScreen} options={{ headerShown: false }} />
      <DealsStack.Screen
        name="DealRecipes"
        component={DealRecipesScreen}
        options={{ title: 'Deal' }}
      />
      <DealsStack.Screen
        name="DealRecipeDetail"
        component={RecipeDetailScreen as any}
        options={({ route }) => ({ title: decodeEntities(route.params.title) })}
      />
    </DealsStack.Navigator>
  );
}

function RecipesNavigator() {
  return (
    <RecipesStack.Navigator screenOptions={headerOptions}>
      <RecipesStack.Screen name="RecipeList" component={RecipeListScreen} options={{ title: 'Recipes' }} />
      <RecipesStack.Screen
        name="RecipeDetail"
        component={RecipeDetailScreen}
        options={({ route }) => ({ title: decodeEntities(route.params.title) })}
      />
    </RecipesStack.Navigator>
  );
}

function PremiumNavigator() {
  return (
    <PremiumStack.Navigator screenOptions={headerOptions}>
      <PremiumStack.Screen name="PremiumHub" component={PremiumHubScreen} options={{ title: 'Premium' }} />
      <PremiumStack.Screen name="Favourites" component={FavouritesScreen} options={{ title: 'My Favourites' }} />
      <PremiumStack.Screen
        name="FavouriteDetail"
        component={RecipeDetailScreen as any}
        options={({ route }) => ({ title: (route.params as { title: string }).title })}
      />
      <PremiumStack.Screen name="PantryInput" component={PantryInputScreen} options={{ title: 'My Pantry' }} />
      <PremiumStack.Screen
        name="PantryResults"
        component={PantryResultsScreen}
        options={{ title: 'Matching Recipes' }}
      />
      <PremiumStack.Screen
        name="PantryRecipeDetail"
        component={RecipeDetailScreen as any}
        options={({ route }) => ({ title: (route.params as { title: string }).title })}
      />
    </PremiumStack.Navigator>
  );
}

function AccountNavigator() {
  return (
    <AccountStack.Navigator screenOptions={headerOptions}>
      <AccountStack.Screen name="Account" component={AccountScreen} options={{ title: 'Account' }} />
    </AccountStack.Navigator>
  );
}

// ─── Main 4-tab navigator ─────────────────────────────────────────────────────

function MainTabNavigator() {
  const { isPremium } = usePremium();
  const { user } = useAuth();

  return (
    <MainTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontFamily: fonts.uiMedium, fontSize: 11 },
      }}
    >
      {/* Recipes lead: the question is what to cook. Deals are the second
          tab — the same week's data entered from the ingredient side. */}
      <MainTab.Screen
        name="RecipesTab"
        component={RecipesNavigator}
        options={{
          tabBarLabel: 'Recipes',
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} />,
        }}
      />
      <MainTab.Screen
        name="DealsTab"
        component={DealsNavigator}
        options={{
          tabBarLabel: 'Deals',
          tabBarIcon: ({ color, size }) => <Ionicons name="pricetags-outline" size={size} color={color} />,
        }}
      />
      <MainTab.Screen
        name="PremiumTab"
        component={PremiumNavigator}
        options={{
          tabBarLabel: 'Premium',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="star-outline" size={size} color={isPremium ? '#BE6A43' : color} />
              {!isPremium && (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={9} color="#ffffff" />
                </View>
              )}
            </View>
          ),
        }}
      />
      <MainTab.Screen
        name="AccountTab"
        component={AccountNavigator}
        options={{
          tabBarLabel: 'Account',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </MainTab.Navigator>
  );
}

// ─── Auth wall (first open — no user, no guest mode) ─────────────────────────

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ ...headerOptions, headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen
        name="SignUp"
        component={SignUpScreen}
        options={{ headerShown: true, title: 'Create Account' }}
      />
      <AuthStack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ headerShown: true, title: 'Reset Password' }}
      />
    </AuthStack.Navigator>
  );
}

// ─── Onboarding flow (user/guest, but no store or state set yet) ──────────────

function OnboardingNavigator() {
  return (
    <OnboardStack.Navigator screenOptions={{ ...headerOptions, headerShown: false }}>
      {/* Always register both screens so the navigator doesn't unmount mid-flow */}
      <OnboardStack.Screen name="StoreSelection" component={StoreSelectionScreen} />
      <OnboardStack.Screen
        name="StateSelection"
        component={StateSelectionScreen}
        options={{ headerShown: true, title: 'Your Location' }}
      />
      {/* Reachable from the "Already have an account?" link on the first
          screen. A returning user who signs in here brings their saved store
          and state with them, which completes onboarding on the spot. */}
      <OnboardStack.Screen name="Login" component={LoginScreen} options={{ presentation: 'modal' }} />
      <OnboardStack.Screen
        name="SignUp"
        component={SignUpScreen}
        options={{ presentation: 'modal', headerShown: true, title: 'Create Account' }}
      />
    </OnboardStack.Navigator>
  );
}

// ─── Main app with modal auth screens ────────────────────────────────────────

function AppWithModalAuth() {
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="App" component={MainTabNavigator} />
      {/* Auth modals — accessible from any screen via navigation.navigate('Login') etc. */}
      <RootStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ presentation: 'modal' }}
      />
      <RootStack.Screen
        name="SignUp"
        component={SignUpScreen}
        options={{ presentation: 'modal', headerShown: true, title: 'Create Account', ...headerOptions }}
      />
      <RootStack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ presentation: 'modal', headerShown: true, title: 'Reset Password', ...headerOptions }}
      />
      {/* Change store / state modals from Account screen */}
      <RootStack.Screen
        name="StoreSelection"
        component={StoreSelectionScreen}
        options={{ presentation: 'modal' }}
      />
      <RootStack.Screen
        name="StateSelection"
        component={StateSelectionScreen}
        options={{ presentation: 'modal', headerShown: true, title: 'Change State', ...headerOptions }}
      />
      {/* Paywall lives at the root so every upgrade CTA — premium hub, account,
          and any in-context gate — opens the same screen. */}
      <RootStack.Screen
        name="Paywall"
        component={PaywallScreen}
        options={{ presentation: 'modal', headerShown: true, title: 'Premium', ...headerOptions }}
      />
    </RootStack.Navigator>
  );
}

// ─── Root navigator ───────────────────────────────────────────────────────────

export default function RootNavigator() {
  const { user, loading: authLoading, guestMode } = useAuth();
  const { selectedStore, selectedState, storeLoading } = useStore();

  const effectiveState = user?.state || selectedState;
  const isAuthenticated = !!(user || guestMode);
  const hasCompletedOnboarding = !!(selectedStore && effectiveState);

  // This component is the one place that already knows all three, so it owns
  // keeping them on every event. No account id here — that is set by identify.
  useEffect(() => {
    setAnalyticsContext({
      is_guest: !user,
      store: selectedStore ?? null,
      state: effectiveState ?? null,
    });
  }, [user, selectedStore, effectiveState]);

  if (authLoading || storeLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#36453B" />
      </View>
    );
  }

  // Each branch below is a separate tree, but they share screen names (`Login`,
  // `SignUp`, `ForgotPassword` all exist in both the auth wall and the signed-in
  // tree, where they are modals). Without a key, NavigationContainer carries the
  // current route across the swap and rehydrates the same-named route in the new
  // tree — so signing in moved from the auth wall's Login straight onto the app's
  // Login modal, looking exactly like a sign-in that did nothing. Keying by
  // branch gives each tree a clean container.
  // Onboarding comes FIRST, before any sign-in wall. A first-time user answers
  // store + state, the picker puts them in guest mode, and they land on the
  // recipes without an account. The wall is only for someone who has onboarded
  // before and then signed out — they keep their store and state, so they fall
  // through to here rather than being asked all over again.
  const treeKey = !hasCompletedOnboarding ? 'onboarding' : !isAuthenticated ? 'auth' : 'app';

  return (
    <NavigationContainer key={treeKey}>
      {!hasCompletedOnboarding ? (
        // Brand new — pick a store and state, then straight into the app
        <OnboardingNavigator />
      ) : !isAuthenticated ? (
        // Onboarded previously but signed out — show the auth wall
        <AuthNavigator />
      ) : (
        // Signed in or browsing as a guest — show main app
        <AppWithModalAuth />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#F4EEE2', justifyContent: 'center', alignItems: 'center' },
  lockBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#BE6A43',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
