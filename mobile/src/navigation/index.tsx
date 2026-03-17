import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { usePremium } from '../context/PremiumContext';

// Auth / onboarding screens
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import StoreSelectionScreen from '../screens/onboarding/StoreSelectionScreen';
import StateSelectionScreen from '../screens/auth/StateSelectionScreen';

// Main screens
import StoreScreen from '../screens/StoreScreen';
import RecipeListScreen from '../screens/recipes/RecipeListScreen';
import RecipeDetailScreen from '../screens/recipes/RecipeDetailScreen';
import PremiumHubScreen from '../screens/PremiumHubScreen';
import FavouritesScreen from '../screens/FavouritesScreen';
import PantryInputScreen from '../screens/pantry/PantryInputScreen';
import PantryResultsScreen from '../screens/pantry/PantryResultsScreen';
import AccountScreen from '../screens/AccountScreen';

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
};

export type RootStackParamList = {
  App: undefined;
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  StoreSelection: undefined;
  StateSelection: undefined;
};

export type StoreStackParamList = {
  Store: undefined;
  StoreRecipeDetail: { id: string; title: string };
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
  StoreTab: undefined;
  RecipesTab: undefined;
  PremiumTab: undefined;
  AccountTab: undefined;
};

// ─── Stack navigators ─────────────────────────────────────────────────────────

const AuthStack      = createNativeStackNavigator<AuthStackParamList>();
const OnboardStack   = createNativeStackNavigator<OnboardingStackParamList>();
const RootStack      = createNativeStackNavigator<RootStackParamList>();
const StoreStack     = createNativeStackNavigator<StoreStackParamList>();
const RecipesStack   = createNativeStackNavigator<RecipesStackParamList>();
const PremiumStack   = createNativeStackNavigator<PremiumStackParamList>();
const AccountStack   = createNativeStackNavigator<AccountStackParamList>();
const MainTab        = createBottomTabNavigator<MainTabParamList>();

const headerOptions = {
  headerStyle: { backgroundColor: '#ffffff' },
  headerTintColor: '#5C4A35',
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 17, color: '#5C4A35' },
  headerBackTitleVisible: false,
};

// ─── Tab stack navigators ─────────────────────────────────────────────────────

function StoreNavigator() {
  return (
    <StoreStack.Navigator screenOptions={headerOptions}>
      <StoreStack.Screen name="Store" component={StoreScreen} options={{ headerShown: false }} />
      <StoreStack.Screen
        name="StoreRecipeDetail"
        component={RecipeDetailScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
    </StoreStack.Navigator>
  );
}

function RecipesNavigator() {
  return (
    <RecipesStack.Navigator screenOptions={headerOptions}>
      <RecipesStack.Screen name="RecipeList" component={RecipeListScreen} options={{ title: 'Recipes' }} />
      <RecipesStack.Screen
        name="RecipeDetail"
        component={RecipeDetailScreen}
        options={({ route }) => ({ title: route.params.title })}
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

  return (
    <MainTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#7DB87A',
        tabBarInactiveTintColor: '#a09080',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e8e0d4',
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <MainTab.Screen
        name="StoreTab"
        component={StoreNavigator}
        options={{
          tabBarLabel: 'Store',
          tabBarIcon: ({ color, size }) => <Ionicons name="storefront-outline" size={size} color={color} />,
        }}
      />
      <MainTab.Screen
        name="RecipesTab"
        component={RecipesNavigator}
        options={{
          tabBarLabel: 'Recipes',
          tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} />,
        }}
      />
      <MainTab.Screen
        name="PremiumTab"
        component={PremiumNavigator}
        options={{
          tabBarLabel: 'Premium',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="star-outline" size={size} color={isPremium ? '#F4A94E' : color} />
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

  if (authLoading || storeLoading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#7DB87A" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {!isAuthenticated ? (
        // Not logged in and not in guest mode — show auth wall
        <AuthNavigator />
      ) : !hasCompletedOnboarding ? (
        // Logged in / guest but hasn't chosen store + state yet
        <OnboardingNavigator />
      ) : (
        // Fully onboarded — show main app
        <AppWithModalAuth />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#FDFAF5', justifyContent: 'center', alignItems: 'center' },
  lockBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F4A94E',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
