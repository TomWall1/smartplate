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
import { PantryMatchResult } from '../../types';
import DealBadge from '../../components/DealBadge';

type Props = NativeStackScreenProps<PremiumStackParamList, 'PantryResults'>;

function CoverageBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const color = clamped >= 75 ? '#36453B' : clamped >= 50 ? '#BE6A43' : '#D4667A';
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${clamped}%` as any, backgroundColor: color }]} />
    </View>
  );
}

function ResultCard({ result, onPress }: { result: PantryMatchResult; onPress: () => void }) {
  const { recipe, coveragePercent, matchedCount, totalCount, missingDeals } = result;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      <Image
        source={{ uri: recipe.image }}
        style={styles.cardImage}
        resizeMode="cover"
      />
      <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={2}>{recipe.title}</Text>
          <View style={[
            styles.coverageBadge,
            { backgroundColor: coveragePercent >= 75 ? '#DCE4D6' : coveragePercent >= 50 ? '#FFF3E0' : '#FDECEA' }
          ]}>
            <Text style={[
              styles.coverageBadgeText,
              { color: coveragePercent >= 75 ? '#36453B' : coveragePercent >= 50 ? '#c07820' : '#b03060' }
            ]}>
              {Math.round(coveragePercent)}%
            </Text>
          </View>
        </View>

        <View style={styles.coverageRow}>
          <CoverageBar percent={coveragePercent} />
          <Text style={styles.coverageText}>
            You have {matchedCount}/{totalCount} ingredients
          </Text>
        </View>

        {(recipe.prepTime ?? 0) > 0 && (
          <View style={styles.metaRow}>
            <Ionicons name="time-outline" size={13} color="#6B5F52" />
            <Text style={styles.metaText}>{recipe.prepTime} min</Text>
          </View>
        )}

        {missingDeals && missingDeals.length > 0 && (
          <View style={styles.dealsSection}>
            <Text style={styles.dealsSectionLabel}>
              Deals on missing items:
            </Text>
            {missingDeals.slice(0, 2).map((deal, idx) => (
              <DealBadge key={idx} deal={deal} />
            ))}
            {missingDeals.length > 2 && (
              <Text style={styles.moreDeals}>+{missingDeals.length - 2} more deals</Text>
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
          Found {results.length} recipe{results.length !== 1 ? 's' : ''} matching your pantry
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#2A241F',
    lineHeight: 22,
  },
  coverageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    flexShrink: 0,
  },
  coverageBadgeText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
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
