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
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RecipesStackParamList } from '../../navigation';
import { useRecipe, useToggleFavorite } from '../../api/hooks';
import DealBadge from '../../components/DealBadge';
import LoadingState from '../../components/LoadingState';
import ErrorState from '../../components/ErrorState';
import { fonts } from '../../theme';

type Props = NativeStackScreenProps<RecipesStackParamList, 'RecipeDetail'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_HEIGHT = 260;

export default function RecipeDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { data: recipe, isLoading, isError, refetch } = useRecipe(id);
  const toggleFav = useToggleFavorite();
  const [favorited, setFavorited] = useState(false);

  function handleToggleFavorite() {
    toggleFav.mutate(id, {
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

  const totalSavings = recipe.matchedDeals.reduce((sum, d) => sum + (d.savings ?? 0), 0);

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      <Image source={recipe.image_url} style={styles.heroImage} contentFit="cover" transition={200} />

      <View style={styles.body}>
        <Text style={styles.title}>{recipe.title}</Text>

        <View style={styles.chips}>
          {recipe.prep_time > 0 && (
            <View style={styles.chip}>
              <Ionicons name="time-outline" size={14} color="#36453B" />
              <Text style={styles.chipText}>{recipe.prep_time} min</Text>
            </View>
          )}
          {recipe.servings > 0 && (
            <View style={styles.chip}>
              <Ionicons name="people-outline" size={14} color="#36453B" />
              <Text style={styles.chipText}>{recipe.servings} servings</Text>
            </View>
          )}
          {recipe.cuisine ? (
            <View style={styles.chip}>
              <Ionicons name="restaurant-outline" size={14} color="#36453B" />
              <Text style={styles.chipText}>{recipe.cuisine}</Text>
            </View>
          ) : null}
          {recipe.meal_type ? (
            <View style={styles.chip}>
              <Ionicons name="sunny-outline" size={14} color="#36453B" />
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

        {recipe.description ? <Text style={styles.description}>{recipe.description}</Text> : null}

        {recipe.matchedDeals.length > 0 && (
          <View style={styles.savingsCard}>
            <View style={styles.savingsRow}>
              <Ionicons name="pricetag" size={18} color="#BE6A43" />
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
  description: { fontSize: 15, fontFamily: 'Inter_400Regular', color: '#2A241F', lineHeight: 23 },
  savingsCard: { backgroundColor: '#F2E2D6', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E6C9B3' },
  savingsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  savingsTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#2A241F', flex: 1 },
  savingsBadge: { backgroundColor: '#BE6A43', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  savingsBadgeText: { color: '#ffffff', fontSize: 12, fontFamily: 'Inter_700Bold' },
  sectionTitle: { fontSize: 18, fontFamily: fonts.display, color: '#2A241F', marginTop: 4, marginBottom: -4 },
  ingredientsList: { gap: 12 },
  ingredientItem: { gap: 4 },
  ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bulletDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#36453B', marginTop: 6, flexShrink: 0 },
  ingredientName: { fontSize: 15, fontFamily: 'Inter_400Regular', color: '#2A241F', lineHeight: 22, flex: 1 },
  ingredientNameBold: { fontFamily: 'Inter_600SemiBold' },
  stepsList: { gap: 16 },
  stepItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  stepNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#36453B', justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  stepNumberText: { color: '#ffffff', fontSize: 14, fontFamily: 'Inter_700Bold' },
  stepText: { fontSize: 15, fontFamily: 'Inter_400Regular', color: '#2A241F', lineHeight: 23, flex: 1 },
});
