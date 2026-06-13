import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { colors, fonts, spacing } from '../theme';

interface Props {
  message?: string;
}

export default function LoadingState({ message = 'Loading…' }: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  text: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkSecondary },
});
