import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { PremiumProvider } from './src/context/PremiumContext';
import RootNavigator from './src/navigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PremiumProvider>
          <RootNavigator />
          <StatusBar style="dark" backgroundColor="#FDFAF5" />
        </PremiumProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
