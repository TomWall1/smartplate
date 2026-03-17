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

const PREMIUM_FEATURES = [
  {
    key: 'favourites',
    title: 'Favourites',
    description: 'Save recipes you love',
    icon: 'heart-outline' as const,
    color: '#D4667A',
    screen: 'Favourites',
  },
  {
    key: 'mealplan',
    title: 'Meal Planner',
    description: 'Plan your week ahead',
    icon: 'calendar-outline' as const,
    color: '#7DB87A',
    screen: null, // coming soon
  },
  {
    key: 'shopping',
    title: 'Shopping List',
    description: 'Auto-build from recipes',
    icon: 'bag-handle-outline' as const,
    color: '#F4A94E',
    screen: null,
  },
  {
    key: 'pricealerts',
    title: 'Price Alerts',
    description: 'Get notified on deals',
    icon: 'notifications-outline' as const,
    color: '#6366f1',
    screen: null,
  },
  {
    key: 'pantry',
    title: 'Pantry Matching',
    description: 'Cook from what you have',
    icon: 'basket-outline' as const,
    color: '#0891b2',
    screen: 'PantryInput',
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
            <Ionicons name="star" size={36} color="#F4A94E" />
          </View>
          <Text style={styles.upgradeTitle}>Deal to Dish Premium</Text>
          <Text style={styles.upgradeSubtitle}>
            Unlock powerful tools to save more money and cook smarter.
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
          onPress={() => {
            if (!user) navigation.navigate('Login');
          }}
        >
          <Text style={styles.upgradeButtonText}>
            {user ? 'Upgrade to Premium' : 'Sign in to upgrade'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.upgradeNote}>Premium features coming soon — stay tuned!</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.hubContent}>
      <Text style={styles.hubTitle}>Premium Features</Text>
      <Text style={styles.hubSubtitle}>Everything you need to cook smart and save more</Text>

      <View style={styles.grid}>
        {PREMIUM_FEATURES.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={styles.featureCard}
            activeOpacity={0.8}
            onPress={() => {
              if (f.screen) navigation.navigate(f.screen);
            }}
            disabled={!f.screen}
          >
            <View style={[styles.featureIcon, { backgroundColor: f.color + '18' }]}>
              <Ionicons name={f.icon} size={32} color={f.color} />
            </View>
            <Text style={styles.featureTitle}>{f.title}</Text>
            <Text style={styles.featureDesc} numberOfLines={2}>{f.description}</Text>
            {!f.screen && (
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>Soon</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFAF5' },

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
  upgradeTitle: { fontSize: 24, fontWeight: '800', color: '#5C4A35', textAlign: 'center' },
  upgradeSubtitle: { fontSize: 15, color: '#a09080', textAlign: 'center', lineHeight: 22 },
  featureList: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 4,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
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
  featureRowTitle: { fontSize: 15, fontWeight: '700', color: '#5C4A35' },
  featureRowDesc: { fontSize: 13, color: '#a09080', marginTop: 1 },
  upgradeButton: {
    backgroundColor: '#F4A94E',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  upgradeButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  upgradeNote: { fontSize: 13, color: '#a09080', textAlign: 'center' },

  // Premium hub view (for premium users)
  hubContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 20,
  },
  hubTitle: { fontSize: 22, fontWeight: '800', color: '#5C4A35' },
  hubSubtitle: { fontSize: 14, color: '#a09080', marginTop: -12 },
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
    borderColor: '#e8e0d4',
    gap: 10,
    shadowColor: '#5C4A35',
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
  featureTitle: { fontSize: 15, fontWeight: '700', color: '#5C4A35' },
  featureDesc: { fontSize: 12, color: '#a09080', lineHeight: 18 },
  comingSoonBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0ede8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  comingSoonText: { fontSize: 10, fontWeight: '700', color: '#a09080' },
});
