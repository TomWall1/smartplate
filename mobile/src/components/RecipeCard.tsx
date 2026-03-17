import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Recipe } from '../types';

interface Props {
  recipe: Recipe;
  onPress: () => void;
}

export default function RecipeCard({ recipe, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.imageWrapper}>
        <Image
          source={{ uri: recipe.image_url }}
          style={styles.image}
          resizeMode="cover"
        />
        {recipe.deal_count > 0 && (
          <View style={styles.dealBadge}>
            <Text style={styles.dealBadgeText}>🛒 {recipe.deal_count} deal{recipe.deal_count !== 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{recipe.title}</Text>

        <View style={styles.meta}>
          {recipe.prep_time > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={14} color="#a09080" />
              <Text style={styles.metaText}>{recipe.prep_time} min</Text>
            </View>
          )}
          {recipe.servings > 0 && (
            <View style={styles.metaItem}>
              <Ionicons name="people-outline" size={14} color="#a09080" />
              <Text style={styles.metaText}>{recipe.servings} servings</Text>
            </View>
          )}
          {recipe.cuisine ? (
            <View style={styles.metaItem}>
              <Ionicons name="restaurant-outline" size={14} color="#a09080" />
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
    backgroundColor: '#ffffff',
    borderRadius: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
    shadowColor: 'rgba(92, 74, 53, 0.08)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  imageWrapper: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 180,
  },
  dealBadge: {
    position: 'absolute',
    bottom: 10,
    left: 12,
    backgroundColor: '#7DB87A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dealBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  body: {
    padding: 14,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#5C4A35',
    lineHeight: 22,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: '#a09080',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: '#D6EDD4',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3D7A3A',
  },
});
