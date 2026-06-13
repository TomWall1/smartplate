import React, { useCallback } from 'react';
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
import { PremiumStackParamList } from '../navigation';
import { useFavorites } from '../api/hooks';
import RecipeCard from '../components/RecipeCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';

type Props = NativeStackScreenProps<PremiumStackParamList, 'Favourites'>;

export default function FavouritesScreen({ navigation }: Props) {
  const { data: recipes = [], isLoading, isError, isFetching, refetch } = useFavorites();

  // Re-check favourites when the tab regains focus (they change elsewhere).
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  if (isLoading) return <LoadingState message="Loading your favourites…" />;
  if (isError) return <ErrorState message="Could not load your favourites." onRetry={() => refetch()} />;

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
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor="#36453B"
            colors={['#36453B']}
          />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={52} color="#DCE4D6" />
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
    backgroundColor: '#F4EEE2',
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
    fontFamily: 'Inter_700Bold',
    color: '#2A241F',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B5F52',
    textAlign: 'center',
    lineHeight: 21,
  },
});
