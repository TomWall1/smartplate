import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';
import { track } from '../lib/analytics';
import {
  getOffers,
  purchase,
  restore,
  canPurchase,
  isPurchasesAvailable,
  isPurchasesConfigured,
  isUserCancelled,
  SubscriptionOffer,
} from '../api/purchases';
import { colors, fonts, type, spacing, radius, shadow } from '../theme';

export const TERMS_URL   = 'https://www.dealtodish.com/terms';
export const PRIVACY_URL = 'https://www.dealtodish.com/privacy';

// Only features that actually ship. Anything listed here is something the
// subscriber can use the moment they pay — see mobile/APP_STORE_READINESS.md B4.
//
// Two entries were removed rather than reworded. "Favourites" is free now, so
// selling it would be selling nothing. "Personalised matching" described a
// server path this app never calls — it sends no preferences, so a subscriber
// got the same list, only longer. Claiming it was a 2.3.1 risk.
const INCLUDED = [
  {
    icon: 'basket-outline' as const,
    title: 'Pantry matching',
    description: 'Tell us what you already have and we find recipes that use it.',
  },
  {
    icon: 'notifications-outline' as const,
    title: 'Price alerts',
    description: 'Name what you buy often and see the week it goes on special.',
  },
  {
    icon: 'cart-outline' as const,
    title: 'Shopping list',
    description: 'Build it from the recipes you pick, ticked off as you shop.',
  },
  {
    icon: 'wallet-outline' as const,
    title: 'Cost per serve',
    description: 'What a meal actually costs, scaled to the size of your household.',
  },
  {
    icon: 'sparkles-outline' as const,
    title: 'Three times the recipes',
    description: 'Every week we match 150 recipes to the specials instead of 50.',
  },
];

/** "P1M" → "month". Falls back to the raw code rather than inventing a term. */
function periodLabel(period: string | null): string | null {
  if (!period) return null;
  const match = /^P(\d+)([DWMY])$/.exec(period);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = { D: 'day', W: 'week', M: 'month', Y: 'year' }[match[2]] as string;
  return n === 1 ? unit : `${n} ${unit}s`;
}

