import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Recipe } from '../types';
import { colors, fonts, radius, spacing, shadow } from '../theme';

interface Props {
  recipe: Recipe;
  onPress: () => void;
}

const BLUR = 'L6Pj0^jE.AyE_3t7t7R**0o#DgR4'; // soft neutral placeholder

export default function RecipeCard({ recipe, onPress }: Props) {
  const handlePress = () => {
    Haptics.selectionAsync().catch(() => {});
    onPress();
  };

  const dealCount = recipe.matchedDeals?.length ?? 0;
  const prep = recipe.prepTime ?? recipe.cookTime;
  const saving = recipe.estimatedSaving ?? 0;
  const tags = recipe.tags ?? [];

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={0.9}>
      <View style={styles.imageWrapper}>
        <Image source={recipe.image} style={styles.image} contentFit="cover" transition={200} placeholder={BLUR} />
        {dealCount > 0 && (
          <View style={styles.dealBadge}>
            <Ionicons name="pricetag" size={11} color={colors.onBrand} />
            <Text style={styles.dealBadgeText}>{dealCount} deal{dealCount !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{recipe.title}</Text>

        <View style={styles.meta}>
          {prep ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color={colors.inkSecondary} />
              <Text style={styles.metaText}>{prep} min</Text>
            </View>
          ) : null}
          {recipe.servings ? (
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={14} color={colors.inkSecondary} />
              <Text style={styles.metaText}>{recipe.servings} servings</Text>
            </View>
          ) : null}
          {saving > 0 && (
            <View style={styles.savingItem}>
              <Text style={styles.savingText}>Save ${saving.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {tags.length > 0 && (
          <View style={styles.tags}>
            {tags.slice(0, 3).map((tag) => (
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
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary },
  savingItem: { backgroundColor: colors.accentTint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  savingText: { fontFamily: fonts.uiMedium, fontSize: 12, color: colors.accent },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: colors.brandTint, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  tagText: { fontFamily: fonts.uiMedium, fontSize: 11, color: colors.brand },
});
