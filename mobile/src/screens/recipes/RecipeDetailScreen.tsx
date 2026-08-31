import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipesStackParamList } from '../../navigation';
import { MatchedDeal } from '../../types';
import { useRecipe, useToggleFavorite, useFavoriteIds } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { usePremium } from '../../context/PremiumContext';
import { addItemsToList, getOrCreateDefaultList } from '../../api/premium';
import { track } from '../../lib/analytics';
import { decodeEntities } from '../../lib/displayText';
import { useStore } from '../../context/StoreContext';
import DealBadge from '../../components/DealBadge';
import LoadingState from '../../components/LoadingState';
import ErrorState from '../../components/ErrorState';
import CostPerServeCard from '../../components/CostPerServeCard';
import { fonts } from '../../theme';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = 260;

/** Words worth matching on — drops units, quantities and filler. */
const STOP = new Set([
  'and', 'or', 'the', 'of', 'to', 'into', 'with', 'for', 'plus', 'extra',
  'finely', 'coarsely', 'thinly', 'roughly', 'chopped', 'sliced', 'diced',
  'crushed', 'grated', 'trimmed', 'picked', 'cut', 'pieces', 'piece',
  'fresh', 'free', 'range', 'large', 'small', 'medium', 'cup', 'cups',
  'tbsp', 'tsp', 'tablespoon', 'teaspoon', 'gram', 'grams', 'kg', 'ml',
]);

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * Find the deal the matcher attached to this recipe line, if any. Tries exact,
 * then containment either way, then a shared-word overlap — deliberately in
 * that order so a precise match always wins over a loose one.
 */
function findDealForIngredient(deals: MatchedDeal[], line: string): MatchedDeal | undefined {
  const lower = line.toLowerCase().trim();
  if (!lower) return undefined;

  const exact = deals.find((d) => (d.ingredient ?? '').toLowerCase().trim() === lower);
  if (exact) return exact;

  const contained = deals.find((d) => {
    const ing = (d.ingredient ?? '').toLowerCase().trim();
    return !!ing && (lower.includes(ing) || ing.includes(lower));
  });
  if (contained) return contained;

  const lineWords = words(line);
  if (!lineWords.length) return undefined;

  let best: { deal: MatchedDeal; score: number } | undefined;
  for (const d of deals) {
    const ingWords = words(d.ingredient ?? '');
    if (!ingWords.length) continue;
    const shared = ingWords.filter((w) => lineWords.includes(w)).length;
    // Every word of the matcher's ingredient must appear in the recipe line.
    // Looser than that starts badging "olive oil" onto unrelated lines.
    if (shared === ingWords.length && (!best || shared > best.score)) {
      best = { deal: d, score: shared };
    }
  }
  return best?.deal;
}

