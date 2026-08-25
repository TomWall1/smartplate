import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../context/StoreContext';
import { useDeals, useDealsStatus, useRecipes } from '../api/hooks';
import { useAuth } from '../context/AuthContext';
import { formatShortDate } from '../lib/displayText';
import CategorizedDeals from '../components/CategorizedDeals';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { colors, fonts, type, spacing, radius, storeColors } from '../theme';

export default function DealsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { selectedStore, selectedState } = useStore();

  const store = selectedStore ?? 'woolworths';
  const state = user?.state || selectedState;
  const cfg = storeColors[store] ?? storeColors.woolworths;

  const dealsQuery = useDeals(store, state);
  const statusQuery = useDealsStatus();
  // Already cached by the Recipes tab — reused here only to count how many
  // recipes each deal feeds into.
  const { data: recipes = [] } = useRecipes(state, store);

  const onRefresh = useCallback(() => {
    dealsQuery.refetch();
  }, [dealsQuery]);

  if (dealsQuery.isLoading) return <LoadingState message={`Loading ${cfg.name} deals…`} />;
  if (dealsQuery.isError) {
    return <ErrorState message="Could not load deals. Check your connection." onRetry={() => dealsQuery.refetch()} />;
  }

  const deals = dealsQuery.data ?? [];

  // deal name → how many recipes use it, matched the same way the deal detail
  // screen matches (lower-cased name against matchedDeals.dealName).
  const recipeCounts: Record<string, number> = {};
  for (const r of recipes) {
    for (const md of r.matchedDeals ?? []) {
      const key = (md.dealName ?? '').toLowerCase();
      if (key) recipeCounts[key] = (recipeCounts[key] ?? 0) + 1;
    }
  }

  const updated = formatShortDate(statusQuery.data?.lastUpdated);
  const validUntil = formatShortDate(deals.find((d: any) => d.validUntil)?.validUntil);

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={dealsQuery.isFetching}
          onRefresh={onRefresh}
          tintColor={cfg.color}
          colors={[cfg.color]}
        />
      }
    >
      {/* Store header — extends under the status bar, content padded by inset */}
      <View style={[styles.storeHeader, { backgroundColor: cfg.color, paddingTop: insets.top + spacing.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.storeHeaderName}>{cfg.name}</Text>
          <Text style={styles.storeHeaderSub}>This week's specials</Text>
        </View>
        <TouchableOpacity style={styles.changeStoreBtn} onPress={() => navigation.navigate('StoreSelection')} activeOpacity={0.85}>
          <Text style={styles.changeStoreTxt}>Change</Text>
        </TouchableOpacity>
      </View>

      {/* Grouped into collapsible category cards. Tapping one opens the deal
          itself: what it costs, and everything you could cook with it. */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="pricetags-outline" size={18} color={colors.ink} />
          <Text style={styles.sectionTitle}>Deals this week</Text>
          <Text style={styles.sectionCount}>{deals.length}</Text>
        </View>
        {(updated || validUntil) && (
          <Text style={styles.freshness}>
            {updated ? `Updated ${updated}` : ''}
            {updated && validUntil ? ' · ' : ''}
            {validUntil ? `valid until ${validUntil}` : ''}
          </Text>
        )}

        <CategorizedDeals
          deals={deals}
          recipeCounts={recipeCounts}
          onDealPress={(d) => navigation.navigate('DealRecipes', { dealName: d.name })}
        />
      </View>

      <View style={{ height: spacing.xxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  storeHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  storeHeaderName: { fontFamily: fonts.display, fontSize: 24, color: colors.white },
  storeHeaderSub: { fontFamily: fonts.ui, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  changeStoreBtn: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  changeStoreTxt: { color: colors.white, fontFamily: fonts.uiMedium, fontSize: 13 },
  freshness: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.inkFaint,
    marginBottom: spacing.md,
  },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { ...type.heading, fontFamily: fonts.display, color: colors.ink, flex: 1 },
  sectionCount: { fontFamily: fonts.uiMedium, fontSize: 14, color: colors.inkFaint },
});
