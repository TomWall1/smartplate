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

// Shipped features only. Meal Planner, Shopping List and Price Alerts used to
// sit here with `screen: null` and a "Soon" badge — placeholder content is an
// App Review 2.1 rejection, and advertising it on a paid tier is a 2.3.1 one.
// Each goes back in the release that implements it.
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
    key: 'favourites',
    title: 'Favourites',
    description: 'Save recipes you love',
    icon: 'heart-outline' as const,
    color: '#D4667A',
    screen: 'Favourites',
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
      <Text style={styles.hubTitle}>Premium</Text>
      <Text style={styles.hubSubtitle}>Cook smart and save more</Text>

      <View style={styles.grid}>
        {PREMIUM_FEATURES.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={styles.featureCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate(f.screen)}
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
  hubTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#2A241F' },
  hubSubtitle: { fontSize: 14, color: '#6B5F52', marginTop: -12 },
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
