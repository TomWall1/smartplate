import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { colors, radius, spacing, shadow } from '../theme';

/**
 * Placeholder cards shown on first load (before any cached data). Gentler than
 * a full-screen spinner and matches the RecipeCard shape so the list doesn't
 * jump when real data arrives. A subtle opacity pulse reads as "loading".
 */
function SkeletonCard({ pulse }: { pulse: Animated.Value }) {
  return (
    <View style={styles.card}>
      <Animated.View style={[styles.image, { opacity: pulse }]} />
      <View style={styles.body}>
        <Animated.View style={[styles.line, { width: '70%', opacity: pulse }]} />
        <Animated.View style={[styles.line, { width: '40%', opacity: pulse }]} />
      </View>
    </View>
  );
}

export default function RecipeListSkeleton({ count = 4 }: { count?: number }) {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} pulse={pulse} />
      ))}
    </View>
  );
}

const block = colors.sunken;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing.sm },
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
  image: { width: '100%', height: 176, backgroundColor: block },
  body: { padding: spacing.lg, gap: spacing.sm },
  line: { height: 14, borderRadius: 6, backgroundColor: block },
});
