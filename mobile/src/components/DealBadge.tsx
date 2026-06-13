import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MatchedDeal } from '../types';

interface Props {
  deal: MatchedDeal;
}

// Shown under a recipe ingredient that's on special. No store tag — the detail
// page is already isolated to the selected store — just the catalogue product
// name + price + saving (matches the website).
export default function DealBadge({ deal }: Props) {
  const saving = deal.saving ?? 0;
  return (
    <View style={styles.container}>
      <Ionicons name="pricetag" size={12} color="#BE6A43" />
      {!!deal.dealName && <Text style={styles.name} numberOfLines={1}>{deal.dealName}</Text>}
      {deal.price != null && <Text style={styles.price}>${deal.price.toFixed(2)}</Text>}
      {saving > 0 && <Text style={styles.savings}>save ${saving.toFixed(2)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2, marginLeft: 17 },
  name: { fontSize: 12, fontFamily: 'Inter_500Medium', color: '#6B5F52', flexShrink: 1 },
  price: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#2A241F' },
  savings: { fontSize: 12, color: '#BE6A43', fontFamily: 'Inter_500Medium' },
});
