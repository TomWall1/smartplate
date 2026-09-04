import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
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
import { PremiumStackParamList } from '../../navigation';
import { matchPantry } from '../../api/pantry';
import { usePantry, useSavePantry } from '../../api/hooks';
import IngredientAutocomplete from '../../components/IngredientAutocomplete';
import PremiumGate from '../../components/PremiumGate';
import { usePremium } from '../../context/PremiumContext';
import { useAuth } from '../../context/AuthContext';
import { useStore } from '../../context/StoreContext';

type Props = NativeStackScreenProps<PremiumStackParamList, 'PantryInput'>;

// Canonical vocabulary names (lowercase, singular — the form the recipe
// library uses). Displayed capitalised by the chip style. Keep every entry
// present in ingredientVocab.json or quick-add becomes a way to add an item
// the picker itself would reject.
const QUICK_ADD_ITEMS = [
  'chicken', 'rice', 'egg', 'pasta',
  'onion', 'garlic', 'tomato', 'cheese',
];

export default function PantryInputScreen({ navigation }: Props) {
  const { isPremium } = usePremium();
  const { user } = useAuth();
  const { selectedState, selectedStore } = useStore();
  const [items, setItems] = useState<string[]>([]);
  const [includeStaples, setIncludeStaples] = useState(false);
  const [loading, setLoading] = useState(false);

  // A pantry does not change much between visits, so the saved one is the
  // starting point. The save endpoint existed from the beginning but nothing
  // ever called it, which meant re-typing the cupboard on every use.
  const { data: savedPantry } = usePantry(isPremium);
  const [restored, setRestored] = useState(false);
  React.useEffect(() => {
    if (restored || !savedPantry) return;
    setRestored(true);
    if (savedPantry.ingredients?.length) setItems(savedPantry.ingredients);
    setIncludeStaples(savedPantry.has_pantry_staples !== false);
  }, [savedPantry, restored]);

  // The pantry saves itself as you edit it.
  //
  // It used to be written only as a side-effect of Find Recipes, so adding
  // an item and going back saved nothing at all — the screen showed the item
  // as added and the server never heard about it. Adding something to your
  // cupboard list is the whole action; it should not need a second button.
  //
  // `dirty` keeps the restore above from writing straight back what it just
  // read, and the delay collects a burst of chips into one request.
  const savePantryMutation = useSavePantry();
  const [dirty, setDirty] = useState(false);
  React.useEffect(() => {
    if (!dirty || !isPremium) return;
    const t = setTimeout(() => {
      savePantryMutation.mutate({ ingredients: items, hasPantryStaples: includeStaples });
      setDirty(false);
    }, 800);
    return () => clearTimeout(t);
    // savePantryMutation is stable enough for this; re-running on every
    // render would restart the timer forever and never save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, items, includeStaples, isPremium]);

  function addItem(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (items.some((i) => i.toLowerCase() === trimmed.toLowerCase())) return;
    setItems((prev) => [...prev, trimmed]);
    setDirty(true);
  }


  function removeItem(name: string) {
    setItems((prev) => prev.filter((i) => i !== name));
    setDirty(true);
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
      const state = user?.state || selectedState;
      const results = await matchPantry(items, includeStaples, state, selectedStore);
      // No save here any more — the pantry writes itself as it is edited.
      navigation.navigate('PantryResults', { results });
    } catch {
      Alert.alert('Error', 'Could not match recipes. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [items, includeStaples, navigation, user?.state, selectedState, selectedStore]);

  // Second line behind the premium hub — matching is a paid, Claude-backed
  // call, so a free user must not reach the form at all.
  if (!isPremium) return <PremiumGate feature="Pantry matching" />;

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

        {/* Ingredient picker — restricted to the recipe-database vocabulary.
            Free text used to be accepted here, but the matcher scores against
            library ingredient names, so anything it did not recognise matched
            nothing and still spent a premium call. */}
        <IngredientAutocomplete onAdd={addItem} existing={items} />

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
                  {isAdded && <Ionicons name="checkmark" size={13} color="#36453B" />}
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
                    <Ionicons name="close" size={14} color="#6B5F52" />
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
            onValueChange={(v) => { setIncludeStaples(v); setDirty(true); }}
            trackColor={{ false: '#E2D8C6', true: '#36453B' }}
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
  flex: { flex: 1, backgroundColor: '#F4EEE2' },
  scroll: { flex: 1 },
  container: {
    padding: 20,
    gap: 20,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    color: '#2A241F',
  },
  subheading: {
    fontSize: 14,
    color: '#6B5F52',
    lineHeight: 21,
    marginTop: -8,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: '#2A241F',
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
    borderColor: '#E2D8C6',
    backgroundColor: '#ffffff',
  },
  quickChipActive: {
    backgroundColor: '#DCE4D6',
    borderColor: '#36453B',
  },
  quickChipText: {
    fontSize: 14,
    color: '#6B5F52',
    fontFamily: 'Inter_500Medium',
    textTransform: 'capitalize',
  },
  quickChipTextActive: {
    color: '#36453B',
    fontFamily: 'Inter_700Bold',
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
    backgroundColor: '#2A241F',
  },
  itemChipText: {
    fontSize: 13,
    color: '#ffffff',
    fontFamily: 'Inter_600SemiBold',
    textTransform: 'capitalize',
  },
  staplesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2D8C6',
  },
  staplesText: {
    flex: 1,
    gap: 2,
  },
  staplesLabel: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#2A241F',
  },
  staplesHint: {
    fontSize: 12,
    color: '#6B5F52',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#36453B',
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
    fontFamily: 'Inter_700Bold',
  },
});
