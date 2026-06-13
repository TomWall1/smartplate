import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';
import { colors, fonts, spacing, radius, shadow, storeColors } from '../../theme';

const favicon = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

const STORES = [
  { key: 'woolworths', name: 'Woolworths', logo: favicon('woolworths.com.au') },
  { key: 'coles', name: 'Coles', logo: favicon('coles.com.au') },
  { key: 'iga', name: 'IGA', logo: favicon('iga.com.au') },
];

export default function StoreSelectionScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { setSelectedStore, selectedStore, selectedState } = useStore();
  const effectiveState = user?.state || selectedState;

  async function handleSelect(store: string) {
    await setSelectedStore(store);
    if (!effectiveState) {
      // First-run onboarding — continue to state selection.
      navigation.navigate('StateSelection');
    } else if (navigation.canGoBack()) {
      // Opened as a "change store" modal — dismiss it.
      navigation.goBack();
    }
    // else: onboarding with state already set → RootNavigator switches automatically.
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Image source={require('../../../assets/icon.png')} style={styles.appIcon} contentFit="cover" />
          <Text style={styles.title}>Choose your store</Text>
          <Text style={styles.subtitle}>We'll find the best deals and recipes for you this week</Text>
        </View>

        <View style={styles.storeList}>
          {STORES.map((s) => {
            const sc = storeColors[s.key];
            const active = selectedStore === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.storeButton, active && { borderColor: sc.color, borderWidth: 2 }]}
                onPress={() => handleSelect(s.key)}
                activeOpacity={0.85}
              >
                <View style={[styles.logoTile, { backgroundColor: sc.tint }]}>
                  <Image source={s.logo} style={styles.storeLogo} contentFit="contain" />
                </View>
                <Text style={styles.storeName}>{s.name}</Text>
                {active ? (
                  <Ionicons name="checkmark-circle" size={22} color={sc.color} />
                ) : (
                  <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxl, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: spacing.xxxl, gap: spacing.sm },
  appIcon: { width: 64, height: 64, borderRadius: 16, marginBottom: spacing.xs },
  title: { fontSize: 26, fontFamily: fonts.display, color: colors.ink, textAlign: 'center' },
  subtitle: { fontSize: 15, fontFamily: fonts.ui, color: colors.inkSecondary, textAlign: 'center', lineHeight: 22 },
  storeList: { gap: spacing.md },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.lg,
    ...shadow.card,
  },
  logoTile: { width: 52, height: 52, borderRadius: radius.card, justifyContent: 'center', alignItems: 'center' },
  storeLogo: { width: 30, height: 30 },
  storeName: { flex: 1, fontSize: 18, fontFamily: fonts.display, color: colors.ink },
});
