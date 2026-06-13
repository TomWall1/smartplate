import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { updateState } from '../../api/users';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';

const AU_STATES = [
  { code: 'nsw', label: 'NSW', name: 'New South Wales' },
  { code: 'vic', label: 'VIC', name: 'Victoria' },
  { code: 'qld', label: 'QLD', name: 'Queensland' },
  { code: 'wa', label: 'WA', name: 'Western Australia' },
  { code: 'sa', label: 'SA', name: 'South Australia' },
  { code: 'tas', label: 'TAS', name: 'Tasmania' },
  { code: 'act', label: 'ACT', name: 'Australian Capital Territory' },
  { code: 'nt', label: 'NT', name: 'Northern Territory' },
];

export default function StateSelectionScreen() {
  const navigation = useNavigation<any>();
  const { user, refreshUser } = useAuth();
  const { setSelectedState } = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!selected) {
      Alert.alert('Select a state', 'Please select your state before continuing.');
      return;
    }
    setLoading(true);
    try {
      // Always persist locally (used for guest mode + as local cache)
      await setSelectedState(selected);

      // Also save to backend for logged-in users
      if (user) {
        await updateState(selected);
        await refreshUser();
      }

      // If this screen was presented as a modal, dismiss it
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
      // Otherwise the RootNavigator reacts to effectiveState changing automatically
    } catch (err: any) {
      Alert.alert('Error', 'Could not save your state. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Where are you shopping?</Text>
      <Text style={styles.subtitle}>
        We'll show you deals from supermarkets in your state.
      </Text>

      <View style={styles.grid}>
        {AU_STATES.map((state) => {
          const isSelected = selected === state.code;
          return (
            <TouchableOpacity
              key={state.code}
              style={[styles.stateButton, isSelected && styles.stateButtonSelected]}
              onPress={() => setSelected(state.code)}
              activeOpacity={0.8}
            >
              <Text style={[styles.stateLabel, isSelected && styles.stateLabelSelected]}>
                {state.label}
              </Text>
              <Text style={[styles.stateName, isSelected && styles.stateNameSelected]} numberOfLines={2}>
                {state.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.saveButton, (!selected || loading) && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!selected || loading}
        activeOpacity={0.85}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.saveButtonText}>Save & continue</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#F4EEE2',
  },
  container: {
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 24,
  },
  title: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: '#2A241F',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B5F52',
    textAlign: 'center',
    lineHeight: 22,
    marginTop: -8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  stateButton: {
    width: '47%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E2D8C6',
    alignItems: 'center',
    gap: 4,
  },
  stateButtonSelected: {
    borderColor: '#36453B',
    backgroundColor: '#DCE4D6',
  },
  stateLabel: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: '#2A241F',
  },
  stateLabelSelected: {
    color: '#36453B',
  },
  stateName: {
    fontSize: 11,
    color: '#6B5F52',
    textAlign: 'center',
  },
  stateNameSelected: {
    color: '#36453B',
  },
  saveButton: {
    backgroundColor: '#36453B',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
});
