import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../theme';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
}: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.accent} />
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.button} onPress={onRetry} activeOpacity={0.85}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.xxl, gap: spacing.lg },
  message: { fontFamily: fonts.ui, fontSize: 15, color: colors.ink, textAlign: 'center', lineHeight: 22 },
  button: { marginTop: spacing.xs, backgroundColor: colors.brand, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.card },
  buttonText: { fontFamily: fonts.uiMedium, color: colors.onBrand, fontSize: 15 },
});
