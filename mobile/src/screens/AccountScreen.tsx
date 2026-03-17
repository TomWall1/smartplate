import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';

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
        <Ionicons name={icon} size={20} color="#7DB87A" />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {onPress && <Ionicons name="chevron-forward" size={18} color="#c8b8a8" />}
    </TouchableOpacity>
  );
}

export default function AccountScreen() {
  const navigation = useNavigation<any>();
  const { user, logout, guestMode } = useAuth();
  const { selectedStore, selectedState } = useStore();

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
            <Ionicons name="person-outline" size={36} color="#a09080" />
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
          <Ionicons name="person" size={36} color="#7DB87A" />
        </View>
        <Text style={styles.emailText}>{user?.email}</Text>
        {user?.is_premium && (
          <View style={styles.premiumBadge}>
            <Ionicons name="star" size={12} color="#F4A94E" />
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

      {/* Account actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <RowItem icon="mail-outline" label="Email" value={user?.email} />
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleLogout} activeOpacity={0.85}>
        <Ionicons name="log-out-outline" size={20} color="#D4667A" />
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFAF5' },
  content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 40, gap: 24 },

  // Guest view
  guestContent: { paddingHorizontal: 20, paddingTop: 40, paddingBottom: 40, gap: 24 },
  guestHeader: { alignItems: 'center', gap: 12 },
  guestTitle: { fontSize: 20, fontWeight: '800', color: '#5C4A35', textAlign: 'center' },
  guestSubtitle: { fontSize: 14, color: '#a09080', textAlign: 'center', lineHeight: 22 },
  authButtons: { gap: 12 },
  signInButton: {
    backgroundColor: '#7DB87A',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  signInButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  createButton: {
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
  },
  createButtonText: { color: '#5C4A35', fontSize: 16, fontWeight: '700' },

  // Profile header
  profileHeader: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#D6EDD4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  emailText: { fontSize: 16, fontWeight: '600', color: '#5C4A35' },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  premiumBadgeText: { fontSize: 12, fontWeight: '700', color: '#F4A94E' },

  // Sections
  section: { gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#a09080', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
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
    backgroundColor: '#D6EDD4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: '#5C4A35' },
  rowValue: { fontSize: 13, color: '#a09080', marginTop: 1 },
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
  signOutText: { fontSize: 15, fontWeight: '700', color: '#D4667A' },
});