export default function PaywallScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { isPremium, refreshPremium } = usePremium();

  const [offers, setOffers]   = useState<SubscriptionOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [failed, setFailed]   = useState(false);

  useEffect(() => {
    track('paywall_viewed', { signed_in: !!user, purchasable: canPurchase });
    // Once per mount — the paywall is a modal, so a re-open is a new view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canPurchase) { setLoading(false); return; }
      try {
        const found = await getOffers();
        if (!cancelled) { setOffers(found); setFailed(found.length === 0); }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Nothing left to sell once they are subscribed.
  useEffect(() => {
    if (isPremium && !busy) navigation.goBack();
  }, [isPremium, busy, navigation]);

  const handlePurchase = useCallback(async (offer: SubscriptionOffer) => {
    if (!user) { navigation.navigate('Login'); return; }
    track('purchase_started', { package: offer.identifier });
    setBusy(true);
    try {
      const ok = await purchase(offer);
      if (ok) {
        track('purchase_completed', { package: offer.identifier });
        // Reconcile the server before leaving, so the premium endpoints stop
        // 403-ing rather than making the user wait on the webhook.
        await refreshPremium();
        navigation.goBack();
      }
    } catch (err: any) {
      if (isUserCancelled(err)) {
        track('purchase_cancelled', { package: offer.identifier });
      } else {
        track('purchase_failed', { package: offer.identifier });
        Alert.alert('Purchase failed', err?.message ?? 'Something went wrong. You have not been charged.');
      }
    } finally {
      setBusy(false);
    }
  }, [user, navigation, refreshPremium]);

  // Required by Guideline 3.1.1 — a reinstalling subscriber must get their
  // access back without paying twice.
  const handleRestore = useCallback(async () => {
    if (!user) { navigation.navigate('Login'); return; }
    setBusy(true);
    try {
      const found = await restore();
      track('purchases_restored', { found });
      await refreshPremium();
      if (found) {
        Alert.alert('Purchases restored', 'Your premium access is active again.');
        navigation.goBack();
      } else {
        Alert.alert('Nothing to restore', 'We could not find a previous purchase on this Apple ID.');
      }
    } catch (err: any) {
      Alert.alert('Restore failed', err?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, [user, navigation, refreshPremium]);

  const offer = offers[0] ?? null;
  const period = offer ? periodLabel(offer.period) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Ionicons name="star" size={28} color={colors.accent} />
        </View>
        <Text style={styles.title}>Deals to Dish Premium</Text>
        <Text style={styles.subtitle}>
          Cook from what is on special and what is already in your cupboard.
        </Text>
      </View>

      <View style={styles.card}>
        {INCLUDED.map((item) => (
          <View key={item.title} style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name={item.icon} size={20} color={colors.brand} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowDescription}>{item.description}</Text>
            </View>
          </View>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.xl }} />
      ) : !isPurchasesAvailable ? (
        <Text style={styles.unavailable}>
          Subscriptions are not available in Expo Go. Run a development build to test purchasing.
        </Text>
      ) : !isPurchasesConfigured ? (
        <Text style={styles.unavailable}>
          Subscriptions are not set up in this build yet.
        </Text>
      ) : failed || !offer ? (
        <Text style={styles.unavailable}>
          We could not reach the App Store just now. Please try again in a moment.
        </Text>
      ) : (
        <>
          {/* Price, duration and renewal terms shown before purchase —
              Guideline 3.1.2. The price string comes from the store, so it is
              already in the viewer's currency. */}
          <View style={styles.priceBlock}>
            <Text style={styles.price}>{offer.priceString}</Text>
            {period && <Text style={styles.pricePeriod}>per {period}</Text>}
          </View>

          <TouchableOpacity
            style={[styles.buyButton, busy && styles.buttonDisabled]}
            onPress={() => handlePurchase(offer)}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy
              ? <ActivityIndicator color={colors.onBrand} />
              : <Text style={styles.buyButtonText}>Subscribe</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={handleRestore} disabled={busy} style={styles.restoreButton}>
            <Text style={styles.restoreText}>Restore purchases</Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            {`Payment is charged to your Apple ID at confirmation of purchase. The subscription renews automatically for ${offer.priceString}${period ? ` each ${period}` : ''} unless you turn off auto-renew at least 24 hours before the period ends. Manage or cancel it any time in your App Store account settings.`}
          </Text>

          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>
              <Text style={styles.legalLink}>Terms of use</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>·</Text>
            <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}>
              <Text style={styles.legalLink}>Privacy policy</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content:   { padding: spacing.xl, paddingBottom: spacing.xxxl },

  header: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xl },
  badge: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: colors.accentTint,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title:    { ...type.title, color: colors.ink, textAlign: 'center' },
  subtitle: { ...type.body, color: colors.inkSecondary, textAlign: 'center' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.lg,
    ...shadow.card,
  },
  row:     { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  rowIcon: {
    width: 36, height: 36, borderRadius: radius.tag,
    backgroundColor: colors.brandTint,
    justifyContent: 'center', alignItems: 'center',
  },
  rowText:        { flex: 1, gap: 2 },
  rowTitle:       { ...type.bodyMed, color: colors.ink },
  rowDescription: { ...type.caption, color: colors.inkSecondary },

  priceBlock:  { alignItems: 'center', marginTop: spacing.xxl, gap: 2 },
  price:       { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: colors.accent },
  pricePeriod: { ...type.caption, color: colors.inkSecondary },

  buyButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.card,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buyButtonText:  { ...type.bodyMed, color: colors.onBrand },
  buttonDisabled: { opacity: 0.6 },

  restoreButton: { alignItems: 'center', paddingVertical: spacing.md },
  restoreText:   { ...type.label, color: colors.brand },

  legal:      { ...type.caption, color: colors.inkFaint, textAlign: 'center', marginTop: spacing.sm },
  legalLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  legalLink:  { ...type.caption, color: colors.brand, textDecorationLine: 'underline' },
  legalDot:   { ...type.caption, color: colors.inkFaint },

  unavailable: { ...type.caption, color: colors.inkSecondary, textAlign: 'center', marginTop: spacing.xl },
});
