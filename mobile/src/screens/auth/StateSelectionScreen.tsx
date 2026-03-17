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
import { updateState } from '../../api/users';
import { useAuth } from '../../context/AuthContext';

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
  const { refreshUser } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!selected) {
      Alert.alert('Select a state', 'Please select your state before continuing.');
      return;
    }
    setLoading(true);
    try {
      await updateState(selected);
      await refreshUser();
      // Navigation happens automatically — AuthContext refreshUser updates user.state,
      // which the navigator uses to decide which screen to show.
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
    backgroundColor: '#FDFAF5',
  },
  container: {
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 24,
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
    borderColor: '#e8e0d4',
    alignItems: 'center',
    gap: 4,
  },
  stateButtonSelected: {
    borderColor: '#7DB87A',
    backgroundColor: '#D6EDD4',
  },
  stateLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: '#5C4A35',
  },
  stateLabelSelected: {
    color: '#3D7A3A',
  },
  stateName: {
    fontSize: 11,
    color: '#a09080',
    textAlign: 'center',
  },
  stateNameSelected: {
    color: '#3D7A3A',
  },
  saveButton: {
    backgroundColor: '#7DB87A',
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
    fontWeight: '700',
  },
});
