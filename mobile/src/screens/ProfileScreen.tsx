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
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';
import { updateState } from '../api/users';

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

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, logout, refreshUser } = useAuth();
  const { isPremium } = usePremium();
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [savingState, setSavingState] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleStateChange(code: string) {
    setSavingState(true);
    try {
      await updateState(code);
      await refreshUser();
      setShowStatePicker(false);
    } catch {
      Alert.alert('Error', 'Could not update your state. Please try again.');
    } finally {
      setSavingState(false);
    }
  }

  function handleSignOut() {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            await logout();
          },
        },
      ]
    );
  }

  const currentStateLabel = AU_STATES.find((s) => s.code === user?.state)?.label ?? user?.state?.toUpperCase() ?? 'Not set';

  // Guest: show sign-in prompt
  if (!user) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Ionicons name="person-outline" size={36} color="#a09080" />
          </View>
          <Text style={styles.email}>Guest</Text>
          <Text style={{ fontSize: 13, color: '#a09080', marginTop: 2 }}>Browse free recipes below</Text>
        </View>

        <View style={styles.section}>
          <View style={[styles.upgradeCard, { borderColor: '#D6EDD4', backgroundColor: '#f6fff5' }]}>
            <View style={styles.upgradeIconRow}>
              <Ionicons name="person-circle-outline" size={24} color="#7DB87A" />
              <Text style={styles.upgradeTitle}>Sign in to unlock more</Text>
            </View>
            <Text style={styles.upgradeText}>
              Create a free account to save your state, favourite recipes, and access premium features.
            </Text>
            <TouchableOpacity
              style={[styles.upgradeButton, { backgroundColor: '#7DB87A' }]}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.85}
            >
              <Text style={styles.upgradeButtonText}>Sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.upgradeButton, { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#7DB87A', marginTop: -4 }]}
              onPress={() => navigation.navigate('SignUp')}
              activeOpacity={0.85}
            >
              <Text style={[styles.upgradeButtonText, { color: '#7DB87A' }]}>Create account</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.upgradeCard}>
            <View style={styles.upgradeIconRow}>
              <Ionicons name="star" size={24} color="#F4A94E" />
              <Text style={styles.upgradeTitle}>Unlock Premium</Text>
            </View>
            <Text style={styles.upgradeText}>
              Get 150 recipes/week, pantry matching, favourites, and meal planning for $9.99/month.
            </Text>
            <TouchableOpacity style={styles.upgradeButton} activeOpacity={0.85}>
              <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Avatar + name */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={36} color="#7DB87A" />
        </View>
        <Text style={styles.email}>{user?.email}</Text>
        {isPremium && (
          <View style={styles.premiumBadge}>
            <Ionicons name="star" size={14} color="#ffffff" />
            <Text style={styles.premiumBadgeText}>Premium</Text>
          </View>
        )}
      </View>

      {/* State section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Shopping location</Text>
        <TouchableOpacity
          style={styles.stateRow}
          onPress={() => setShowStatePicker((v) => !v)}
          activeOpacity={0.8}
        >
          <View style={styles.stateRowLeft}>
            <Ionicons name="location-outline" size={18} color="#7DB87A" />
            <Text style={styles.stateText}>{currentStateLabel}</Text>
          </View>
          <Ionicons
            name={showStatePicker ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#a09080"
          />
        </TouchableOpacity>

        {showStatePicker && (
          <View style={styles.statePicker}>
            {AU_STATES.map((state) => {
              const isActive = user?.state === state.code;
              return (
                <TouchableOpacity
                  key={state.code}
                  style={[styles.stateOption, isActive && styles.stateOptionActive]}
                  onPress={() => handleStateChange(state.code)}
                  disabled={savingState}
                  activeOpacity={0.8}
                >
                  {savingState && isActive ? (
                    <ActivityIndicator size="small" color="#7DB87A" />
                  ) : (
                    <Text style={[styles.stateOptionText, isActive && styles.stateOptionTextActive]}>
                      {state.label}
                    </Text>
                  )}
                  {isActive && !savingState && (
                    <Ionicons name="checkmark" size={16} color="#3D7A3A" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Premium section */}
      {!isPremium && (
        <View style={styles.section}>
          <View style={styles.upgradeCard}>
            <View style={styles.upgradeIconRow}>
              <Ionicons name="star" size={24} color="#F4A94E" />
              <Text style={styles.upgradeTitle}>Unlock Premium</Text>
            </View>
            <Text style={styles.upgradeText}>
              Get access to Pantry matching, unlimited Favourites, and personalised meal planning.
            </Text>
            <TouchableOpacity style={styles.upgradeButton} activeOpacity={0.85}>
              <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Account section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.accountCard}>
          <View style={styles.accountRow}>
            <Ionicons name="mail-outline" size={18} color="#a09080" />
            <Text style={styles.accountLabel}>Email</Text>
            <Text style={styles.accountValue} numberOfLines={1}>{user?.email}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.accountRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#a09080" />
            <Text style={styles.accountLabel}>Plan</Text>
            <Text style={styles.accountValue}>{isPremium ? 'Premium' : 'Free'}</Text>
          </View>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity
        style={[styles.signOutButton, signingOut && styles.signOutDisabled]}
        onPress={handleSignOut}
        disabled={signingOut}
        activeOpacity={0.8}
      >
        {signingOut ? (
          <ActivityIndicator color="#D4667A" />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={18} color="#D4667A" />
            <Text style={styles.signOutText}>Sign out</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#FDFAF5',
  },
  container: {
    padding: 20,
    gap: 20,
    paddingBottom: 48,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D6EDD4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  email: {
    fontSize: 16,
    fontWeight: '700',
    color: '#5C4A35',
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F4A94E',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  premiumBadgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5C4A35',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
  },
  stateRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5C4A35',
  },
  statePicker: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
    overflow: 'hidden',
  },
  stateOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#f0e8e0',
  },
  stateOptionActive: {
    backgroundColor: '#D6EDD4',
  },
  stateOptionText: {
    fontSize: 15,
    color: '#5C4A35',
    fontWeight: '500',
  },
  stateOptionTextActive: {
    fontWeight: '700',
    color: '#3D7A3A',
  },
  upgradeCard: {
    backgroundColor: '#FFF8EE',
    borderRadius: 16,
    padding: 20,
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#F4E0C0',
  },
  upgradeIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#5C4A35',
  },
  upgradeText: {
    fontSize: 14,
    color: '#a09080',
    lineHeight: 21,
  },
  upgradeButton: {
    backgroundColor: '#F4A94E',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  upgradeButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  accountCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
    overflow: 'hidden',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  accountLabel: {
    fontSize: 14,
    color: '#a09080',
    flex: 1,
  },
  accountValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5C4A35',
    maxWidth: 200,
  },
  divider: {
    height: 1,
    backgroundColor: '#f0e8e0',
    marginHorizontal: 16,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#D4667A',
    backgroundColor: '#FFF0F3',
    marginTop: 8,
  },
  signOutDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D4667A',
  },
});
