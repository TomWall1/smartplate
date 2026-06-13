import React, { useState, useLayoutEffect } from 'react';
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
import { useRecipe, useToggleFavorite } from '../../api/hooks';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import DealBadge from '../../components/DealBadge';
import LoadingState from '../../components/LoadingState';
import ErrorState from '../../components/ErrorState';
import { fonts } from '../../theme';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = 260;

export default function RecipeDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { user } = useAuth();
  const { selectedStore, selectedState } = useStore();
  const store = selectedStore;
  const state = user?.state || selectedState;
  const { data: recipe, isLoading, isError, refetch } = useRecipe(String(id), store, state);
  const toggleFav = useToggleFavorite();
  const [favorited, setFavorited] = useState(false);
  const [dealsOpen, setDealsOpen] = useState(false);

  function handleToggleFavorite() {
    toggleFav.mutate(String(id), {
      onSuccess: () => setFavorited((v) => !v),
      onError: () => Alert.alert('Error', 'Could not update favourite. Please try again.'),
    });
  }

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
  }, [navigation, favorited, toggleFav.isPending]);

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
        <Text style={styles.title}>{recipe.title}</Text>

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
                  <View key={i} style={styles.dealListRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dealListIngredient} numberOfLines={1}>{d.ingredient}</Text>
                      <Text style={styles.dealListName} numberOfLines={1}>{d.dealName}</Text>
                    </View>
                    {d.price != null && <Text style={styles.dealListPrice}>${d.price.toFixed(2)}</Text>}
                    {(d.saving ?? 0) > 0 && <Text style={styles.dealListSave}>save ${(d.saving as number).toFixed(2)}</Text>}
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Ingredients</Text>
        <View style={styles.ingredientsList}>
          {ingredients.map((ing, idx) => {
            const name = typeof ing === 'string' ? ing : '';
            const deal = matchedDeals.find(
              (d) => (d.ingredient ?? '').toLowerCase() === name.toLowerCase()
            );
            return (
              <View key={idx} style={styles.ingredientItem}>
                <View style={styles.ingredientRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.ingredientName}>{name}</Text>
                </View>
                {deal && <DealBadge deal={deal} />}
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
          <Text style={styles.attribution}>Recipe from {recipe.source}</Text>
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
  ingredientsList: { gap: 12 },
  ingredientItem: { gap: 4 },
  ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#36453B', marginTop: 6, flexShrink: 0 },
  ingredientName: { fontSize: 15, fontFamily: 'Inter_400Regular', color: '#2A241F', lineHeight: 22, flex: 1, textTransform: 'capitalize' },
  viewFullButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#36453B', paddingVertical: 14, borderRadius: 12, marginTop: 4 },
  viewFullText: { color: '#F4EEE2', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  attribution: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#6B5F52', textAlign: 'center', textTransform: 'capitalize' },
});
