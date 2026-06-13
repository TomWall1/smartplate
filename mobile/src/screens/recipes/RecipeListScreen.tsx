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
import { FilterType } from '../../types';
import RecipeCard from '../../components/RecipeCard';
import ErrorState from '../../components/ErrorState';
import RecipeListSkeleton from '../../components/RecipeListSkeleton';
import { FILTERS, PROTEIN_FILTERS, applyFilter, hasProteinDeal } from '../../lib/recipeFilters';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeList'>;

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
    return <RecipeListSkeleton />;
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
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            onPress={() => navigation.navigate('RecipeDetail', { id: String(item.id), title: item.title })}
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
    fontFamily: 'Inter_600SemiBold',
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
    fontFamily: 'Inter_700Bold',
    color: '#6B5F52',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  clearText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
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
