import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipesStackParamList } from '../navigation';
import { useFavorites } from '../api/hooks';
import RecipeCard from '../components/RecipeCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';

type Props = NativeStackScreenProps<RecipesStackParamList, 'Favourites'>;

/**
 * Saved recipes — free for any signed-in account.
 *
 * This used to sit behind the premium gate, which is what forced the heart on
 * a recipe to fail for exactly the free users it was meant to convert. Keeping
 * something you like is the reason to make an account, not the reason to pay.
 */
export default function FavouritesScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { data: recipes = [], isLoading, isError, isFetching, refetch } = useFavorites(!!user);

  // Re-check favourites when the screen regains focus (they change elsewhere).
  useFocusEffect(useCallback(() => { if (user) refetch(); }, [refetch, user]));

  // A guest has nowhere to save to — ask for the account instead of an error.
  if (!user) {
    return (
      <View style={styles.empty}>
        <Ionicons name="heart-outline" size={52} color="#DCE4D6" />
        <Text style={styles.emptyTitle}>Save the ones you like</Text>
        <Text style={styles.emptyText}>
          A free account keeps your favourites and has next week's recipes ready when the
          catalogue changes.
        </Text>
        <TouchableOpacity
          style={styles.ctaButton}
          activeOpacity={0.85}
          onPress={() => (navigation as any).navigate('SignUp')}
        >
          <Text style={styles.ctaButtonText}>Create a free account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) return <LoadingState message="Loading your favourites…" />;
  if (isError) return <ErrorState message="Could not load your favourites." onRetry={() => refetch()} />;

  return (
    <View style={styles.container}>
      <FlatList
        data={recipes}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            onPress={() =>
              navigation.navigate('RecipeDetail', { id: String(item.id), title: item.title })
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
    flexGrow: 1,
    paddingTop: 80,
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
    backgroundColor: '#F4EEE2',
  },
  ctaButton: {
    marginTop: 8,
    backgroundColor: '#36453B',
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
  },
  ctaButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
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
