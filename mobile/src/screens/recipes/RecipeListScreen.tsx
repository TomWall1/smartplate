import React, { useState, useEffect, useCallback } from 'react';
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
import { getRecipeSuggestions } from '../../api/recipes';
import { useAuth } from '../../context/AuthContext';
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
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  const fetchRecipes = useCallback(async () => {
    if (!user?.state) return;
    setError(null);
    try {
      const data = await getRecipeSuggestions(user.state);
      setRecipes(data);
    } catch (err: any) {
      setError('Could not load recipes. Please check your connection.');
    }
  }, [user?.state]);

  useEffect(() => {
    setLoading(true);
    fetchRecipes().finally(() => setLoading(false));
  }, [fetchRecipes]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRecipes();
    setRefreshing(false);
  }, [fetchRecipes]);

  const filtered = applyFilter(recipes, activeFilter);

  if (loading) {
    return <LoadingState message="Finding recipes with deals..." />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => { setLoading(true); fetchRecipes().finally(() => setLoading(false)); }} />;
  }

  return (
    <View style={styles.container}>
      {/* Filter chips */}
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
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#7DB87A"
            colors={['#7DB87A']}
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
    backgroundColor: '#FDFAF5',
  },
  filtersWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: '#e8e0d4',
    backgroundColor: '#ffffff',
  },
  filtersContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
    backgroundColor: '#ffffff',
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: '#7DB87A',
    borderColor: '#7DB87A',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#a09080',
  },
  chipTextActive: {
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
    color: '#a09080',
    textAlign: 'center',
    lineHeight: 22,
  },
});
