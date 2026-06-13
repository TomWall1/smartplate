import React, { useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { useDeals, useRecipes } from '../api/hooks';
import { Deal } from '../types';
import RecipeCard from '../components/RecipeCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { colors, fonts, type, spacing, radius, shadow, storeColors } from '../theme';

function DealItem({ deal }: { deal: Deal }) {
  const saving = deal.originalPrice && deal.price ? +(deal.originalPrice - deal.price).toFixed(2) : 0;
  return (
    <View style={styles.dealCard}>
      <View style={styles.dealInfo}>
        <Text style={styles.dealName} numberOfLines={2}>{deal.name}</Text>
        {saving > 0 && (
          <View style={styles.savingsBadge}>
            <Text style={styles.savingsText}>Save ${saving.toFixed(2)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.dealPrice}>${deal.price.toFixed(2)}</Text>
    </View>
  );
}

export default function StoreScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { selectedStore, selectedState } = useStore();

  const effectiveState = user?.state || selectedState;
  const store = selectedStore ?? 'woolworths';
  const cfg = storeColors[store] ?? storeColors.woolworths;

  const dealsQuery = useDeals(store);
  const recipesQuery = useRecipes(effectiveState, store);

  const onRefresh = useCallback(() => {
    dealsQuery.refetch();
    recipesQuery.refetch();
  }, [dealsQuery, recipesQuery]);

  if (dealsQuery.isLoading) return <LoadingState message={`Loading ${cfg.name} deals…`} />;
  if (dealsQuery.isError) {
    return <ErrorState message="Could not load deals. Check your connection." onRetry={() => dealsQuery.refetch()} />;
  }

  const deals = dealsQuery.data ?? [];
  const recipes = recipesQuery.data ?? [];

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={dealsQuery.isFetching || recipesQuery.isFetching}
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
          <Text style={styles.storeHeaderSub}>This week's deals & recipes</Text>
        </View>
        <TouchableOpacity style={styles.changeStoreBtn} onPress={() => navigation.navigate('StoreSelection')} activeOpacity={0.85}>
          <Text style={styles.changeStoreTxt}>Change</Text>
        </TouchableOpacity>
      </View>

      {/* Recipes first (matches the website) */}
      {effectiveState ? (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="restaurant-outline" size={18} color={colors.ink} />
            <Text style={styles.sectionTitle}>Recipes using these deals</Text>
            <Text style={styles.sectionCount}>{recipes.length}</Text>
          </View>
          {recipes.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>No recipes found. Try refreshing.</Text></View>
          ) : (
            recipes.map((recipe) => (
              <RecipeCard
                key={String(recipe.id)}
                recipe={recipe}
                onPress={() => navigation.navigate('StoreRecipeDetail', { id: String(recipe.id), title: recipe.title })}
              />
            ))
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <TouchableOpacity style={styles.setStateCard} onPress={() => navigation.navigate('StateSelection')} activeOpacity={0.85}>
            <Ionicons name="location-outline" size={24} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.setStatePrimary}>Set your state</Text>
              <Text style={styles.setStateSecondary}>Get recipes matched to your area</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
          </TouchableOpacity>
        </View>
      )}

      {/* Deals below */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="pricetags-outline" size={18} color={colors.ink} />
          <Text style={styles.sectionTitle}>Deals this week</Text>
          <Text style={styles.sectionCount}>{deals.length}</Text>
        </View>
        {deals.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyText}>No deals loaded yet. Pull to refresh.</Text></View>
        ) : (
          <FlatList
            data={deals.slice(0, 30)}
            keyExtractor={(item, index) => `${item.name}-${index}`}
            renderItem={({ item }) => <DealItem deal={item} />}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          />
        )}
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
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { ...type.heading, fontFamily: fonts.display, color: colors.ink, flex: 1 },
  sectionCount: { fontFamily: fonts.uiMedium, fontSize: 14, color: colors.inkFaint },
  dealCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md, ...shadow.card },
  dealInfo: { flex: 1, gap: spacing.xs },
  dealName: { fontFamily: fonts.uiMedium, fontSize: 14, color: colors.ink, lineHeight: 20 },
  savingsBadge: { alignSelf: 'flex-start', backgroundColor: colors.accentTint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  savingsText: { fontFamily: fonts.uiMedium, fontSize: 11, color: colors.accent },
  dealPrice: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyText: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkSecondary, textAlign: 'center' },
  setStateCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sheet, padding: spacing.lg, borderWidth: 1, borderColor: colors.brandTint, gap: spacing.md },
  setStatePrimary: { fontFamily: fonts.uiMedium, fontSize: 15, color: colors.ink },
  setStateSecondary: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary, marginTop: 2 },
});