export default function RecipeDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { user } = useAuth();
  const { selectedStore, selectedState } = useStore();
  const store = selectedStore;
  const state = user?.state || selectedState;
  const { isPremium } = usePremium();
  const { data: recipe, isLoading, isError, refetch } = useRecipe(String(id), store, state);
  const toggleFav = useToggleFavorite();
  // Whether this recipe is saved comes from the server, not from local state.
  // The screen used to keep its own boolean that started false on every open
  // and flipped on tap regardless of what the server did, so an already-saved
  // recipe always showed an empty heart and tapping it removed the favourite.
  const { data: favoriteIds = [] } = useFavoriteIds(!!user);
  const favorited = favoriteIds.includes(String(id));
  const [dealsOpen, setDealsOpen] = useState(false);
  const [addingToList, setAddingToList] = useState(false);

  // Deals here open the same screen as tapping a deal in the Deals tab: the
  // nested navigate switches tab and pushes DealRecipes onto that stack, which
  // is the only route to it from elsewhere in the app.
  function openDeal(dealName?: string) {
    if (!dealName) return;
    (navigation as any).navigate('DealsTab', {
      screen: 'DealRecipes',
      params: { dealName },
      // Without this the deals stack opens WITH DealRecipes as its initial
      // route, so there is nothing beneath it and no back button. `initial:
      // false` puts the Deals list underneath, which is what makes back work.
      initial: false,
    });
  }

  function handleToggleFavorite() {
    // Reaching for the heart is the moment someone wants to keep something —
    // a far better time to ask for an account than a banner they scrolled past.
    if (!user) {
      track('signup_prompt_shown', { source: 'favourite', recipe_id: String(id) });
      Alert.alert(
        'Save this recipe',
        'A free account keeps your favourites and has next week’s recipes ready when the catalogue changes.',
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Create account',
            onPress: () => {
              track('signup_prompt_tapped', { source: 'favourite', recipe_id: String(id) });
              (navigation as any).navigate('SignUp');
            },
          },
        ],
      );
      return;
    }
    toggleFav.mutate(
      { id: String(id), recipe, isFavorite: favorited },
      { onError: () => Alert.alert('Error', 'Could not update favourite. Please try again.') }
    );
  }

  /**
   * Put this recipe's ingredients on the shopping list. Everything already
   * there is skipped, so tapping twice does not double the list.
   */
  const handleAddToList = useCallback(async () => {
    if (!recipe) return;
    const names = (recipe.allIngredients ?? recipe.ingredients ?? [])
      .filter((i): i is string => typeof i === 'string');
    if (names.length === 0) {
      Alert.alert('Nothing to add', 'This recipe has no ingredient list to copy.');
      return;
    }

    setAddingToList(true);
    try {
      const list = await getOrCreateDefaultList();
      const { added } = await addItemsToList(list, names, {
        id: String(id),
        title: recipe.title,
      });
      track('shopping_list_added', { recipe_id: String(id), items: added });
      Alert.alert(
        added > 0 ? 'Added to your list' : 'Already on your list',
        added > 0
          ? `${added} item${added === 1 ? '' : 's'} added.`
          : 'Everything from this recipe is already there.'
      );
    } catch {
      Alert.alert('Could not add', 'Please try again.');
    } finally {
      setAddingToList(false);
    }
  }, [recipe, id]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleToggleFavorite}
          style={styles.favButton}
          disabled={toggleFav.isPending}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={favorited ? 'heart' : 'heart-outline'}
            size={24}
            color={favorited ? '#BE6A43' : '#2A241F'}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, favorited, toggleFav.isPending, recipe]);

  if (isLoading) return <LoadingState message="Loading recipe…" />;
  if (isError || !recipe) {
    return <ErrorState message="Could not load this recipe." onRetry={() => refetch()} />;
  }

  const matchedDeals = recipe.matchedDeals ?? [];
  const ingredients = recipe.allIngredients ?? recipe.ingredients ?? [];
  const tags = recipe.tags ?? [];
  const prep = recipe.prepTime ?? recipe.cookTime;
  const totalSavings = recipe.estimatedSaving ?? matchedDeals.reduce((s, d) => s + (d.saving ?? 0), 0);

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      <Image source={recipe.image} style={styles.heroImage} contentFit="cover" transition={200} />

      <View style={styles.body}>
        <Text style={styles.title}>{decodeEntities(recipe.title)}</Text>

        {/* Attribution sits with the title, not only in the footer link: the
            source publisher owns this recipe and should be named where the
            recipe is read, not somewhere the reader may never scroll to. */}
        {recipe.source ? (
          <TouchableOpacity
            style={styles.sourceChip}
            activeOpacity={recipe.sourceUrl && recipe.sourceUrl !== '#' ? 0.7 : 1}
            onPress={() => {
              if (recipe.sourceUrl && recipe.sourceUrl !== '#') {
                WebBrowser.openBrowserAsync(recipe.sourceUrl);
              }
            }}
          >
            <Ionicons name="link-outline" size={12} color="#6B5F52" />
            <Text style={styles.sourceChipText}>
              Recipe by {decodeEntities(recipe.source)}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.chips}>
          {prep ? (
            <View style={styles.chip}>
              <Ionicons name="time-outline" size={14} color="#36453B" />
              <Text style={styles.chipText}>{prep} min</Text>
            </View>
          ) : null}
          {recipe.servings ? (
            <View style={styles.chip}>
              <Ionicons name="people-outline" size={14} color="#36453B" />
              <Text style={styles.chipText}>{recipe.servings} servings</Text>
            </View>
          ) : null}
          {recipe.totalEstimatedCost ? (
            <View style={styles.chip}>
              <Ionicons name="wallet-outline" size={14} color="#36453B" />
              <Text style={styles.chipText}>~${recipe.totalEstimatedCost.toFixed(0)}</Text>
            </View>
          ) : null}
        </View>

        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.dietTag}>
                <Text style={styles.dietTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        <CostPerServeCard recipe={recipe} />

        {matchedDeals.length > 0 && (
          <View style={styles.savingsCard}>
            <TouchableOpacity style={styles.savingsRow} activeOpacity={0.8} onPress={() => setDealsOpen((v) => !v)}>
              <Ionicons name="pricetag" size={18} color="#BE6A43" />
              <Text style={styles.savingsTitle}>
                {matchedDeals.length} deal{matchedDeals.length !== 1 ? 's' : ''} this week
              </Text>
              {totalSavings > 0 && (
                <View style={styles.savingsBadge}>
                  <Text style={styles.savingsBadgeText}>Save ${totalSavings.toFixed(2)}</Text>
                </View>
              )}
              <Ionicons name={dealsOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#BE6A43" />
            </TouchableOpacity>
            {dealsOpen && (
              <View style={styles.dealsList}>
                {matchedDeals.map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.dealListRow}
                    activeOpacity={0.7}
                    onPress={() => openDeal(d.dealName)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dealListIngredient} numberOfLines={1}>{d.ingredient}</Text>
                      <Text style={styles.dealListName} numberOfLines={1}>{decodeEntities(d.dealName)}</Text>
                    </View>
                    {d.price != null && <Text style={styles.dealListPrice}>${d.price.toFixed(2)}</Text>}
                    {(d.saving ?? 0) > 0 && <Text style={styles.dealListSave}>save ${(d.saving as number).toFixed(2)}</Text>}
                    <Ionicons name="chevron-forward" size={14} color="#9A8E7E" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={styles.ingredientsHeader}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          {/* Premium: the free tier gets the gate on the list screen itself,
              so this stays visible and explains what it is for. */}
          <TouchableOpacity
            style={styles.addToListButton}
            activeOpacity={0.8}
            disabled={addingToList}
            onPress={() => {
              if (!user) { navigation.navigate('Login' as never); return; }
              if (!isPremium) { navigation.navigate('Paywall' as never); return; }
              handleAddToList();
            }}
          >
            <Ionicons
              name={isPremium ? 'cart-outline' : 'lock-closed'}
              size={15}
              color="#36453B"
            />
            <Text style={styles.addToListText}>
              {addingToList ? 'Adding…' : 'Add to list'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.ingredientsList}>
          {ingredients.map((ing, idx) => {
            const name = typeof ing === 'string' ? ing : '';
            // The matcher records the bare ingredient ("beef chuck steak")
            // while the recipe line carries the whole instruction ("beef chuck
            // steak, trimmed, cut into 4cm pieces"). Exact equality therefore
            // linked only the lines that happened to be bare — the biryani
            // showed three deals at the top and linked one. Match on
            // containment, then on shared words, so a badge appears wherever
            // the matcher actually found a deal.
            const deal = findDealForIngredient(matchedDeals, name);
            return (
              <View key={idx} style={styles.ingredientItem}>
                <View style={styles.ingredientRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.ingredientName}>{name}</Text>
                </View>
                {deal && (
                  <TouchableOpacity activeOpacity={0.7} onPress={() => openDeal(deal.dealName)}>
                    <DealBadge deal={deal} />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {recipe.sourceUrl && recipe.sourceUrl !== '#' && (
          <TouchableOpacity
            style={styles.viewFullButton}
            activeOpacity={0.85}
            onPress={() => WebBrowser.openBrowserAsync(recipe.sourceUrl as string)}
          >
            <Text style={styles.viewFullText}>View full recipe & method</Text>
            <Ionicons name="open-outline" size={16} color="#F4EEE2" />
          </TouchableOpacity>
        )}
        {recipe.source ? (
          <Text style={styles.attribution}>Recipe from {decodeEntities(recipe.source)}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F4EEE2' },
  heroImage: { width: SCREEN_WIDTH, height: IMAGE_HEIGHT, backgroundColor: '#E7DECB' },
  favButton: { marginRight: 4, padding: 4 },
  body: { padding: 20, gap: 16 },
  title: { fontSize: 26, fontFamily: fonts.display, color: '#2A241F', lineHeight: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#DCE4D6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#36453B' },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dietTag: { backgroundColor: '#F2E2D6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  dietTagText: { fontSize: 12, color: '#BE6A43', fontFamily: 'Inter_600SemiBold' },
  savingsCard: { backgroundColor: '#F2E2D6', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E6C9B3' },
  savingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  savingsTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#2A241F', flex: 1 },
  savingsBadge: { backgroundColor: '#BE6A43', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  savingsBadgeText: { color: '#ffffff', fontSize: 12, fontFamily: 'Inter_700Bold' },
  dealsList: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#E6C9B3', paddingTop: 8, gap: 8 },
  dealListRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dealListIngredient: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#2A241F', textTransform: 'capitalize' },
  dealListName: { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#6B5F52' },
  dealListPrice: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#2A241F' },
  dealListSave: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#BE6A43' },
  sectionTitle: { fontSize: 18, fontFamily: fonts.display, color: '#2A241F', marginTop: 4, marginBottom: -4 },
  ingredientsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  addToListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DCE4D6',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addToListText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#36453B',
  },
  ingredientsList: { gap: 12 },
  ingredientItem: { gap: 4 },
  ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#36453B', marginTop: 6, flexShrink: 0 },
  ingredientName: { fontSize: 15, fontFamily: 'Inter_400Regular', color: '#2A241F', lineHeight: 22, flex: 1, textTransform: 'capitalize' },
  viewFullButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#36453B', paddingVertical: 14, borderRadius: 12, marginTop: 4 },
  viewFullText: { color: '#F4EEE2', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: '#E7DECB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 4,
  },
  sourceChipText: { fontSize: 12, fontFamily: 'Inter_500Medium', color: '#6B5F52' },
  attribution: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6B5F52', textAlign: 'center', textTransform: 'capitalize' },
});
