import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Deal } from '../types';

interface Props {
  deal: Deal;
}

const STORE_COLORS: Record<string, string> = {
  woolworths: '#007833',
  coles: '#e31837',
  iga: '#003da5',
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function DealBadge({ deal }: Props) {
  const storeColor = STORE_COLORS[deal.store.toLowerCase()] ?? '#7DB87A';

  return (
    <View style={styles.container}>
      <View style={[styles.storePill, { backgroundColor: storeColor }]}>
        <Text style={styles.storeText}>{capitalize(deal.store)}</Text>
      </View>
      <Text style={styles.price}>${deal.price.toFixed(2)}</Text>
      {deal.savings > 0 && (
        <Text style={styles.savings}>· save ${deal.savings.toFixed(2)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  storePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  storeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  price: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5C4A35',
  },
  savings: {
    fontSize: 13,
    color: '#3D7A3A',
    fontWeight: '500',
  },
});
