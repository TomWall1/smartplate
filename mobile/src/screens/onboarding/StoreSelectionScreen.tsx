import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';

const STORES = [
  { key: 'woolworths', name: 'Woolworths', color: '#00843D', icon: 'leaf-outline' as const },
  { key: 'coles', name: 'Coles', color: '#E31837', icon: 'cart-outline' as const },
  { key: 'iga', name: 'IGA', color: '#003DA5', icon: 'storefront-outline' as const },
];

export default function StoreSelectionScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { setSelectedStore, selectedState } = useStore();

  async function handleSelect(store: string) {
    await setSelectedStore(store);
    // If state isn't set yet, advance to StateSelection; otherwise the RootNavigator
    // will detect hasCompletedOnboarding and switch to the main app automatically.
    const effectiveState = user?.state || selectedState;
    if (!effectiveState) {
      navigation.navigate('StateSelection');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.logoCircle}>
            <Ionicons name="leaf" size={32} color="#7DB87A" />
          </View>
          <Text style={styles.title}>Choose your store</Text>
          <Text style={styles.subtitle}>
            We'll find the best deals and recipes for you this week
          </Text>
        </View>

        <View style={styles.storeList}>
          {STORES.map((store) => (
            <TouchableOpacity
              key={store.key}
              style={styles.storeButton}
              onPress={() => handleSelect(store.key)}
              activeOpacity={0.8}
            >
              <View style={[styles.storeIcon, { backgroundColor: store.color }]}>
                <Ionicons name={store.icon} size={28} color="#ffffff" />
              </View>
              <Text style={styles.storeName}>{store.name}</Text>
              <Ionicons name="chevron-forward" size={20} color="#a09080" />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FDFAF5' },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    justifyContent: 'center',
  },
  header: { alignItems: 'center', marginBottom: 40, gap: 10 },
  logoCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#D6EDD4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#5C4A35',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#a09080',
    textAlign: 'center',
    lineHeight: 22,
  },
  storeList: { gap: 14 },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
    shadowColor: '#5C4A35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
    gap: 16,
  },
  storeIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storeName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#5C4A35',
  },
});
