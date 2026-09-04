import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { usePremium } from '../context/PremiumContext';
import { useAuth } from '../context/AuthContext';

// Shipped features only. Anything listed here works the moment someone pays —
// placeholder content is an App Review 2.1 rejection, and advertising it on a
// paid tier is a 2.3.1 one. Favourites used to be on this list; it is free now,
// and lives with the recipes where people actually save things.
const PREMIUM_FEATURES = [
  {
    key: 'pantry',
    title: 'Pantry matching',
    description: 'Cook from what you have',
    icon: 'basket-outline' as const,
    color: '#0891b2',
    screen: 'PantryInput',
  },
  {
    key: 'alerts',
    title: 'Price alerts',
    description: 'Know when it goes on special',
    icon: 'notifications-outline' as const,
    color: '#BE6A43',
    screen: 'PriceAlerts',
  },
  {
    key: 'list',
    title: 'Shopping list',
    description: 'Built from the recipes you pick',
    icon: 'cart-outline' as const,
    color: '#36453B',
    screen: 'ShoppingList',
  },
  {
    key: 'costing',
    title: 'Cost per serve',
    description: 'Scaled to your household',
    icon: 'wallet-outline' as const,
    color: '#7C6A9C',
    // Renders on every recipe rather than being a screen of its own, so it
    // has no tile on the hub — see HUB_TILES.
    screen: null,
  },
];

// What the hub grid shows a subscriber. Every tile here is somewhere to go:
// "Cost per serve" had one, but with no screen behind it the tile just
// bounced you to the recipe list, which reads as a dead card. It stays in
// PREMIUM_FEATURES above, where it is a reason to subscribe.
//
// Saved recipes is FREE and lives in the recipes stack. It is here as a way
// through, not as a paid feature — which is why it is absent from the
// upgrade list, where advertising a free feature as premium would be a 2.3.1
// problem.
const HUB_TILES = [
  ...PREMIUM_FEATURES.filter((f) => f.screen !== null).map((f) => ({ ...f, tab: null as string | null })),
  {
    key: 'saved',
    title: 'Saved recipes',
    description: 'The ones you kept',
    icon: 'heart-outline' as const,
    color: '#BE6A43',
    screen: 'Favourites',
    tab: 'RecipesTab' as string | null,
  },
];

export default function PremiumHubScreen() {
  const navigation = useNavigation<any>();
  const { isPremium } = usePremium();
  const { user } = useAuth();

  if (!isPremium) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.upgradeContent}>
        <View style={styles.upgradeHeader}>
          <View style={styles.crownCircle}>
            <Ionicons name="star" size={36} color="#BE6A43" />
          </View>
          <Text style={styles.upgradeTitle}>Deals to Dish Premium</Text>
          <Text style={styles.upgradeSubtitle}>
            Cook from what is on special and what is already in your cupboard.
          </Text>
        </View>

        <View style={styles.featureList}>
          {PREMIUM_FEATURES.map((f) => (
            <View key={f.key} style={styles.featureRow}>
              <View style={[styles.featureIconSmall, { backgroundColor: f.color + '20' }]}>
                <Ionicons name={f.icon} size={22} color={f.color} />
              </View>
              <View style={styles.featureRowText}>
                <Text style={styles.featureRowTitle}>{f.title}</Text>
                <Text style={styles.featureRowDesc}>{f.description}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={22} color={f.color} />
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={styles.upgradeButton}
          activeOpacity={0.85}
          onPress={() => navigation.navigate(user ? 'Paywall' : 'Login')}
        >
          <Text style={styles.upgradeButtonText}>
            {user ? 'See plans' : 'Sign in to subscribe'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.hubContent}>
      {/* No heading here. The stack header already reads "Premium" on the
          same off-white, exactly as the recipes tab does — repeating it in
          the body said the word twice and pushed the tiles down. */}
      <View style={styles.grid}>
        {HUB_TILES.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={styles.featureCard}
            activeOpacity={0.8}
            onPress={() =>
              f.tab
                // Saved recipes lives in the recipes stack. `initial: false`
                // puts the recipe list underneath it, which is what makes
                // the back button work.
                ? navigation.navigate(f.tab, { screen: f.screen, initial: false })
                : navigation.navigate(f.screen as never)
            }
          >
            <View style={[styles.featureIcon, { backgroundColor: f.color + '18' }]}>
              <Ionicons name={f.icon} size={32} color={f.color} />
            </View>
            <Text style={styles.featureTitle}>{f.title}</Text>
            <Text style={styles.featureDesc} numberOfLines={2}>{f.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4EEE2' },

  // Premium upgrade view
  upgradeContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
    gap: 24,
  },
  upgradeHeader: { alignItems: 'center', gap: 12 },
  crownCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  upgradeTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', color: '#2A241F', textAlign: 'center' },
  upgradeSubtitle: { fontSize: 15, color: '#6B5F52', textAlign: 'center', lineHeight: 22 },
  featureList: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 4,
    borderWidth: 1.5,
    borderColor: '#E2D8C6',
    gap: 2,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },
  featureIconSmall: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureRowText: { flex: 1 },
  featureRowTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#2A241F' },
  featureRowDesc: { fontSize: 13, color: '#6B5F52', marginTop: 1 },
  upgradeButton: {
    backgroundColor: '#36453B',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  upgradeButtonText: { color: '#ffffff', fontSize: 16, fontFamily: 'Inter_700Bold' },

  // Premium hub view (for premium users)
  hubContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  featureCard: {
    width: '47%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2D8C6',
    gap: 10,
    shadowColor: '#2A241F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  featureIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#2A241F' },
  featureDesc: { fontSize: 12, color: '#6B5F52', lineHeight: 18 },
});
