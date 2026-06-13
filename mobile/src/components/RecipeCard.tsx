import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Recipe } from '../types';
import { colors, fonts, radius, spacing, shadow } from '../theme';

interface Props {
  recipe: Recipe;
  onPress: () => void;
}

const BLUR = 'L6Pj0^jE.AyE_3t7t7R**0o#DgR4'; // soft neutral placeholder

export default function RecipeCard({ recipe, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.imageWrapper}>
        <Image
          source={recipe.image_url}
          style={styles.image}
          contentFit="cover"
          transition={200}
          placeholder={BLUR}
        />
        {recipe.deal_count > 0 && (
          <View style={styles.dealBadge}>
            <Ionicons name="pricetag" size={11} color={colors.onBrand} />
            <Text style={styles.dealBadgeText}>
              {recipe.deal_count} deal{recipe.deal_count !== 1 ? 's' : ''}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{recipe.title}</Text>

        <View style={styles.meta}>
          {recipe.prep_time > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={colors.inkSecondary} />
              <Text style={styles.metaText}>{recipe.prep_time} min</Text>
            </View>
          )}
          {recipe.servings > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={14} color={colors.inkSecondary} />
              <Text style={styles.metaText}>{recipe.servings} servings</Text>
            </View>
          )}
          {recipe.cuisine ? (
            <View style={styles.metaItem}>
              <Ionicons name="restaurant-outline" size={14} color={colors.inkSecondary} />
              <Text style={styles.metaText}>{recipe.cuisine}</Text>
            </View>
          ) : null}
        </View>

        {recipe.dietary_tags && recipe.dietary_tags.length > 0 && (
          <View style={styles.tags}>
            {recipe.dietary_tags.slice(0, 3).map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  imageWrapper: { position: 'relative' },
  image: { width: '100%', height: 176, backgroundColor: colors.sunken },
  dealBadge: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  dealBadgeText: { color: colors.onBrand, fontSize: 12, fontFamily: fonts.uiMedium },
  body: { padding: spacing.lg, gap: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.ink },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: colors.brandTint, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  tagText: { fontFamily: fonts.uiMedium, fontSize: 11, color: colors.brand },
});
