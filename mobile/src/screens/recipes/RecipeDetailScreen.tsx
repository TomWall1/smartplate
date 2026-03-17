import React, { useState, useEffect, useLayoutEffect } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipesStackParamList } from '../../navigation';
import { getRecipeById, toggleFavorite } from '../../api/recipes';
import { Recipe } from '../../types';
import DealBadge from '../../components/DealBadge';
import LoadingState from '../../components/LoadingState';
import ErrorState from '../../components/ErrorState';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = 260;
const BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export default function RecipeDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [favLoading, setFavLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await getRecipeById(id);
        setRecipe(data);
      } catch {
        setError('Could not load this recipe. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={handleToggleFavorite}
          style={styles.favButton}
          disabled={favLoading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={favorited ? 'heart' : 'heart-outline'}
            size={24}
            color={favorited ? '#D4667A' : '#5C4A35'}
          />
        </TouchableOpacity>
      ),
    });
  }, [navigation, favorited, favLoading]);

  async function handleToggleFavorite() {
    setFavLoading(true);
    try {
      await toggleFavorite(id);
      setFavorited((v) => !v);
    } catch {
      Alert.alert('Error', 'Could not update favourite. Please try again.');
    } finally {
      setFavLoading(false);
    }
  }

  if (loading) return <LoadingState message="Loading recipe..." />;
  if (error || !recipe) return <ErrorState message={error ?? 'Recipe not found.'} onRetry={() => { setLoading(true); setError(null); getRecipeById(id).then(setRecipe).catch(() => setError('Could not load this recipe.')).finally(() => setLoading(false)); }} />;

  const totalSavings = recipe.matchedDeals.reduce((sum, d) => sum + (d.savings ?? 0), 0);

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Hero image */}
      <Image
        source={{ uri: recipe.image_url }}
        style={styles.heroImage}
        placeholder={BLURHASH}
        contentFit="cover"
        transition={300}
      />

      <View style={styles.body}>
        {/* Title + meta */}
        <Text style={styles.title}>{recipe.title}</Text>

        <View style={styles.chips}>
          {recipe.prep_time > 0 && (
            <View style={styles.chip}>
              <Ionicons name="time-outline" size={14} color="#7DB87A" />
              <Text style={styles.chipText}>{recipe.prep_time} min</Text>
            </View>
          )}
          {recipe.servings > 0 && (
            <View style={styles.chip}>
              <Ionicons name="people-outline" size={14} color="#7DB87A" />
              <Text style={styles.chipText}>{recipe.servings} servings</Text>
            </View>
          )}
          {recipe.cuisine ? (
            <View style={styles.chip}>
              <Ionicons name="restaurant-outline" size={14} color="#7DB87A" />
              <Text style={styles.chipText}>{recipe.cuisine}</Text>
            </View>
          ) : null}
          {recipe.meal_type ? (
            <View style={styles.chip}>
              <Ionicons name="sunny-outline" size={14} color="#7DB87A" />
              <Text style={styles.chipText}>{recipe.meal_type}</Text>
            </View>
          ) : null}
        </View>

        {recipe.dietary_tags && recipe.dietary_tags.length > 0 && (
          <View style={styles.tagsRow}>
            {recipe.dietary_tags.map((tag) => (
              <View key={tag} style={styles.dietTag}>
                <Text style={styles.dietTagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}

        {recipe.description ? (
          <Text style={styles.description}>{recipe.description}</Text>
        ) : null}

        {/* Savings summary */}
        {recipe.matchedDeals.length > 0 && (
          <View style={styles.savingsCard}>
            <View style={styles.savingsRow}>
              <Ionicons name="cart" size={18} color="#F4A94E" />
              <Text style={styles.savingsTitle}>
                {recipe.matchedDeals.length} deal{recipe.matchedDeals.length !== 1 ? 's' : ''} available
              </Text>
              {totalSavings > 0 && (
                <View style={styles.savingsBadge}>
                  <Text style={styles.savingsBadgeText}>Save ${totalSavings.toFixed(2)}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Ingredients */}
        <Text style={styles.sectionTitle}>Ingredients</Text>
        <View style={styles.ingredientsList}>
          {recipe.ingredients.map((ing, idx) => {
            const deal = recipe.matchedDeals.find(
              (d) => d.ingredient.toLowerCase() === ing.name.toLowerCase()
            );
            return (
              <View key={idx} style={styles.ingredientItem}>
                <View style={styles.ingredientRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.ingredientName}>
                    {ing.quantity ? `${ing.quantity} ` : ''}
                    <Text style={styles.ingredientNameBold}>{ing.name}</Text>
                  </Text>
                </View>
                {deal && <DealBadge deal={deal} />}
              </View>
            );
          })}
        </View>

        {/* Steps */}
        {recipe.steps && recipe.steps.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Method</Text>
            <View style={styles.stepsList}>
              {recipe.steps.map((step, idx) => (
                <View key={idx} style={styles.stepItem}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#FDFAF5',
  },
  heroImage: {
    width: SCREEN_WIDTH,
    height: IMAGE_HEIGHT,
  },
  favButton: {
    marginRight: 4,
    padding: 4,
  },
  body: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#5C4A35',
    lineHeight: 32,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#D6EDD4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3D7A3A',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  dietTag: {
    backgroundColor: '#fff3e0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dietTagText: {
    fontSize: 12,
    color: '#c07820',
    fontWeight: '600',
  },
  description: {
    fontSize: 15,
    color: '#5C4A35',
    lineHeight: 23,
  },
  savingsCard: {
    backgroundColor: '#FFF8EE',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#F4E0C0',
  },
  savingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  savingsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5C4A35',
    flex: 1,
  },
  savingsBadge: {
    backgroundColor: '#F4A94E',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  savingsBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5C4A35',
    marginTop: 4,
    marginBottom: -4,
  },
  ingredientsList: {
    gap: 12,
  },
  ingredientItem: {
    gap: 4,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#7DB87A',
    marginTop: 6,
    flexShrink: 0,
  },
  ingredientName: {
    fontSize: 15,
    color: '#5C4A35',
    lineHeight: 22,
    flex: 1,
  },
  ingredientNameBold: {
    fontWeight: '600',
  },
  stepsList: {
    gap: 16,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#7DB87A',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumberText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  stepText: {
    fontSize: 15,
    color: '#5C4A35',
    lineHeight: 23,
    flex: 1,
  },
});
