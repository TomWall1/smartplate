import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import SignUpScreen from '../screens/auth/SignUpScreen';
import StateSelectionScreen from '../screens/auth/StateSelectionScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Main screens
import RecipeListScreen from '../screens/recipes/RecipeListScreen';
import RecipeDetailScreen from '../screens/recipes/RecipeDetailScreen';
import PantryInputScreen from '../screens/pantry/PantryInputScreen';
import PantryResultsScreen from '../screens/pantry/PantryResultsScreen';
import FavouritesScreen from '../screens/FavouritesScreen';
import ProfileScreen from '../screens/ProfileScreen';

// Premium gate
import PremiumGate from '../components/PremiumGate';
import { PantryMatchResult } from '../types';

// ─── Param list types ─────────────────────────────────────────────────────────

// Auth-wall stack (first open, no user, no guest mode)
export type AuthStackParamList = {
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  StateSelection: undefined;
};

// Root stack used when user is logged in or in guest mode
// Auth screens sit here as modals so any tab can navigate to them
export type RootStackParamList = {
  App: undefined;
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  StateSelection: undefined;
};

export type RecipesStackParamList = {
  RecipeList: undefined;
  RecipeDetail: { id: string; title: string };
};

export type PantryStackParamList = {
  PantryInput: undefined;
  PantryResults: { results: PantryMatchResult[] };
  PantryRecipeDetail: { id: string; title: string };
};

export type FavouritesStackParamList = {
  Favourites: undefined;
  FavouriteDetail: { id: string; title: string };
};

export type ProfileStackParamList = {
  Profile: undefined;
  ProfileStateSelection: undefined;
};

export type MainTabParamList = {
  RecipesTab: undefined;
  PantryTab: undefined;
  FavouritesTab: undefined;
  ProfileTab: undefined;
};

// ─── Stack navigators ─────────────────────────────────────────────────────────

const AuthStack    = createNativeStackNavigator<AuthStackParamList>();
const RootStack    = createNativeStackNavigator<RootStackParamList>();
const RecipesStack = createNativeStackNavigator<RecipesStackParamList>();
const PantryStack  = createNativeStackNavigator<PantryStackParamList>();
const FavStack     = createNativeStackNavigator<FavouritesStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const MainTab      = createBottomTabNavigator<MainTabParamList>();

const headerOptions = {
  headerStyle: { backgroundColor: '#ffffff' },
  headerTintColor: '#5C4A35',
  headerTitleStyle: { fontWeight: '700' as const, fontSize: 17, color: '#5C4A35' },
  headerBackTitleVisible: false,
};

// ─── Tab navigators ───────────────────────────────────────────────────────────

function RecipesNavigator() {
  return (
    <RecipesStack.Navigator screenOptions={headerOptions}>
      <RecipesStack.Screen name="RecipeList" component={RecipeListScreen} options={{ title: 'Recipes & Deals' }} />
      <RecipesStack.Screen
        name="RecipeDetail"
        component={RecipeDetailScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
    </RecipesStack.Navigator>
  );
}

function PantryNavigator() {
  const { isPremium } = usePremium();
  return (
    <PantryStack.Navigator screenOptions={headerOptions}>
      <PantryStack.Screen name="PantryInput" options={{ title: 'My Pantry' }}>
        {(props) => isPremium ? <PantryInputScreen {...props} /> : <PremiumGate feature="Pantry matching" />}
      </PantryStack.Screen>
      <PantryStack.Screen name="PantryResults" component={PantryResultsScreen} options={{ title: 'Matching Recipes' }} />
      <PantryStack.Screen
        name="PantryRecipeDetail"
        component={RecipeDetailScreen as any}
        options={({ route }) => ({ title: (route.params as { title: string }).title })}
      />
    </PantryStack.Navigator>
  );
}

function FavouritesNavigator() {
  const { isPremium } = usePremium();
  return (
    <FavStack.Navigator screenOptions={headerOptions}>
      <FavStack.Screen name="Favourites" options={{ title: 'My Favourites' }}>
        {(props) => isPremium ? <FavouritesScreen {...props} /> : <PremiumGate feature="Saved favourites" />}
      </FavStack.Screen>
      <FavStack.Screen
        name="FavouriteDetail"
        component={RecipeDetailScreen as any}
        options={({ route }) => ({ title: (route.params as { title: string }).title })}
      />
    </FavStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={headerOptions}>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'My Profile' }} />
      <ProfileStack.Screen name="ProfileStateSelection" component={StateSelectionScreen} options={{ title: 'Change State' }} />
    </ProfileStack.Navigator>
  );
}

function MainTabNavigator() {
  const { isPremium } = usePremium();
  return (
    <MainTab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#7DB87A',
        tabBarInactiveTintColor: '#a09080',
        tabBarStyle: { backgroundColor: '#ffffff', borderTopColor: '#e8e0d4', borderTopWidth: 1, paddingBottom: 4, height: 60 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <MainTab.Screen
        name="RecipesTab"
        component={RecipesNavigator}
        options={{ tabBarLabel: 'Recipes', tabBarIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} /> }}
      />
      <MainTab.Screen
        name="PantryTab"
        component={PantryNavigator}
        options={{
          tabBarLabel: 'Pantry',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="basket-outline" size={size} color={color} />
              {!isPremium && <View style={styles.lockBadge}><Ionicons name="lock-closed" size={9} color="#ffffff" /></View>}
            </View>
          ),
        }}
      />
      <MainTab.Screen
        name="FavouritesTab"
        component={FavouritesNavigator}
        options={{
          tabBarLabel: 'Favourites',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="heart-outline" size={size} color={color} />
              {!isPremium && <View style={styles.lockBadge}><Ionicons name="lock-closed" size={9} color="#ffffff" /></View>}
            </View>
          ),
        }}
      />
      <MainTab.Screen
        name="ProfileTab"
        component={ProfileNavigator}
        options={{ tabBarLabel: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }}
      />
    </MainTab.Navigator>
  );
}

// ─── Auth wall (shown on first open before any choice is made) ────────────────

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ ...headerOptions, headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} options={{ headerShown: true, title: 'Create Account' }} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ headerShown: true, title: 'Reset Password' }} />
      <AuthStack.Screen name="StateSelection" component={StateSelectionScreen} options={{ headerShown: true, title: 'Your Location' }} />
    </AuthStack.Navigator>
  );
}

// ─── Root (user/guest mode): main app + modal auth screens ───────────────────

function AppWithModalAuth() {
  const { user } = useAuth();
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      <RootStack.Screen name="App" component={MainTabNavigator} />
      {/* Auth screens as modals — navigable from any tab via navigation.navigate('Login') etc. */}
      <RootStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ presentation: 'modal', headerShown: false }}
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
      {/* State selection shown as modal when user has no state set */}
      <RootStack.Screen
        name="StateSelection"
        component={StateSelectionScreen}
        options={{ presentation: 'modal', headerShown: true, title: 'Your Location', ...headerOptions }}
      />
    </RootStack.Navigator>
  );
}

// ─── Root navigator ───────────────────────────────────────────────────────────

export default function RootNavigator() {
  const { user, loading, guestMode } = useAuth();

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#7DB87A" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user || guestMode ? <AppWithModalAuth /> : <AuthNavigator />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: '#FDFAF5', justifyContent: 'center', alignItems: 'center' },
  lockBadge: {
    position: 'absolute', top: -2, right: -4,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#F4A94E', justifyContent: 'center', alignItems: 'center',
  },
});
