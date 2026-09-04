import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import VOCAB from '../constants/ingredientVocab.json';

const NAMES: string[] = VOCAB as string[];
const NAME_SET = new Set(NAMES);

const MAX_SUGGESTIONS = 8;

/**
 * Ingredient picker backed by the recipe-database vocabulary — the mobile
 * counterpart of the web IngredientAutocomplete.
 *
 * The pantry matcher scores a user's items against ingredient names taken from
 * the recipe library, so a typo or a name the library has never seen ("chix",
 * "capsicums") silently matches nothing and quietly costs the user a premium
 * Claude call. Restricting entry to the vocabulary is what stops that, so
 * unlike the web version this one has no free-text escape hatch: `onAdd` only
 * ever fires with a name that exists in the library.
 */
export default function IngredientAutocomplete({
  onAdd,
  existing = [],
  placeholder = 'Start typing an ingredient…',
}: {
  onAdd: (name: string) => void;
  existing?: string[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');

  const existingSet = useMemo(
    () => new Set(existing.map((e) => String(e).toLowerCase())),
    [existing]
  );

  // Prefix matches first, then contains — "chick" should lead with "chicken",
  // not "chickpea flour", and typing "pepper" should still reach "red pepper".
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const name of NAMES) {
      if (existingSet.has(name)) continue;
      const idx = name.indexOf(q);
      if (idx === 0) starts.push(name);
      else if (idx > 0) contains.push(name);
      if (starts.length >= MAX_SUGGESTIONS) break;
    }
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [query, existingSet]);

  const trimmed = query.trim().toLowerCase();
  // Nothing to offer and nothing to add — say so rather than leaving the user
  // tapping a key that does nothing.
  const noMatch = trimmed.length > 0 && suggestions.length === 0 && !existingSet.has(trimmed);

  function choose(name: string) {
    if (!NAME_SET.has(name) || existingSet.has(name)) return;
    onAdd(name);
    setQuery('');
  }

  return (
    <View>
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color="#9A8E7E" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor="#9A8E7E"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          // Enter takes the top suggestion; there is no free-text fallback.
          onSubmitEditing={() => suggestions[0] && choose(suggestions[0])}
        />
        {query.length > 0 && (
          <TouchableOpacity
            onPress={() => setQuery('')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close-circle" size={18} color="#9A8E7E" />
          </TouchableOpacity>
        )}
      </View>

      {suggestions.length > 0 && (
        <View style={styles.dropdown}>
          {suggestions.map((name, i) => (
            <TouchableOpacity
              key={name}
              style={[styles.option, i > 0 && styles.optionDivider]}
              onPress={() => choose(name)}
              activeOpacity={0.7}
            >
              <Text style={styles.optionText}>{name}</Text>
              <Ionicons name="add" size={16} color="#36453B" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {noMatch && (
        <View style={styles.dropdown}>
          <Text style={styles.noMatchText}>
            No ingredient called “{query.trim()}”. Try a simpler name — we match
            against the ingredients used in our recipes.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#E2D8C6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    backgroundColor: '#ffffff',
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 15,
    color: '#2A241F',
  },
  dropdown: {
    marginTop: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#E2D8C6',
    borderRadius: 12,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionDivider: {
    borderTopWidth: 1,
    borderTopColor: '#F0E9DC',
  },
  optionText: {
    fontSize: 15,
    color: '#2A241F',
    fontFamily: 'Inter_500Medium',
    textTransform: 'capitalize',
  },
  noMatchText: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    lineHeight: 19,
    color: '#6B5F52',
  },
});
