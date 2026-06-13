import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { useDeals, useRecipes } from '../api/hooks';
import { FilterType } from '../types';
import { FILTERS, applyFilter } from '../lib/recipeFilters';
import RecipeCard from '../components/RecipeCard';
import CategorizedDeals from '../components/CategorizedDeals';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { colors, fonts, type, spacing, radius, storeColors } from '../theme';

const RECIPES_PER_PAGE = 6;

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
  const [filter, setFilter] = useState<FilterType>('all');
  const [displayCount, setDisplayCount] = useState(RECIPES_PER_PAGE);

  const onRefresh = useCallback(() => {
    dealsQuery.refetch();
    recipesQuery.refetch();
  }, [dealsQuery, recipesQuery]);

  const pickFilter = (key: FilterType) => {
    setFilter(key);
    setDisplayCount(RECIPES_PER_PAGE); // reset paging when the filter changes
  };

  if (dealsQuery.isLoading) return <LoadingState message={`Loading ${cfg.name} deals…`} />;
  if (dealsQuery.isError) {
    return <ErrorState message="Could not load deals. Check your connection." onRetry={() => dealsQuery.refetch()} />;
  }

  const deals = dealsQuery.data ?? [];
  const recipes = recipesQuery.data ?? [];
  const filteredRecipes = applyFilter(recipes, filter);
  const shownRecipes = filteredRecipes.slice(0, displayCount);
  const remaining = filteredRecipes.length - shownRecipes.length;

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

      {/* Recipes first (6 at a time, like the website) */}
      {effectiveState ? (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="restaurant-outline" size={18} color={colors.ink} />
            <Text style={styles.sectionTitle}>Recipes using these deals</Text>
            <TouchableOpacity onPress={() => navigation.navigate('RecipesTab')}>
              <Text style={styles.viewAll}>View all</Text>
            </TouchableOpacity>
          </View>

          {recipes.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.chip, filter === f.key && styles.chipActive]}
                  onPress={() => pickFilter(f.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {recipes.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>No recipes found. Try refreshing.</Text></View>
          ) : filteredRecipes.length === 0 ? (
            <View style={styles.emptyCard}><Text style={styles.emptyText}>No recipes match this filter.</Text></View>
          ) : (
            <>
              {shownRecipes.map((recipe) => (
                <RecipeCard
                  key={String(recipe.id)}
                  recipe={recipe}
                  onPress={() => navigation.navigate('StoreRecipeDetail', { id: String(recipe.id), title: recipe.title })}
                />
              ))}
              {remaining > 0 && (
                <TouchableOpacity
                  style={styles.showMoreBtn}
                  activeOpacity={0.85}
                  onPress={() => setDisplayCount((n) => n + RECIPES_PER_PAGE)}
                >
                  <Text style={styles.showMoreText}>Show more recipes ({remaining} more)</Text>
                </TouchableOpacity>
              )}
            </>
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

      {/* Deals below — grouped into collapsible category cards */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="pricetags-outline" size={18} color={colors.ink} />
          <Text style={styles.sectionTitle}>Deals this week</Text>
          <Text style={styles.sectionCount}>{deals.length}</Text>
        </View>
        <CategorizedDeals deals={deals} />
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
  viewAll: { fontFamily: fonts.uiMedium, fontSize: 13, color: colors.brand, textDecorationLine: 'underline' },
  chipsContent: { gap: spacing.sm, paddingBottom: spacing.md },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginRight: spacing.sm },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontFamily: fonts.uiMedium, fontSize: 13, color: colors.inkSecondary },
  chipTextActive: { color: colors.onBrand },
  showMoreBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.xs },
  showMoreText: { fontFamily: fonts.uiMedium, fontSize: 14, color: colors.brand },
  emptyCard: { backgroundColor: colors.surface, borderRadius: radius.card, padding: spacing.xl, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  emptyText: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkSecondary, textAlign: 'center' },
  setStateCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sheet, padding: spacing.lg, borderWidth: 1, borderColor: colors.brandTint, gap: spacing.md },
  setStatePrimary: { fontFamily: fonts.uiMedium, fontSize: 15, color: colors.ink },
  setStateSecondary: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary, marginTop: 2 },
});
