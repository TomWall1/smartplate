import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
      <Ionicons name="alert-circle-outline" size={48} color="#D4667A" />
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <TouchableOpacity style={styles.button} onPress={onRetry} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDFAF5',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  message: {
    fontSize: 15,
    color: '#5C4A35',
    textAlign: 'center',
    lineHeight: 22,
  },
  button: {
    marginTop: 4,
    backgroundColor: '#7DB87A',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
