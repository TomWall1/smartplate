import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { usePremium } from '../context/PremiumContext';
import { deleteAccount } from '../api/users';
import { TERMS_URL, PRIVACY_URL } from './PaywallScreen';

// Apple's subscription management page — the only place an App Store
// subscription can actually be cancelled.
const MANAGE_SUBSCRIPTION_URL = 'https://apps.apple.com/account/subscriptions';

const AU_STATE_NAMES: Record<string, string> = {
  nsw: 'New South Wales',
  vic: 'Victoria',
  qld: 'Queensland',
  wa: 'Western Australia',
  sa: 'South Australia',
  tas: 'Tasmania',
  act: 'Australian Capital Territory',
  nt: 'Northern Territory',
};

const STORE_NAMES: Record<string, string> = {
  woolworths: 'Woolworths',
  coles: 'Coles',
  iga: 'IGA',
};

function RowItem({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color="#36453B" />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={18} color="#9A8E7E" />}
    </TouchableOpacity>
  );
}

export default function AccountScreen() {
  const navigation = useNavigation<any>();
  const { user, logout, guestMode } = useAuth();
  const { selectedStore, selectedState } = useStore();
  const { isPremium, status } = usePremium();
  const [deleting, setDeleting] = useState(false);

  const planLabel = isPremium
    ? (status?.lapsing && status.expiresAt
        ? `Premium until ${new Date(status.expiresAt).toLocaleDateString()}`
        : 'Premium')
    : 'Free';

  // Deleting the account does NOT cancel an App Store subscription — only the
  // user can, through Apple. Saying so here is what stops someone deleting
  // their account and continuing to be billed for it.
  const hasStoreSubscription = isPremium && status?.source !== 'admin';

  function handleDeleteAccount() {
    const consequence =
      'This permanently deletes your account, saved recipes and pantry. It cannot be undone.';
    const subscriptionNote = hasStoreSubscription
      ? '\n\nYour subscription is billed by Apple and is not cancelled by deleting your account. Cancel it in your App Store settings first, or you will keep being charged.'
      : '';

    Alert.alert('Delete account', consequence + subscriptionNote, [
      { text: 'Cancel', style: 'cancel' },
      ...(hasStoreSubscription
        ? [{
            text: 'Manage subscription',
            onPress: () => WebBrowser.openBrowserAsync(MANAGE_SUBSCRIPTION_URL),
          }]
        : []),
      {
        text: 'Delete',
        style: 'destructive' as const,
        // Second explicit confirmation — a destructive, irreversible action
        // should not be one stray tap away.
        onPress: () => Alert.alert(
          'Delete account?',
          'Last chance — this cannot be undone.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete for ever', style: 'destructive', onPress: doDelete },
          ],
        ),
      },
    ]);
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await deleteAccount();
      // Clears tokens and drops back to the logged-out stack.
      await logout();
    } catch {
      Alert.alert('Could not delete account', 'Something went wrong. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  const effectiveState = user?.state || selectedState;
  const stateName = effectiveState ? AU_STATE_NAMES[effectiveState] ?? effectiveState.toUpperCase() : null;
  const storeName = selectedStore ? STORE_NAMES[selectedStore] ?? selectedStore : null;

  async function handleLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => logout(),
      },
    ]);
  }

  if (!user && guestMode) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.guestContent}>
        <View style={styles.guestHeader}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person-outline" size={36} color="#6B5F52" />
          </View>
          <Text style={styles.guestTitle}>You're browsing as a guest</Text>
          <Text style={styles.guestSubtitle}>
            Sign in to save your preferences, access premium features, and keep your favourites.
          </Text>
        </View>

        <View style={styles.authButtons}>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}
          >
            <Text style={styles.signInButtonText}>Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => navigation.navigate('SignUp')}
            activeOpacity={0.85}
          >
            <Text style={styles.createButtonText}>Create account</Text>
          </TouchableOpacity>
        </View>

        {/* Still show store/state settings for guest */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your preferences</Text>
          <View style={styles.card}>
            <RowItem
              icon="storefront-outline"
              label="Store"
              value={storeName ?? 'Not set'}
              onPress={() => navigation.navigate('StoreSelection')}
            />
            <View style={styles.divider} />
            <RowItem
              icon="location-outline"
              label="State"
              value={stateName ?? 'Not set'}
              onPress={() => navigation.navigate('StateSelection')}
            />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarCircle}>
          <Ionicons name="person" size={36} color="#36453B" />
        </View>
        <Text style={styles.emailText}>{user?.email}</Text>
        {/* Same source as the plan row and the Premium tab. Reading the raw
            is_premium column here let the badge say Premium while the rest of
            the app said Free — the column has no expiry, the status does. */}
        {isPremium && (
          <View style={styles.premiumBadge}>
            <Ionicons name="star" size={12} color="#BE6A43" />
            <Text style={styles.premiumBadgeText}>Premium</Text>
          </View>
        )}
      </View>

      {/* Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.card}>
          <RowItem
            icon="storefront-outline"
            label="Store"
            value={storeName ?? 'Not set'}
            onPress={() => navigation.navigate('StoreSelection')}
          />
          <View style={styles.divider} />
          <RowItem
            icon="location-outline"
            label="State"
            value={stateName ?? 'Not set'}
            onPress={() => navigation.navigate('StateSelection')}
          />
        </View>
      </View>

      {/* Subscription */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription</Text>
        <View style={styles.card}>
          <RowItem
            icon="star-outline"
            label="Plan"
            value={planLabel}
            onPress={isPremium ? undefined : () => navigation.navigate('Paywall')}
          />
          {isPremium && (
            <>
              <View style={styles.divider} />
              {/* Only Apple can cancel an App Store subscription, so this hands
                  the user off rather than pretending to manage it here. */}
              <RowItem
                icon="card-outline"
                label="Manage subscription"
                onPress={() => WebBrowser.openBrowserAsync(MANAGE_SUBSCRIPTION_URL)}
              />
            </>
          )}
        </View>
      </View>

      {/* Account actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <RowItem icon="mail-outline" label="Email" value={user?.email} />
          <View style={styles.divider} />
          <RowItem
            icon="document-text-outline"
            label="Privacy policy"
            onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}
          />
          <View style={styles.divider} />
          <RowItem
            icon="reader-outline"
            label="Terms of use"
            onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}
          />
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleLogout} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={20} color="#D4667A" />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      {/* Account deletion — required in-app by App Store Guideline 5.1.1(v). */}
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={handleDeleteAccount}
        disabled={deleting}
        activeOpacity={0.85}
      >
        {deleting
          ? <ActivityIndicator color="#A23E2E" />
          : <Text style={styles.deleteText}>Delete account</Text>}
      </TouchableOpacity>
      <Text style={styles.deleteCaption}>
        This permanently removes your account and everything saved to it. It cannot be undone.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4EEE2' },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 24 },

  // Guest view
  guestContent: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 40, gap: 24 },
  guestHeader: { alignItems: 'center', gap: 12 },
  guestTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#2A241F', textAlign: 'center' },
  guestSubtitle: { fontSize: 14, color: '#6B5F52', textAlign: 'center', lineHeight: 22 },
  authButtons: { gap: 12 },
  signInButton: {
    backgroundColor: '#36453B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  signInButtonText: { color: '#ffffff', fontSize: 16, fontFamily: 'Inter_700Bold' },
  createButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2D8C6',
  },
  createButtonText: { color: '#2A241F', fontSize: 16, fontFamily: 'Inter_700Bold' },

  // Profile header
  profileHeader: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DCE4D6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emailText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#2A241F' },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  premiumBadgeText: { fontSize: 12, fontFamily: 'Inter_700Bold', color: '#BE6A43' },

  // Sections
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontFamily: 'Inter_700Bold', color: '#6B5F52', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2D8C6',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DCE4D6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#2A241F' },
  rowValue: { fontSize: 13, color: '#6B5F52', marginTop: 1 },
  divider: { height: 1, backgroundColor: '#f0ede8', marginLeft: 60 },

  // Sign out
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff0f2',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#f9d5da',
  },
  signOutText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#D4667A' },

  // Deliberately quieter than sign out — reachable in two taps as Apple
  // requires, but not competing with it for attention.
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
  },
  deleteText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#A23E2E' },
  deleteCaption: {
    fontSize: 12,
    color: '#9A8E7E',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 16,
    marginTop: -4,
  },
});
