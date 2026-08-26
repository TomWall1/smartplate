import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { DealsStackParamList } from '../navigation';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { useDeals, useDealsStatus, useRecipes } from '../api/hooks';
import RecipeCard from '../components/RecipeCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { colors, fonts, spacing, radius, shadow } from '../theme';
import { decodeEntities, dealImageUrl, formatShortDate } from '../lib/displayText';

type Props = NativeStackScreenProps<DealsStackParamList, 'DealRecipes'>;

export default function DealRecipesScreen({ route, navigation }: Props) {
  const { dealName } = route.params;
  const { user } = useAuth();
  const { selectedStore, selectedState } = useStore();
  const store = selectedStore ?? 'woolworths';
  const state = user?.state || selectedState;

  const { data: recipes = [], isLoading, isError, refetch } = useRecipes(state, store);
  // Look the deal up rather than passing it through the route: this list is
  // already cached for the Deals screen, so it costs nothing.
  const { data: deals = [] } = useDeals(store, state);
  const statusQuery = useDealsStatus();

  const target = dealName.toLowerCase();
  const deal = deals.find((d) => d.name.toLowerCase() === target);
  const matching = recipes.filter((r) =>
    (r.matchedDeals ?? []).some((d) => (d.dealName ?? '').toLowerCase() === target)
  );

  if (isLoading) return <LoadingState message="Finding recipes…" />;
  if (isError) return <ErrorState message="Could not load recipes." onRetry={() => refetch()} />;

  const image = dealImageUrl(deal);
  const updated = formatShortDate(statusQuery.data?.lastUpdated);
  const validUntil = formatShortDate((deal as any)?.validUntil);
  // Show the unit only when the catalogue actually stated a weight one.
  // Anything else stays a bare price rather than implying a per-item total.
  const rawUnit = (deal?.unit ?? '').toLowerCase().replace(/^per\s+/, '');
  const weightUnit = ['kg', 'g', 'litre', 'l', 'ml'].includes(rawUnit) ? rawUnit : null;
  const wasPrice = deal?.originalPrice;
  const saving = wasPrice && deal ? wasPrice - deal.price : undefined;

  return (
    <FlatList
      style={styles.container}
      data={matching}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <RecipeCard
          recipe={item}
          onPress={() =>
            navigation.navigate('DealRecipeDetail', { id: String(item.id), title: item.title })
          }
        />
      )}
      ListHeaderComponent={
        <View>
          <View style={styles.dealCard}>
            {image ? (
              <Image source={image} style={styles.dealImage} contentFit="contain" transition={150} />
            ) : null}
            <Text style={styles.dealName}>{decodeEntities(dealName)}</Text>

            {deal ? (
              <View style={styles.priceRow}>
                <Text style={styles.price}>
                  ${deal.price.toFixed(2)}
                  {weightUnit ? <Text style={styles.perUnit}> per {weightUnit}</Text> : null}
                </Text>
                {wasPrice ? <Text style={styles.wasPrice}>was ${wasPrice.toFixed(2)}</Text> : null}
                {saving && saving > 0 ? (
                  <View style={styles.savingPill}>
                    <Text style={styles.savingText}>Save ${saving.toFixed(2)}</Text>
                  </View>
                ) : deal.discountPercentage ? (
                  <View style={styles.savingPill}>
                    <Text style={styles.savingText}>{Math.round(deal.discountPercentage)}% off</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {deal?.category ? <Text style={styles.category}>{deal.category}</Text> : null}

            {(updated || validUntil) && (
              <Text style={styles.freshness}>
                {updated ? `Updated ${updated}` : ''}
                {updated && validUntil ? ' · ' : ''}
                {validUntil ? `valid until ${validUntil}` : ''}
              </Text>
            )}
          </View>

          <View style={styles.listHeading}>
            <Text style={styles.eyebrow}>What you could cook</Text>
            <Text style={styles.count}>
              {matching.length} recipe{matching.length !== 1 ? 's' : ''} use this
            </Text>
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No recipes use this deal this week.</Text>
        </View>
      }
      contentContainerStyle={{ paddingBottom: spacing.xxl }}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  dealCard: {
    backgroundColor: colors.surface,
    margin: spacing.lg,
    borderRadius: radius.sheet,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadow.card,
  },
  dealImage: { width: 160, height: 160, marginBottom: spacing.xs },
  dealName: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 27,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  // Clay is the value colour — savings only, never a button.
  price: { fontFamily: fonts.display, fontSize: 26, color: colors.accent },
  wasPrice: {
    fontFamily: fonts.ui,
    fontSize: 14,
    color: colors.inkFaint,
    textDecorationLine: 'line-through',
  },
  savingPill: {
    backgroundColor: colors.accentTint,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  savingText: { fontFamily: fonts.uiMedium, fontSize: 12, color: colors.accent },
  perUnit: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkSecondary },
  category: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary },
  freshness: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkFaint },
  listHeading: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  eyebrow: { fontFamily: fonts.uiMedium, fontSize: 12, color: colors.brand, letterSpacing: 0.4 },
  count: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: 2 },
  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyText: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkSecondary, textAlign: 'center' },
});
