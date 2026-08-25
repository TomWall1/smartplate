import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { updateSelectedStore, updateState } from '../../api/users';
import { useStore } from '../../context/StoreContext';
import { colors, fonts, spacing, radius, shadow, storeColors } from '../../theme';
import { track } from '../../lib/analytics';

const favicon = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

const STORES = [
  { key: 'woolworths', name: 'Woolworths', logo: favicon('woolworths.com.au') },
  { key: 'coles', name: 'Coles', logo: favicon('coles.com.au') },
  { key: 'iga', name: 'IGA', logo: favicon('iga.com.au') },
];

// State is not a filter — each state has its own catalogue, so it decides which
// recipes exist and what they cost. NSW and VIC share only ~1 of their top 10
// recipes, so guessing would misprice the very thing we are showing off.
const AU_STATES = [
  { code: 'nsw', label: 'NSW' },
  { code: 'vic', label: 'VIC' },
  { code: 'qld', label: 'QLD' },
  { code: 'wa', label: 'WA' },
  { code: 'sa', label: 'SA' },
  { code: 'tas', label: 'TAS' },
  { code: 'act', label: 'ACT' },
  { code: 'nt', label: 'NT' },
];

export default function StoreSelectionScreen() {
  const navigation = useNavigation<any>();
  const { user, refreshUser, enterGuestMode } = useAuth();
  const { setSelectedStore, setSelectedState, selectedStore, selectedState } = useStore();
  const effectiveState = user?.state || selectedState;

  // No state yet means this is a first run, and this screen collects both
  // answers before anything else. Reopened later as "change store" (state
  // already known), it keeps its original behaviour: tap a store, done.
  const isFirstRun = !effectiveState;

  const [pendingStore, setPendingStore] = useState<string | null>(selectedStore);
  const [pendingState, setPendingState] = useState<string | null>(effectiveState ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isFirstRun) track('onboarding_started');
  }, [isFirstRun]);

  async function applyStore(store: string) {
    await setSelectedStore(store);
    // Persist for logged-in users so the choice survives a reinstall. Local
    // storage already has it, so a failure here is not worth blocking on.
    if (user) {
      try {
        await updateSelectedStore(store);
        await refreshUser();
      } catch {
        // Offline or backend down — the local preference still applies.
      }
    }
  }

  // "Change store" mode — apply immediately and dismiss.
  async function handleSelectExisting(store: string) {
    await applyStore(store);
    if (navigation.canGoBack()) navigation.goBack();
  }

  // First-run mode — both answers, then straight through to the recipes.
  async function handleContinue() {
    if (!pendingStore || !pendingState || saving) return;
    setSaving(true);
    try {
      await applyStore(pendingStore);
      await setSelectedState(pendingState);
      if (user) {
        try {
          await updateState(pendingState);
          await refreshUser();
        } catch {
          // Local preference still applies.
        }
      } else {
        // Browsing without an account: guest mode is what lets RootNavigator
        // move on to the app instead of falling through to the sign-in wall.
        await enterGuestMode();
      }
      track('onboarding_completed', {
        store: pendingStore,
        state: pendingState,
        signed_in: !!user,
      });
      // RootNavigator swaps trees on its own once store + state are set.
    } finally {
      setSaving(false);
    }
  }

  const ready = !!pendingStore && !!pendingState;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.container, !isFirstRun && styles.containerCentred]}>
        <View style={styles.header}>
          <Image source={require('../../../assets/icon.png')} style={styles.appIcon} contentFit="cover" />
          <Text style={styles.title}>{isFirstRun ? 'Where do you shop?' : 'Choose your store'}</Text>
          <Text style={styles.subtitle}>
            {isFirstRun
              ? "Two taps and we'll show you what's worth cooking this week."
              : "We'll find the best deals and recipes for you this week"}
          </Text>
        </View>

        <View style={styles.storeList}>
          {STORES.map((s) => {
            const sc = storeColors[s.key];
            const active = isFirstRun ? pendingStore === s.key : selectedStore === s.key;
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.storeButton, active && { borderColor: sc.color, borderWidth: 2 }]}
                onPress={() => {
                  track('store_selected', { store: s.key, first_run: isFirstRun });
                  return isFirstRun ? setPendingStore(s.key) : handleSelectExisting(s.key);
                }}
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

        {isFirstRun && (
          <>
            <Text style={styles.stateLabel}>Your state</Text>
            <View style={styles.stateGrid}>
              {AU_STATES.map((st) => {
                const active = pendingState === st.code;
                return (
                  <TouchableOpacity
                    key={st.code}
                    style={[styles.stateChip, active && styles.stateChipActive]}
                    onPress={() => {
                      track('state_selected', { state: st.code });
                      setPendingState(st.code);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.stateChipText, active && styles.stateChipTextActive]}>
                      {st.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[styles.cta, !ready && styles.ctaDisabled]}
              onPress={handleContinue}
              disabled={!ready || saving}
              activeOpacity={0.9}
            >
              {saving ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={styles.ctaText}>Show me this week's recipes</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.signInRow}
              onPress={() => {
                track('signin_link_tapped', { source: 'onboarding' });
                navigation.navigate('Login');
              }}
            >
              <Text style={styles.signInText}>
                Already have an account? <Text style={styles.signInLink}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxl, flexGrow: 1 },
  containerCentred: { justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.sm },
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

  stateLabel: {
    fontSize: 13,
    fontFamily: fonts.uiMedium,
    color: colors.inkSecondary,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  stateGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stateChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.tag,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stateChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  stateChipText: { fontSize: 14, fontFamily: fonts.uiMedium, color: colors.inkSecondary },
  stateChipTextActive: { color: colors.onBrand },

  cta: {
    marginTop: spacing.xxl,
    backgroundColor: colors.brand,
    borderRadius: radius.tag,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { fontSize: 16, fontFamily: fonts.uiMedium, color: colors.onBrand },
  signInRow: { marginTop: spacing.lg, alignItems: 'center' },
  signInText: { fontSize: 14, fontFamily: fonts.ui, color: colors.inkSecondary },
  signInLink: { fontFamily: fonts.uiMedium, color: colors.brand },
});
