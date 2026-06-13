import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipesStackParamList } from '../../navigation';
import { useRecipes } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { usePremium } from '../../context/PremiumContext';
import { Recipe, FilterType } from '../../types';
import RecipeCard from '../../components/RecipeCard';
import LoadingState from '../../components/LoadingState';
import ErrorState from '../../components/ErrorState';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeList'>;

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'quick', label: 'Quick (<30 min)' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'gluten-free', label: 'Gluten-free' },
];

const PROTEIN_FILTERS = [
  { id: 'chicken', label: 'Chicken', keywords: ['chicken'] },
  { id: 'beef',    label: 'Beef',    keywords: ['beef', 'steak', 'brisket', 'sirloin', 'rump', 'scotch fillet', 'eye fillet', 'porterhouse', 'rib'] },
  { id: 'lamb',    label: 'Lamb',    keywords: ['lamb'] },
  { id: 'pork',    label: 'Pork',    keywords: ['pork'] },
  { id: 'mince',   label: 'Mince',   keywords: ['mince', 'minced'] },
  { id: 'salmon',  label: 'Salmon',  keywords: ['salmon'] },
  { id: 'fish',    label: 'Fish',    keywords: ['fish', 'barramundi', 'snapper', 'bream', 'whiting', 'flathead', 'cod', 'tuna', 'tilapia', 'trout'] },
  { id: 'seafood', label: 'Seafood', keywords: ['prawn', 'shrimp', 'scallop', 'calamari', 'squid', 'mussel', 'crab', 'lobster', 'octopus'] },
  { id: 'turkey',  label: 'Turkey',  keywords: ['turkey'] },
  { id: 'duck',    label: 'Duck',    keywords: ['duck'] },
  { id: 'veal',    label: 'Veal',    keywords: ['veal'] },
];

const PROCESSED_INDICATORS = ['canned', 'tinned', 'stock', 'broth', 'soup', 'paste'];

function hasProteinDeal(recipe: Recipe, proteinId: string | null): boolean {
  if (!proteinId) return true;
  const protein = PROTEIN_FILTERS.find((p) => p.id === proteinId);
  if (!protein) return true;
  return (recipe.matchedDeals ?? []).some((deal) => {
    const name = ((deal.dealName || '') + ' ' + (deal.ingredient || '')).toLowerCase();
    if (PROCESSED_INDICATORS.some((ind) => name.includes(ind))) return false;
    return protein.keywords.some((kw) => name.includes(kw));
  });
}

function applyFilter(recipes: Recipe[], filter: FilterType): Recipe[] {
  switch (filter) {
    case 'quick':
      return recipes.filter((r) => r.prep_time > 0 && r.prep_time < 30);
    case 'vegetarian':
      return recipes.filter((r) =>
        r.dietary_tags?.some((t) => t.toLowerCase() === 'vegetarian')
      );
    case 'vegan':
      return recipes.filter((r) =>
        r.dietary_tags?.some((t) => t.toLowerCase() === 'vegan')
      );
    case 'gluten-free':
      return recipes.filter((r) =>
        r.dietary_tags?.some((t) => t.toLowerCase() === 'gluten-free')
      );
    default:
      return recipes;
  }
}

export default function RecipeListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { selectedState } = useStore();
  const { isPremium } = usePremium();
  const effectiveState = user?.state || selectedState;
  const { data: recipes = [], isLoading, isError, isFetching, refetch } = useRecipes(effectiveState);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [activeProtein, setActiveProtein] = useState<string | null>(null);

  const filtered = applyFilter(recipes, activeFilter).filter((r) =>
    hasProteinDeal(r, activeProtein)
  );

  if (isLoading) {
    return <LoadingState message="Finding recipes with deals…" />;
  }

  if (isError) {
    return <ErrorState message="Could not load recipes. Check your connection." onRetry={() => refetch()} />;
  }

  return (
    <View style={styles.container}>
      {/* Tag filter chips */}
      <View style={styles.filtersWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersContent}
        >
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.chip, activeFilter === f.key && styles.chipActive]}
              onPress={() => setActiveFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, activeFilter === f.key && styles.chipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Protein filter chips (premium only) */}
      {isPremium && (
        <View style={styles.proteinSection}>
          <View style={styles.proteinHeader}>
            <Text style={styles.proteinLabel}>Filter by protein on special</Text>
            {activeProtein && (
              <TouchableOpacity onPress={() => setActiveProtein(null)}>
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersContent}
          >
            {PROTEIN_FILTERS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.proteinChip, activeProtein === p.id && styles.proteinChipActive]}
                onPress={() => setActiveProtein(activeProtein === p.id ? null : p.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, activeProtein === p.id && styles.proteinChipTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            onPress={() => navigation.navigate('RecipeDetail', { id: item.id, title: item.title })}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor="#36453B"
            colors={['#36453B']}
          />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {recipes.length === 0
                ? 'No recipes found for your area.'
                : 'No recipes match this filter.'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4EEE2',
  },
  filtersWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2D8C6',
    backgroundColor: '#ffffff',
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#E2D8C6',
    backgroundColor: '#ffffff',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#36453B',
    borderColor: '#36453B',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B5F52',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  // Protein section
  proteinSection: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2D8C6',
    paddingTop: 8,
    paddingBottom: 4,
  },
  proteinHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  proteinLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B5F52',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  clearText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B5F52',
    textDecorationLine: 'underline',
  },
  proteinChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#E2D8C6',
    backgroundColor: '#ffffff',
    marginRight: 8,
  },
  proteinChipActive: {
    backgroundColor: '#BE6A43',
    borderColor: '#BE6A43',
  },
  proteinChipTextActive: {
    color: '#ffffff',
  },
  list: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  empty: {
    paddingTop: 60,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
    color: '#6B5F52',
    textAlign: 'center',
    lineHeight: 22,
  },
});
