import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';

interface Props {
  message?: string;
}

export default function LoadingState({ message = 'Loading...' }: Props) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#7DB87A" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDFAF5',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  text: {
    fontSize: 15,
    color: '#a09080',
    fontFamily: 'System',
  },
});
