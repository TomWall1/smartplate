import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePremium } from '../context/PremiumContext';

interface Props {
  feature: string;
  children: React.ReactNode;
  onUpgrade?: () => void;
}

export default function PremiumGate({ feature, children, onUpgrade }: Props) {
  const { isPremium } = usePremium();

  if (isPremium) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.overlay}>
        <View style={styles.lockCard}>
          <View style={styles.lockIcon}>
            <Ionicons name="lock-closed" size={32} color="#F4A94E" />
          </View>
          <Text style={styles.title}>Premium Feature</Text>
          <Text style={styles.subtitle}>{feature} is available on the Premium plan.</Text>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={onUpgrade}
            activeOpacity={0.85}
          >
            <Ionicons name="star" size={16} color="#ffffff" />
            <Text style={styles.upgradeText}>Upgrade to Premium</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDFAF5',
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
    borderColor: '#e8e0d4',
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
    fontWeight: '700',
    color: '#5C4A35',
  },
  subtitle: {
    fontSize: 14,
    color: '#a09080',
    textAlign: 'center',
    lineHeight: 20,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: '#F4A94E',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
  },
  upgradeText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
