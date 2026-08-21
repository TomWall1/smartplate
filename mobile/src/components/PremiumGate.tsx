import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { usePremium } from '../context/PremiumContext';

interface Props {
  feature: string;
  /** Rendered only for subscribers. Omit to use this purely as a lock screen. */
  children?: React.ReactNode;
  /** Defaults to opening the paywall — override only for a different flow. */
  onUpgrade?: () => void;
}

/**
 * In-context gate for a premium screen. The premium hub already hides these
 * features from free users, so this is the second line: if a screen is reached
 * any other way, the user gets an explanation and a way to subscribe instead of
 * an API 403 rendered as an error.
 */
export default function PremiumGate({ feature, children, onUpgrade }: Props) {
  const { isPremium } = usePremium();
  const navigation = useNavigation<any>();

  if (isPremium) {
    return <>{children}</>;
  }

  const handleUpgrade = onUpgrade ?? (() => navigation.navigate('Paywall'));

  return (
    <View style={styles.container}>
      <View style={styles.overlay}>
        <View style={styles.lockCard}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={32} color="#BE6A43" />
          </View>
          <Text style={styles.title}>Premium feature</Text>
          <Text style={styles.subtitle}>{feature} is part of the Premium plan.</Text>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={handleUpgrade}
            activeOpacity={0.85}
          >
            <Ionicons name="star" size={16} color="#ffffff" />
            <Text style={styles.upgradeText}>See plans</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4EEE2',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  lockCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#E2D8C6',
    shadowColor: 'rgba(92, 74, 53, 0.08)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
    width: '100%',
  },
  lockIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFF3E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#2A241F',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B5F52',
    textAlign: 'center',
    lineHeight: 20,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: '#36453B',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
  },
  upgradeText: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
});
