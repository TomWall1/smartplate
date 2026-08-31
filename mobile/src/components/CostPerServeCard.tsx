import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { usePremium } from '../context/PremiumContext';
import { useAuth } from '../context/AuthContext';
import { Recipe } from '../types';
import { costingFor, money, scaleLabel } from '../lib/costing';
import { colors, fonts, type, spacing, radius } from '../theme';

/**
 * Cost per serve, scaled to the household — a premium feature on the recipe
 * screen.
 *
 * Free accounts see the locked version rather than nothing at all: the point
 * of a gate on a paid tier is to show what is behind it, and this is a figure
 * people can judge the value of at a glance.
 */
export default function CostPerServeCard({ recipe }: { recipe: Recipe }) {
  const navigation = useNavigation<any>();
  const { isPremium } = usePremium();
  const { user } = useAuth();

  const costing = costingFor(recipe, user?.household_size ?? null);

  // No servings count or no priced ingredients — say nothing rather than
  // showing a figure we cannot stand behind.
  if (!costing) return null;

  if (!isPremium) {
    return (
      <TouchableOpacity
        style={[styles.card, styles.lockedCard]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate(user ? 'Paywall' : 'Login')}
      >
        <View style={styles.lockedRow}>
          <Ionicons name="lock-closed" size={15} color={colors.inkSecondary} />
          <Text style={styles.lockedText}>Cost per serve, scaled to your household</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.inkSecondary} />
        </View>
      </TouchableOpacity>
    );
  }

  const scale = costing.scaleFactor ? scaleLabel(costing.scaleFactor) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>At this week's prices</Text>

      <View style={styles.figureRow}>
        <Text style={styles.figure}>{money(costing.perServe)}</Text>
        <Text style={styles.figureUnit}>per serve</Text>
      </View>

      {costing.householdCost != null && costing.householdSize ? (
        <Text style={styles.sentence}>
          {money(costing.householdCost)} to feed {costing.householdSize}
          {scale ? ` — the recipe makes ${costing.servings}, so cook it ${scale}` : ''}.
        </Text>
      ) : (
        <Text style={styles.sentence}>
          The recipe makes {costing.servings} serving{costing.servings === 1 ? '' : 's'}.{' '}
          <Text
            style={styles.link}
            onPress={() => navigation.navigate('AccountTab')}
          >
            Set your household size
          </Text>{' '}
          to see what a meal costs you.
        </Text>
      )}

      {costing.perServeSaving ? (
        <Text style={styles.saving}>
          {money(costing.perServeSaving)} a serve less than usual, thanks to this week's specials.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  lockedCard: {
    backgroundColor: colors.sunken,
    borderStyle: 'dashed',
  },
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lockedText: {
    ...type.label,
    color: colors.inkSecondary,
    flex: 1,
  },
  eyebrow: {
    ...type.caption,
    color: colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  figure: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 38,
    color: colors.accent,
  },
  figureUnit: {
    ...type.body,
    color: colors.inkSecondary,
  },
  sentence: {
    ...type.body,
    color: colors.ink,
  },
  link: {
    color: colors.brand,
    textDecorationLine: 'underline',
  },
  saving: {
    ...type.caption,
    color: colors.inkSecondary,
    marginTop: spacing.xs,
  },
});
