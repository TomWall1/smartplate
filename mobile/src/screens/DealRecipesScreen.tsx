import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StoreStackParamList } from '../navigation';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { useRecipes } from '../api/hooks';
import RecipeCard from '../components/RecipeCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { colors, fonts, spacing } from '../theme';

type Props = NativeStackScreenProps<StoreStackParamList, 'DealRecipes'>;

export default function DealRecipesScreen({ route, navigation }: Props) {
  const { dealName } = route.params;
  const { user } = useAuth();
  const { selectedStore, selectedState } = useStore();
  const store = selectedStore ?? 'woolworths';
  const state = user?.state || selectedState;

  const { data: recipes = [], isLoading, isError, refetch } = useRecipes(state, store);

  const target = dealName.toLowerCase();
  const matching = recipes.filter((r) =>
    (r.matchedDeals ?? []).some((d) => (d.dealName ?? '').toLowerCase() === target)
  );

  if (isLoading) return <LoadingState message="Finding recipes…" />;
  if (isError) return <ErrorState message="Could not load recipes." onRetry={() => refetch()} />;

  return (
    <FlatList
      style={styles.container}
      data={matching}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <RecipeCard
          recipe={item}
          onPress={() => navigation.navigate('StoreRecipeDetail', { id: String(item.id), title: item.title })}
        />
      )}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Recipes using</Text>
          <Text style={styles.title} numberOfLines={3}>{dealName}</Text>
          <Text style={styles.sub}>{matching.length} recipe{matching.length !== 1 ? 's' : ''}</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}><Text style={styles.emptyText}>No recipes use this deal this week.</Text></View>
      }
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: 2 },
  eyebrow: { fontFamily: fonts.uiMedium, fontSize: 12, color: colors.brand, textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, lineHeight: 28 },
  sub: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary, marginTop: 2 },
  empty: { paddingTop: 60, alignItems: 'center', paddingHorizontal: spacing.xxl },
  emptyText: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkSecondary, textAlign: 'center' },
});
