import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FavouritesStackParamList } from '../navigation';
import { getFavorites } from '../api/recipes';
import { Recipe } from '../types';
import RecipeCard from '../components/RecipeCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';

type Props = NativeStackScreenProps<FavouritesStackParamList, 'Favourites'>;

export default function FavouritesScreen({ navigation }: Props) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFavourites = useCallback(async () => {
    setError(null);
    try {
      const data = await getFavorites();
      setRecipes(data);
    } catch {
      setError('Could not load your favourites.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchFavourites().finally(() => setLoading(false));
    }, [fetchFavourites])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFavourites();
    setRefreshing(false);
  }, [fetchFavourites]);

  if (loading) return <LoadingState message="Loading your favourites..." />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); fetchFavourites().finally(() => setLoading(false)); }} />;

  return (
    <View style={styles.container}>
      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            onPress={() =>
              navigation.navigate('FavouriteDetail', { id: item.id, title: item.title })
            }
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
            <Ionicons name="heart-outline" size={52} color="#D6EDD4" />
            <Text style={styles.emptyTitle}>No favourites yet</Text>
            <Text style={styles.emptyText}>
              Tap the heart icon on any recipe to save it here.
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
  list: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  empty: {
    paddingTop: 80,
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#5C4A35',
  },
  emptyText: {
    fontSize: 14,
    color: '#a09080',
    textAlign: 'center',
    lineHeight: 21,
  },
});
