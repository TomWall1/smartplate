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
import {
  useRecipe, useToggleFavorite, useFavoriteIds, useFavoriteSnapshot, usePantry,
} from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { usePremium } from '../../context/PremiumContext';
import { addItemsToList, getOrCreateDefaultList } from '../../api/premium';
import { track } from '../../lib/analytics';
import { decodeEntities } from '../../lib/displayText';
import { isPantryStaple, pantryCovers } from '../../lib/pantryMatch';
import { useStore } from '../../context/StoreContext';
import LoadingState from '../../components/LoadingState';
import ErrorState from '../../components/ErrorState';
import CostPerServeCard from '../../components/CostPerServeCard';
import { fonts } from '../../theme';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = 260;

/** "12 Aug" — the day this copy was saved, for the archived banner. */
function savedOn(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

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
  const {
    data: liveRecipe, isLoading: liveLoading, isError: liveError, refetch,
  } = useRecipe(String(id), store, state);

  // A recipe is only served while it is in the current week's menu, so a
  // favourite saved a few weeks ago 404s here. Fall back to the copy stored
  // when it was saved — keeping a recipe is the whole reason for an account,
  // and it used to end at an error screen.
  const { data: saved, isLoading: savedLoading } = useFavoriteSnapshot(
    String(id),
    !!user && liveError,
  );
  const recipe = liveRecipe ?? saved ?? null;
  // Showing the snapshot means showing figures from the week it was saved.
  const isArchived = !liveRecipe && !!saved;
  const savedDate = isArchived ? savedOn(saved?.savedAt) : null;
  const isLoading = liveLoading || (liveError && savedLoading);
  const isError = liveError && !saved;

  const toggleFav = useToggleFavorite();
  // Whether this recipe is saved comes from the server, not from local state.
  // The screen used to keep its own boolean that started false on every open
  // and flipped on tap regardless of what the server did, so an already-saved
  // recipe always showed an empty heart and tapping it removed the favourite.
  const { data: favoriteIds = [] } = useFavoriteIds(!!user);
  const favorited = favoriteIds.includes(String(id));
  const [dealsOpen, setDealsOpen] = useState(false);
  const [addingToList, setAddingToList] = useState(false);
  // Which ingredients go on the list. Starts empty: every item on someone's
  // shopping list should be there because they chose it. The old single
  // "Add to list" button copied all fifteen names in one tap, which is how a
  // list reaches ninety items nobody picked.
  const [selected, setSelected] = useState<string[]>([]);

  // The saved pantry marks rows as already-had. Premium-gated server-side, so
  // free accounts simply get no pantry rows — the staples list still applies,
  // since it is a fixed list rather than anything about this account.
  const { data: pantry } = usePantry(isPremium && !!user);
  const pantryItems = pantry?.ingredients ?? [];
  const hasStaples = pantry?.has_pantry_staples !== false;

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
      { id: String(id), recipe: recipe ?? undefined, isFavorite: favorited },
      { onError: () => Alert.alert('Error', 'Could not update favourite. Please try again.') }
    );
  }

  const toggleIngredient = useCallback((name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }, []);

  /**
   * Put the TICKED ingredients on the shopping list. Anything already there is
   * skipped, so tapping twice does not double the list.
   */
  const handleAddToList = useCallback(async () => {
    if (!recipe) return;
    const names = selected;
    if (names.length === 0) return;

    setAddingToList(true);
    try {
      const list = await getOrCreateDefaultList();
      const { added } = await addItemsToList(list, names, {
        id: String(id),
        title: recipe.title,
      });
      track('shopping_list_added', {
        recipe_id: String(id),
        items: added,
        selected: names.length,
      });
      // The ticks have done their job; leaving them set invites a second tap
      // that adds nothing and reads as a failure.
      if (added > 0) setSelected([]);
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
  }, [recipe, id, selected]);

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
  const ingredients = (recipe.allIngredients ?? recipe.ingredients ?? [])
    .filter((i): i is string => typeof i === 'string' && i.trim().length > 0);
  const tags = recipe.tags ?? [];
  const prep = recipe.prepTime ?? recipe.cookTime;
  const totalSavings = recipe.estimatedSaving ?? matchedDeals.reduce((s, d) => s + (d.saving ?? 0), 0);

  // One pass over the ingredient list settles every row: what it costs this
  // week, and whether the account already says you have it. A row can be both
  // (on special AND in your pantry) — worth knowing before you skip it.
  const rows = ingredients.map((name) => ({
    name,
    deal: findDealForIngredient(matchedDeals, name),
    inPantry: pantryItems.length > 0 && pantryCovers(pantryItems, name),
    staple: hasStaples && isPantryStaple(name),
  }));
  const pantryCount = rows.filter((r) => r.inPantry).length;
  const allSelected = ingredients.length > 0 && selected.length === ingredients.length;

  return (
    <View style={styles.flex}>
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

        {isArchived && (
          <View style={styles.archivedCard}>
            <Ionicons name="bookmark" size={16} color="#6B5F52" />
            <Text style={styles.archivedText}>
              {savedDate
                ? `Saved ${savedDate}. Not in this week's specials, so there are no prices on it — everything else still works.`
                : "Not in this week's specials, so there are no prices on it — everything else still works."}
            </Text>
          </View>
        )}

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

        {/* A saved pantry finally does something outside premium matching:
            it marks the rows you can skip. */}
        {pantryCount > 0 && (
          <View style={styles.pantryNote}>
            <Ionicons name="checkmark" size={15} color="#36453B" />
            <Text style={styles.pantryNoteText}>
              {pantryCount} of these are in your pantry. Tick one anyway if you have run out.
            </Text>
          </View>
        )}

        <View style={styles.ingredientsHeader}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          {ingredients.length > 0 && (
            <TouchableOpacity
              onPress={() => setSelected(allSelected ? [] : ingredients)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.selectAllText}>
                {allSelected ? 'Clear all' : 'Select all'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.ingredientsList}>
          {rows.map((row, idx) => {
            const isOn = selected.includes(row.name);
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.ingredientItem,
                  row.deal && styles.ingredientOnSpecial,
                  row.inPantry && styles.ingredientInPantry,
                  !row.deal && !row.inPantry && row.staple && styles.ingredientStaple,
                ]}
                activeOpacity={0.75}
                onPress={() => toggleIngredient(row.name)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isOn }}
                accessibilityLabel={row.name}
              >
                <View style={[styles.checkbox, isOn && styles.checkboxOn]}>
                  {isOn && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                </View>

                <View style={styles.ingredientText}>
                  <Text style={[styles.ingredientName, row.staple && !row.deal && styles.ingredientNameMuted]}>
                    {row.name}
                  </Text>

                  {/* The deal reads as a sentence under the thing it prices,
                      rather than a bare figure in a column of its own. */}
                  {row.deal && (
                    <Text style={styles.ingredientSub} onPress={() => openDeal(row.deal?.dealName)}>
                      {row.deal.price != null ? `$${row.deal.price.toFixed(2)} ` : ''}
                      {decodeEntities(row.deal.dealName)}
                      {(row.deal.saving ?? 0) > 0 && (
                        <Text style={styles.ingredientSave}>{`  save $${(row.deal.saving as number).toFixed(2)}`}</Text>
                      )}
                    </Text>
                  )}

                  {row.inPantry && (
                    <View style={styles.ingredientSubRow}>
                      <Ionicons name="checkmark" size={12} color="#36453B" />
                      <Text style={styles.ingredientPantry}>In your pantry</Text>
                    </View>
                  )}

                  {!row.inPantry && row.staple && !row.deal && (
                    <Text style={styles.ingredientStapleText}>Pantry staple</Text>
                  )}
                </View>
              </TouchableOpacity>
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

    {/* The action sits at the bottom of the screen rather than beside the
        Ingredients heading: what it does depends on ticks made further down a
        fifteen-row list, so it has to stay in view while you make them.
        Shown for an archived recipe too — deciding to cook something you saved
        last month is exactly when you need its ingredients on a list. */}
    {ingredients.length > 0 && (
      <View style={styles.actionBar}>
        <Text style={styles.actionCount}>
          {selected.length === 0
            ? 'Nothing selected yet'
            : `${selected.length} of ${ingredients.length} selected`}
        </Text>
        <TouchableOpacity
          style={[styles.actionButton, (selected.length === 0 || addingToList) && styles.actionButtonOff]}
          activeOpacity={0.85}
          disabled={selected.length === 0 || addingToList}
          onPress={() => {
            if (!user) { navigation.navigate('Login' as never); return; }
            if (!isPremium) { navigation.navigate('Paywall' as never); return; }
            handleAddToList();
          }}
        >
          {!isPremium && <Ionicons name="lock-closed" size={13} color="#F4EEE2" />}
          <Text style={styles.actionButtonText}>
            {addingToList ? 'Adding…' : selected.length === 0 ? 'Add to list' : `Add ${selected.length}`}
          </Text>
        </TouchableOpacity>
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#F4EEE2' },
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
  archivedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#E7DECB',
    borderRadius: 12,
    padding: 12,
  },
  archivedText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: '#6B5F52' },
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
  selectAllText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: '#36453B',
    textDecorationLine: 'underline',
  },

  // Banner above the list when the saved pantry covers some of it.
  pantryNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EDF1E9',
    borderWidth: 1,
    borderColor: '#C3D0BA',
    borderRadius: 12,
    padding: 11,
  },
  pantryNoteText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: '#36453B' },

  ingredientsList: { gap: 6 },
  // Each row is one tap target: a box, the name, and whatever is known about
  // it underneath. Four states, told apart by ground and border rather than by
  // an extra badge — the row itself is the badge.
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    backgroundColor: '#FCFAF4',
    borderWidth: 1,
    borderColor: '#E2D8C6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ingredientOnSpecial: { backgroundColor: '#FDF7F2', borderColor: '#E6C9B3' },
  ingredientInPantry:  { backgroundColor: '#EDF1E9', borderColor: '#C3D0BA' },
  ingredientStaple:    { backgroundColor: 'transparent', borderStyle: 'dashed' },

  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#9A8E7E',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxOn: { backgroundColor: '#36453B', borderColor: '#36453B' },

  ingredientText: { flex: 1, minWidth: 0, gap: 2 },
  ingredientName: { fontSize: 15, fontFamily: 'Inter_400Regular', color: '#2A241F', lineHeight: 20, textTransform: 'capitalize' },
  ingredientNameMuted: { color: '#6B5F52' },
  ingredientSub: { fontSize: 12, lineHeight: 17, color: '#6B5F52' },
  ingredientSave: { color: '#BE6A43', fontFamily: 'Inter_700Bold' },
  ingredientSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ingredientPantry: { fontSize: 12, lineHeight: 17, color: '#36453B', fontFamily: 'Inter_500Medium' },
  ingredientStapleText: { fontSize: 12, lineHeight: 17, color: '#9A8E7E' },

  // Sticky bar — stays in view while you work down the list.
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#FCFAF4',
    borderTopWidth: 1,
    borderTopColor: '#E2D8C6',
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 16,
  },
  actionCount: { flex: 1, fontSize: 13, color: '#6B5F52' },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#36453B',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionButtonOff: { opacity: 0.4 },
  actionButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#F4EEE2' },
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
