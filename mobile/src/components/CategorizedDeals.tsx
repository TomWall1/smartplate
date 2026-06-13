import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Deal } from '../types';
import { groupDealsByCategory } from '../lib/categoryMapper';
import { colors, fonts, spacing, radius, shadow } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  Proteins: 'restaurant-outline',
  'Fresh Produce': 'leaf-outline',
  'Dairy & Eggs': 'egg-outline',
  'Pantry Staples': 'cube-outline',
  Bakery: 'cafe-outline',
  Frozen: 'snow-outline',
  Other: 'pricetags-outline',
};

function DealRow({ deal }: { deal: Deal }) {
  const saving = deal.originalPrice && deal.price ? +(deal.originalPrice - deal.price).toFixed(2) : 0;
  return (
    <View style={styles.dealRow}>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={styles.dealName} numberOfLines={2}>{deal.name}</Text>
        {saving > 0 && (
          <View style={styles.savingBadge}><Text style={styles.savingText}>Save ${saving.toFixed(2)}</Text></View>
        )}
      </View>
      <Text style={styles.dealPrice}>${deal.price.toFixed(2)}</Text>
    </View>
  );
}

function CategoryCard({ name, deals }: { name: string; deals: Deal[] }) {
  const [open, setOpen] = useState(false); // all collapsed by default
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };
  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.header} onPress={toggle} activeOpacity={0.8}>
        <Ionicons name={ICONS[name] ?? 'pricetags-outline'} size={20} color={colors.brand} />
        <Text style={styles.headerTitle}>{name}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{deals.length}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSecondary} />
      </TouchableOpacity>
      {open && (
        <View style={styles.body}>
          {deals.map((d, i) => <DealRow key={`${d.name}-${i}`} deal={d} />)}
        </View>
      )}
    </View>
  );
}

export default function CategorizedDeals({ deals }: { deals: Deal[] }) {
  const groups = groupDealsByCategory(deals);
  if (groups.length === 0) {
    return (
      <View style={styles.empty}><Text style={styles.emptyText}>No deals to display.</Text></View>
    );
  }
  return (
    <View style={{ gap: spacing.md }}>
      {groups.map((g) => <CategoryCard key={g.name} name={g.name} deals={g.deals} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.card },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerTitle: { flex: 1, fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  countBadge: { backgroundColor: colors.brandTint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  countText: { fontFamily: fonts.uiMedium, fontSize: 12, color: colors.brand },
  body: { borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  dealRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  dealName: { fontFamily: fonts.uiMedium, fontSize: 14, color: colors.ink, lineHeight: 20 },
  savingBadge: { alignSelf: 'flex-start', backgroundColor: colors.accentTint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  savingText: { fontFamily: fonts.uiMedium, fontSize: 11, color: colors.accent },
  dealPrice: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  empty: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyText: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkSecondary, textAlign: 'center' },
});
