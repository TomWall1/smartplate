import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PremiumStackParamList } from '../../navigation';
import { PantryMatchResult, PantryIngredient } from '../../types';

type Props = NativeStackScreenProps<PremiumStackParamList, 'PantryResults'>;

/** The matcher returns structured lines; `name` is the bare ingredient. */
function ingredientLabel(ing: PantryIngredient): string {
  return (ing.name || ing.raw || '').trim();
}

function CoverageBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = clamped >= 75 ? '#36453B' : clamped >= 50 ? '#BE6A43' : '#D4667A';
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${clamped}%` as any, backgroundColor: color }]} />
    </View>
  );
}

/**
 * Results are ranked by what you still have to SPEND, so the card leads with
 * that, not with a coverage percentage.
 *
 * The price line is deliberately fussy about what it claims:
 *   every item priced  → an exact figure
 *   some priced        → "from $X", never a total
 *   none priced        → no figure at all, just the count
 * A "$0.00" on a basket we could not price is the exact lie the whole ranking
 * exists to avoid, and it is the one a reader is least likely to question.
 */
function priceLine(result: PantryMatchResult): string {
  const { missingCount, totalCostToComplete, costIsComplete } = result;

  if (missingCount === 0) return 'You have everything';
  if (totalCostToComplete == null) {
    return `${missingCount} to buy — not in this week's catalogue`;
  }
  const money = `$${totalCostToComplete.toFixed(2)}`;
  return costIsComplete ? `${money} to finish` : `from ${money} to finish`;
}

function ResultCard({ result, onPress }: { result: PantryMatchResult; onPress: () => void }) {
  const { recipe, matchedIngredients, missingIngredients, totalSavings } = result;

  const matchedCount = matchedIngredients?.length ?? 0;
  const totalCount   = matchedCount + (missingIngredients?.length ?? 0);
  const coveragePercent = Math.round((result.coverage ?? 0) * 100);

  const perServe = result.costToCompletePerServe;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      <Image source={{ uri: recipe.image }} style={styles.cardImage} resizeMode="cover" />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{recipe.title}</Text>

        {/* The headline: what finishing this dish costs. */}
        <View style={styles.priceRow}>
          <Text style={styles.priceText}>{priceLine(result)}</Text>
          {perServe != null && (
            <Text style={styles.perServeText}>${perServe.toFixed(2)} a serve</Text>
          )}
        </View>

        <View style={styles.coverageRow}>
          <CoverageBar percent={coveragePercent} />
          <Text style={styles.coverageText}>
            You have {matchedCount} of {totalCount} ingredients
          </Text>
        </View>

        {(recipe.prepTime ?? 0) > 0 && (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color="#6B5F52" />
            <Text style={styles.metaText}>{recipe.prepTime} min</Text>
          </View>
        )}

        {missingIngredients && missingIngredients.length > 0 && (
          <View style={styles.dealsSection}>
            <Text style={styles.dealsSectionLabel}>Still need</Text>
            {missingIngredients.slice(0, 3).map((ing, idx) => (
              <View key={idx} style={styles.missingRow}>
                <Text style={styles.missingName} numberOfLines={1}>
                  {ingredientLabel(ing)}
                </Text>
                {ing.deal?.price != null ? (
                  <Text style={styles.missingPrice}>${Number(ing.deal.price).toFixed(2)}</Text>
                ) : (
                  <Text style={styles.missingUnpriced}>—</Text>
                )}
              </View>
            ))}
            {missingIngredients.length > 3 && (
              <Text style={styles.moreDeals}>+{missingIngredients.length - 3} more</Text>
            )}
            {totalSavings > 0 && (
              <Text style={styles.savingLine}>
                Some are on special — saves ${totalSavings.toFixed(2)}.
              </Text>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function PantryResultsScreen({ route, navigation }: Props) {
  const { results } = route.params;

  if (!results || results.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="search-outline" size={48} color="#DCE4D6" />
        <Text style={styles.emptyTitle}>No matches found</Text>
        <Text style={styles.emptyText}>
          Try adding more pantry items or enabling pantry staples.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.resultsSummary}>
        <Text style={styles.resultsSummaryText}>
          {results.length} recipe{results.length !== 1 ? 's' : ''}, cheapest to finish first
        </Text>
      </View>
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.recipe.id)}
        renderItem={({ item }) => (
          <ResultCard
            result={item}
            onPress={() =>
              navigation.navigate('PantryRecipeDetail', {
                id: String(item.recipe.id),
                title: item.recipe.title,
              })
            }
          />
        )}
        contentContainerStyle={styles.list}
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
  resultsSummary: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2D8C6',
  },
  resultsSummaryText: {
    fontSize: 14,
    color: '#6B5F52',
    fontFamily: 'Inter_500Medium',
  },
  list: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E2D8C6',
    shadowColor: 'rgba(92, 74, 53, 0.08)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 4,
  },
  cardImage: {
    width: '100%',
    height: 140,
  },
  cardBody: {
    padding: 14,
    gap: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#2A241F',
    lineHeight: 22,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  priceText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#BE6A43',
    flexShrink: 1,
  },
  perServeText: {
    fontSize: 12,
    color: '#6B5F52',
  },
  missingUnpriced: {
    fontSize: 13,
    color: '#9A8E7E',
  },
  coverageRow: {
    gap: 6,
  },
  barTrack: {
    height: 6,
    backgroundColor: '#E2D8C6',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  coverageText: {
    fontSize: 12,
    color: '#6B5F52',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6B5F52',
  },
  dealsSection: {
    gap: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f0e8e0',
  },
  dealsSectionLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: '#2A241F',
  },
  moreDeals: {
    fontSize: 12,
    color: '#36453B',
    fontFamily: 'Inter_600SemiBold',
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  missingName: {
    flex: 1,
    fontSize: 13,
    color: '#6B5F52',
  },
  missingPrice: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#BE6A43',
  },
  savingLine: {
    fontSize: 12,
    color: '#BE6A43',
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  empty: {
    flex: 1,
    backgroundColor: '#F4EEE2',
    justifyContent: 'center',
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
  backButton: {
    marginTop: 8,
    backgroundColor: '#36453B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
});
