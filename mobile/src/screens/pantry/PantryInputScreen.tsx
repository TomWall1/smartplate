import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { PantryStackParamList } from '../../navigation';
import { matchPantry } from '../../api/pantry';

type Props = NativeStackScreenProps<PantryStackParamList, 'PantryInput'>;

const QUICK_ADD_ITEMS = [
  'Chicken', 'Rice', 'Eggs', 'Pasta',
  'Onion', 'Garlic', 'Tomatoes', 'Cheese',
];

export default function PantryInputScreen({ navigation }: Props) {
  const [inputText, setInputText] = useState('');
  const [items, setItems] = useState<string[]>([]);
  const [includeStaples, setIncludeStaples] = useState(false);
  const [loading, setLoading] = useState(false);

  function addItem(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (items.some((i) => i.toLowerCase() === trimmed.toLowerCase())) return;
    setItems((prev) => [...prev, trimmed]);
  }

  function handleInputSubmit() {
    addItem(inputText);
    setInputText('');
  }

  function removeItem(name: string) {
    setItems((prev) => prev.filter((i) => i !== name));
  }

  function toggleQuickAdd(item: string) {
    if (items.some((i) => i.toLowerCase() === item.toLowerCase())) {
      removeItem(items.find((i) => i.toLowerCase() === item.toLowerCase())!);
    } else {
      addItem(item);
    }
  }

  const handleFindRecipes = useCallback(async () => {
    if (items.length === 0 && !includeStaples) {
      Alert.alert('Add some items', 'Add at least one pantry item to find matching recipes.');
      return;
    }
    setLoading(true);
    try {
      const results = await matchPantry(items, includeStaples);
      navigation.navigate('PantryResults', { results });
    } catch {
      Alert.alert('Error', 'Could not match recipes. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [items, includeStaples, navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>What's in your pantry?</Text>
        <Text style={styles.subheading}>
          Tell us what you have and we'll find recipes with on-sale ingredients.
        </Text>

        {/* Search input */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type an ingredient..."
            placeholderTextColor="#c8b8a8"
            returnKeyType="done"
            onSubmitEditing={handleInputSubmit}
          />
          <TouchableOpacity style={styles.addButton} onPress={handleInputSubmit} activeOpacity={0.8}>
            <Ionicons name="add" size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Quick-add chips */}
        <View>
          <Text style={styles.sectionLabel}>Quick add</Text>
          <View style={styles.quickAddGrid}>
            {QUICK_ADD_ITEMS.map((item) => {
              const isAdded = items.some((i) => i.toLowerCase() === item.toLowerCase());
              return (
                <TouchableOpacity
                  key={item}
                  style={[styles.quickChip, isAdded && styles.quickChipActive]}
                  onPress={() => toggleQuickAdd(item)}
                  activeOpacity={0.8}
                >
                  {isAdded && <Ionicons name="checkmark" size={13} color="#3D7A3A" />}
                  <Text style={[styles.quickChipText, isAdded && styles.quickChipTextActive]}>
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Entered items */}
        {items.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>Your pantry ({items.length})</Text>
            <View style={styles.chipsList}>
              {items.map((item) => (
                <View key={item} style={styles.itemChip}>
                  <Text style={styles.itemChipText}>{item}</Text>
                  <TouchableOpacity
                    onPress={() => removeItem(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  >
                    <Ionicons name="close" size={14} color="#a09080" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Staples toggle */}
        <View style={styles.staplesRow}>
          <View style={styles.staplesText}>
            <Text style={styles.staplesLabel}>I have pantry staples</Text>
            <Text style={styles.staplesHint}>Salt, pepper, oil, flour, etc.</Text>
          </View>
          <Switch
            value={includeStaples}
            onValueChange={setIncludeStaples}
            trackColor={{ false: '#e8e0d4', true: '#7DB87A' }}
            thumbColor="#ffffff"
          />
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.ctaButton, loading && styles.ctaDisabled]}
          onPress={handleFindRecipes}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Ionicons name="search" size={18} color="#ffffff" />
              <Text style={styles.ctaText}>Find Recipes</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#FDFAF5' },
  scroll: { flex: 1 },
  container: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: '#5C4A35',
  },
  subheading: {
    fontSize: 14,
    color: '#a09080',
    lineHeight: 21,
    marginTop: -8,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#5C4A35',
    backgroundColor: '#ffffff',
  },
  addButton: {
    backgroundColor: '#7DB87A',
    width: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5C4A35',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickAddGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
    backgroundColor: '#ffffff',
  },
  quickChipActive: {
    backgroundColor: '#D6EDD4',
    borderColor: '#7DB87A',
  },
  quickChipText: {
    fontSize: 14,
    color: '#a09080',
    fontWeight: '500',
  },
  quickChipTextActive: {
    color: '#3D7A3A',
    fontWeight: '700',
  },
  chipsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  itemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#5C4A35',
  },
  itemChipText: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '600',
  },
  staplesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
  },
  staplesText: {
    flex: 1,
    gap: 2,
  },
  staplesLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#5C4A35',
  },
  staplesHint: {
    fontSize: 12,
    color: '#a09080',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#7DB87A',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
