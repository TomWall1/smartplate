import React, { useState, useEffect } from 'react';
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
import { track, secondsSinceOpen } from '../../lib/analytics';
import { storeColors } from '../../theme';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeList'>;

// How many recipes someone without an account sees. Enough to judge whether
// the app is worth having; the rest is what the free account is for.
const GUEST_PREVIEW = 10;

const storeLabel = (s: string | null) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : 'your store';

/**
 * The sign-up ask at the end of a guest's list. Its own component so mounting
 * it is the "shown" signal — with a ten-card list FlatList renders the footer
 * without waiting for a scroll, so read this as "reached the list", not
 * "definitely saw it".
 */
function GuestCta({
  shown,
  total,
  store,
  onCreate,
  onSignIn,
}: {
  shown: number;
  total: number;
  store: string | null;
  onCreate: () => void;
  onSignIn: () => void;
}) {
  useEffect(() => {
    track('signup_prompt_shown', { source: 'recipe_list', shown, total });
  }, [shown, total]);

  const heldBack = total - shown;
  return (
    <View style={styles.ctaCard}>
      <Text style={styles.ctaEyebrow}>Free account</Text>
      <Text style={styles.ctaTitle}>Keep the ones you like</Text>
      <Text style={styles.ctaBody}>
        {heldBack > 0
          ? `That's ${shown} of ${total} recipes built from this week's ${storeLabel(store)} specials. An account saves your favourites and has next week's ready when the catalogue changes.`
          : `An account saves your favourites and has next week's recipes ready when the ${storeLabel(store)} catalogue changes.`}
      </Text>
      <TouchableOpacity style={styles.ctaButton} onPress={onCreate} activeOpacity={0.9}>
        <Text style={styles.ctaButtonText}>Create a free account</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSignIn}>
        <Text style={styles.ctaSecondary}>I already have one</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function RecipeListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { selectedState, selectedStore } = useStore();
  const { isPremium } = usePremium();
  const effectiveState = user?.state || selectedState;
  // Pass the store as well as the state: recipes are anchored on a specific
  // store's specials, and the whole first run is built around that choice.
  const { data: recipes = [], isLoading, isError, isFetching, refetch } = useRecipes(
    effectiveState,
    selectedStore,
  );
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [activeProtein, setActiveProtein] = useState<string | null>(null);

  // No account yet — this is the first thing they ever see. No filters, no
  // controls, just the food, then one ask at the end.
  const isGuest = !user;
  const storeCfg = storeColors[selectedStore ?? 'woolworths'] ?? storeColors.woolworths;

  // Best first — biggest saving against this week's specials, which is the
  // figure the cards themselves show. Ties keep the backend's own order.
  const ranked = [...recipes].sort(
    (a, b) => (b.estimatedSaving ?? 0) - (a.estimatedSaving ?? 0)
  );

  const filtered = applyFilter(ranked, activeFilter).filter((r) =>
    hasProteinDeal(r, activeProtein)
  );
  const visible = isGuest ? filtered.slice(0, GUEST_PREVIEW) : filtered;

  // Time-to-value: the whole point of the first-run flow is shrinking this.
  // Fires once, when recipes first appear.
  const [reported, setReported] = useState(false);
  useEffect(() => {
    if (reported || isLoading || recipes.length === 0) return;
    setReported(true);
    track('recipes_viewed', {
      count: visible.length,
      total: recipes.length,
      seconds_since_open: secondsSinceOpen(),
    });
  }, [reported, isLoading, recipes.length, visible.length]);

  if (isLoading) {
    return <RecipeListSkeleton />;
  }

  if (isError) {
    return <ErrorState message="Could not load recipes. Check your connection." onRetry={() => refetch()} />;
  }

  return (
    <View style={styles.container}>
      {/* Which store's specials these are built from. The store is chosen once
          at onboarding, so without this the list has no visible anchor. */}
      <View style={[styles.storeBar, { backgroundColor: storeCfg.color }]}>
        <Text style={styles.storeBarText}>{storeCfg.name} · this week</Text>
        <TouchableOpacity
          style={styles.storeBarBtn}
          onPress={() => (navigation as any).navigate('StoreSelection')}
          activeOpacity={0.8}
        >
          <Text style={styles.storeBarLink}>Change</Text>
        </TouchableOpacity>
      </View>

      {/* Tag filter chips — hidden until there's an account, so the first
          screen is nothing but recipes. */}
      {!isGuest && (
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
      )}

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
        data={visible}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <RecipeCard
            recipe={item}
            onPress={() => {
              track('recipe_opened', {
                recipe_id: String(item.id),
                position: visible.findIndex((r) => String(r.id) === String(item.id)) + 1,
              });
              navigation.navigate('RecipeDetail', { id: String(item.id), title: item.title });
            }}
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
        ListFooterComponent={
          isGuest && visible.length > 0 ? (
            <GuestCta
              shown={visible.length}
              total={recipes.length}
              store={selectedStore}
              // navigate() bubbles to the root stack, which owns these modals.
              onCreate={() => {
                track('signup_prompt_tapped', { source: 'recipe_list' });
                (navigation as any).navigate('SignUp');
              }}
              onSignIn={() => {
                track('signin_link_tapped', { source: 'recipe_list' });
                (navigation as any).navigate('Login');
              }}
            />
          ) : null
        }
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
  // Thin band in the store's own colour, sitting under the light "Recipes"
  // header rather than replacing it.
  storeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  storeBarText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#FFFFFF' },
  storeBarBtn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  storeBarLink: { fontSize: 12, fontFamily: 'Inter_500Medium', color: '#FFFFFF' },
  ctaCard: {
    backgroundColor: '#FCFAF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2D8C6',
    padding: 20,
    marginTop: 8,
    marginBottom: 24,
    gap: 8,
  },
  ctaEyebrow: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#36453B',
    letterSpacing: 0.4,
  },
  ctaTitle: { fontSize: 20, fontFamily: 'Fraunces_500Medium', color: '#2A241F' },
  ctaBody: { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#6B5F52', lineHeight: 21 },
  ctaButton: {
    marginTop: 8,
    backgroundColor: '#36453B',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaButtonText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#F4EEE2' },
  ctaSecondary: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#36453B',
    textAlign: 'center',
    paddingVertical: 8,
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
