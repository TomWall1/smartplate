import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, type, spacing, radius } from '../theme';

interface State { hasError: boolean; }

/**
 * Top-level error boundary so a render crash shows a calm branded screen with a
 * retry instead of a white screen of death.
 */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error('Uncaught error in render tree:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.container}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.accent} />
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>The app hit an unexpected error. Try again.</Text>
        <TouchableOpacity
          style={styles.button}
          activeOpacity={0.85}
          onPress={() => this.setState({ hasError: false })}
        >
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  title: { ...type.title, color: colors.ink },
  body: { ...type.body, color: colors.inkSecondary, textAlign: 'center' },
  button: { marginTop: spacing.sm, backgroundColor: colors.brand, paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.card },
  buttonText: { ...type.bodyMed, color: colors.onBrand },
});
