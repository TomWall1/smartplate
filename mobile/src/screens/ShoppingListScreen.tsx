import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SectionList,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePremium } from '../context/PremiumContext';
import { useShoppingList, useUpdateShoppingItems } from '../api/hooks';
import PremiumGate from '../components/PremiumGate';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { ShoppingListItem } from '../types';
import { decodeEntities } from '../lib/displayText';
import { colors, type, spacing, radius, shadow } from '../theme';

/**
 * The shopping list — one list per account, not a list manager.
 *
 * The job is "what do I buy this week", so there is exactly one list and it is
 * created on first open. Items are grouped by the recipe that put them there,
 * because that is how you decide what to drop when the basket gets expensive.
 *
 * The server stores items as a single JSON column, so every change writes the
 * whole array. Ticking a box therefore updates optimistically — waiting on a
 * round trip to strike out a line makes the list feel broken in a supermarket
 * aisle on bad reception.
 */

const MANUAL_SECTION = 'Added by you';

export default function ShoppingListScreen() {
  const { isPremium } = usePremium();
  const { data: list, isLoading, isError, refetch } = useShoppingList(isPremium);
  const updateItems = useUpdateShoppingItems();

  const [newItem, setNewItem] = useState('');
  // Local echo of the server array so ticks land instantly.
  const [pending, setPending] = useState<ShoppingListItem[] | null>(null);

  const items = pending ?? list?.items ?? [];

  const write = useCallback((next: ShoppingListItem[]) => {
    if (!list) return;
    setPending(next);
    updateItems.mutate(
      { id: list.id, items: next },
      {
        onSuccess: () => setPending(null),
        onError: () => {
          setPending(null);
          Alert.alert('Could not save', 'Your list may be out of date. Pull down to refresh.');
        },
      }
    );
  }, [list, updateItems]);

  const toggle = useCallback((target: ShoppingListItem) => {
    write(items.map((i) =>
      i.name === target.name && i.recipeId === target.recipeId
        ? { ...i, checked: !i.checked }
        : i
    ));
  }, [items, write]);

  const remove = useCallback((target: ShoppingListItem) => {
    write(items.filter((i) => !(i.name === target.name && i.recipeId === target.recipeId)));
  }, [items, write]);

  const addManual = useCallback(() => {
    const name = newItem.trim();
    if (!name) return;
    if (items.some((i) => i.name.toLowerCase() === name.toLowerCase())) {
      setNewItem('');
      return;
    }
    write([...items, { name, checked: false }]);
    setNewItem('');
  }, [newItem, items, write]);

  const clearChecked = useCallback(() => {
    const remaining = items.filter((i) => !i.checked);
    if (remaining.length === items.length) return;
    Alert.alert('Clear ticked items', `Remove ${items.length - remaining.length} ticked item(s)?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => write(remaining) },
    ]);
  }, [items, write]);

  // Group by the recipe an item came from; manual additions collect at the end.
  const sections = useMemo(() => {
    const groups = new Map<string, ShoppingListItem[]>();
    for (const item of items) {
      const key = item.recipeTitle ? decodeEntities(item.recipeTitle) : MANUAL_SECTION;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    const entries = [...groups.entries()].map(([title, data]) => ({ title, data }));
    entries.sort((a, b) => {
      if (a.title === MANUAL_SECTION) return 1;
      if (b.title === MANUAL_SECTION) return -1;
      return a.title.localeCompare(b.title);
    });
    return entries;
  }, [items]);

  if (!isPremium) return <PremiumGate feature="The shopping list" />;
  if (isLoading) return <LoadingState message="Loading your list…" />;
  if (isError || !list) {
    return <ErrorState message="Could not load your shopping list." onRetry={() => refetch()} />;
  }

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.container}>
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.recipeId ?? 'manual'}-${item.name}-${index}`}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <TouchableOpacity
                style={styles.rowMain}
                onPress={() => toggle(item)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={item.checked ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={item.checked ? colors.brand : colors.inkFaint}
                />
                <Text style={[styles.itemText, item.checked && styles.itemChecked]}>
                  {decodeEntities(item.name)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => remove(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={17} color={colors.inkFaint} />
              </TouchableOpacity>
            </View>
          )}
          ListHeaderComponent={
            items.length > 0 ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryText}>
                  {checkedCount} of {items.length} ticked
                </Text>
                {checkedCount > 0 && (
                  <TouchableOpacity onPress={clearChecked}>
                    <Text style={styles.clearLink}>Clear ticked</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cart-outline" size={48} color={colors.border} />
              <Text style={styles.emptyTitle}>Your list is empty</Text>
              <Text style={styles.emptyText}>
                Open a recipe and tap "Add to shopping list", or type something below.
              </Text>
            </View>
          }
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
        />

        <View style={styles.addBar}>
          <TextInput
            style={styles.addInput}
            value={newItem}
            onChangeText={setNewItem}
            placeholder="Add an item…"
            placeholderTextColor={colors.inkFaint}
            returnKeyType="done"
            onSubmitEditing={addManual}
          />
          <TouchableOpacity style={styles.addButton} onPress={addManual} activeOpacity={0.85}>
            <Ionicons name="add" size={22} color={colors.onBrand} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  summaryText: { ...type.caption, color: colors.inkSecondary },
  clearLink: { ...type.label, color: colors.brand },

  sectionHeader: {
    ...type.label,
    color: colors.inkSecondary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.sm,
    gap: spacing.sm,
    ...shadow.card,
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  itemText: { ...type.body, color: colors.ink, flex: 1 },
  itemChecked: { color: colors.inkFaint, textDecorationLine: 'line-through' },

  addBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addInput: {
    ...type.body,
    color: colors.ink,
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.tag,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  addButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.tag,
    width: 46,
    justifyContent: 'center',
    alignItems: 'center',
  },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
  emptyTitle: { ...type.title, color: colors.ink },
  emptyText: { ...type.body, color: colors.inkSecondary, textAlign: 'center' },
});
