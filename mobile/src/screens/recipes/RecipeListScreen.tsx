import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipesStackParamList } from '../../navigation';
import { useRecipes, usePantry } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { usePremium } from '../../context/PremiumContext';
import { RecipeSortKey } from '../../types';
import RecipeCard from '../../components/RecipeCard';
import RecipeFilterBar from '../../components/RecipeFilterBar';
import ErrorState from '../../components/ErrorState';
import RecipeListSkeleton from '../../components/RecipeListSkeleton';
import {
  applyFacets,
  facetCounts,
  sortRecipes,
  pantryTermsFrom,
  SORT_OPTIONS,
} from '../../lib/recipeFilters';
import { track, secondsSinceOpen } from '../../lib/analytics';
import { storeColors } from '../../theme';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeList'>;

// How many recipes someone without an account sees. Enough to judge whether
// the app is worth having; the rest is what the free account is for.
const GUEST_PREVIEW = 10;

// The chosen order survives tab switches and restarts. Someone who has told us
// they shop on time, or on price, should not have to say it again every visit.
const SORT_KEY = 'deals-to-dish-recipe-sort';

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
      <Text style={styles.ctaTitle}>Want to see more?</Text>
      <Text style={styles.ctaBody}>
        {heldBack > 0
          ? `That's ${shown} of ${total} recipes from this week's ${storeLabel(store)} specials. Create a free account to open another ${heldBack} recipes this week.`
          : `A free account keeps the ones you like, and has next week's recipes ready when the ${storeLabel(store)} specials change.`}
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
  // isPremium is part of the cache key: the server returns 150 recipes to a
  // subscriber and 50 to everyone else, so the two must not share an entry.
  const { data: recipes = [], isLoading, isError, isFetching, refetch } = useRecipes(
    effectiveState,
    selectedStore,
    isPremium,
  );
  const [sort, setSort] = useState<RecipeSortKey>('recommended');
  const [proteins, setProteins] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);

  // No account yet — this is the first thing they ever see. No filters, no
  // controls, just the food, then one ask at the end. The default order does
  // the work here instead: it is what makes the first ten cards a week of
  // meals rather than ten variations on whatever is deepest-discounted.
  const isGuest = !user;
  const storeCfg = storeColors[selectedStore ?? 'woolworths'] ?? storeColors.woolworths;

  // Sorting by pantry needs a saved pantry; without one the option is not
  // offered, and a stored preference for it quietly falls back.
  const { data: pantry } = usePantry(!isGuest);
  const pantryTerms = useMemo(() => pantryTermsFrom(pantry?.ingredients), [pantry]);
  const pantryAvailable = pantryTerms.length > 0;
  const effectiveSort: RecipeSortKey =
    sort === 'pantry' && !pantryAvailable ? 'recommended' : sort;

  useEffect(() => {
    AsyncStorage.getItem(SORT_KEY)
      .then((saved) => {
        // Validate: a key left behind by an older build must not put the list
        // into an order that no longer exists.
        if (saved && SORT_OPTIONS.some((o) => o.key === saved)) setSort(saved as RecipeSortKey);
      })
      .catch(() => {});
  }, []);

  const changeSort = (next: RecipeSortKey) => {
    setSort(next);
    AsyncStorage.setItem(SORT_KEY, next).catch(() => {});
    track('recipe_sort_changed', { sort: next });
  };

  const facets = { proteins, features };

  // Filter first, then order — so "Recommended" re-spreads the survivors
  // across hero lanes instead of leaving a filtered list clumped.
  const filtered = useMemo(
    () => sortRecipes(applyFacets(recipes, facets), effectiveSort, { pantryTerms }),
    [recipes, proteins, features, effectiveSort, pantryTerms]
  );
  const counts = useMemo(() => facetCounts(recipes, facets), [recipes, proteins, features]);

  const visible = isGuest ? filtered.slice(0, GUEST_PREVIEW) : filtered;
  const hasFilters = proteins.length > 0 || features.length > 0;
  const clearFilters = () => {
    setProteins([]);
    setFeatures([]);
  };

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

      {/* One control row — order, protein, features. Hidden until there's an
          account, so the first screen is nothing but recipes. */}
      {!isGuest && (
        <RecipeFilterBar
          sort={effectiveSort}
          onSortChange={changeSort}
          pantryAvailable={pantryAvailable}
          proteins={proteins}
          onProteinsChange={(ids) => {
            setProteins(ids);
            track('recipe_filter_changed', { facet: 'protein', selected: ids.length });
          }}
          proteinCounts={counts.proteins}
          features={features}
          onFeaturesChange={(ids) => {
            setFeatures(ids);
            track('recipe_filter_changed', { facet: 'feature', selected: ids.length });
          }}
          featureCounts={counts.features}
        />
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
                : 'Nothing this week matches all of those. Try dropping one.'}
            </Text>
            {/* Never leave someone in an empty list with no way out. */}
            {hasFilters && recipes.length > 0 ? (
              <TouchableOpacity style={styles.emptyBtn} onPress={clearFilters} activeOpacity={0.9}>
                <Text style={styles.emptyBtnText}>Clear filters</Text>
              </TouchableOpacity>
            ) : null}
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
  emptyBtn: {
    marginTop: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#36453B',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  emptyBtnText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: '#36453B' },
});
