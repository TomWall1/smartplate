/**
 * The recipe list's one control row: sort, protein, features.
 *
 * Replaces two stacked rows of horizontally-scrolling chips, which cost most
 * of the screen above the fold and still hid most of their own options
 * off-screen. Three pills open bottom sheets instead.
 *
 * Two deliberate distinctions in here:
 *
 * - Sort is not a filter. It reorders; the other two remove. So the sort pill
 *   leads, carries an order icon, and never shows a count badge — it is always
 *   "on" in the sense that the list always has an order.
 * - Options carry result counts and go dead at zero. Two multiplying facets
 *   over a 50-recipe week hit empty lists fast, and an option that leads
 *   nowhere is worse than an option that is not offered.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecipeSortKey } from '../types';
import { SORT_OPTIONS, PROTEIN_FILTERS, FEATURE_FILTERS } from '../lib/recipeFilters';
import { colors, fonts, radius, spacing } from '../theme';

interface Option {
  id: string;
  label: string;
  hint?: string;
  count?: number;
}

interface Props {
  sort: RecipeSortKey;
  onSortChange: (sort: RecipeSortKey) => void;
  /** Pantry sorting is only offered once there is a pantry to sort by. */
  pantryAvailable: boolean;

  proteins: string[];
  onProteinsChange: (ids: string[]) => void;
  proteinCounts: Record<string, number>;

  features: string[];
  onFeaturesChange: (ids: string[]) => void;
  featureCounts: Record<string, number>;
}

type OpenSheet = null | 'sort' | 'protein' | 'feature';

export default function RecipeFilterBar({
  sort,
  onSortChange,
  pantryAvailable,
  proteins,
  onProteinsChange,
  proteinCounts,
  features,
  onFeaturesChange,
  featureCounts,
}: Props) {
  const [open, setOpen] = useState<OpenSheet>(null);

  const sortOptions: Option[] = SORT_OPTIONS.filter(
    (o) => o.key !== 'pantry' || pantryAvailable
  ).map((o) => ({ id: o.key, label: o.label, hint: o.hint }));

  // Only offer what this week's recipes can actually answer. A protein nobody
  // has a special on, or a tag no source used, is noise.
  const proteinOptions: Option[] = PROTEIN_FILTERS.filter(
    (p) => (proteinCounts[p.id] ?? 0) > 0 || proteins.includes(p.id)
  ).map((p) => ({ id: p.id, label: p.label, count: proteinCounts[p.id] ?? 0 }));

  const featureOptions: Option[] = FEATURE_FILTERS.filter(
    (f) => (featureCounts[f.id] ?? 0) > 0 || features.includes(f.id)
  ).map((f) => ({ id: f.id, label: f.label, count: featureCounts[f.id] ?? 0 }));

  const sortLabel = SORT_OPTIONS.find((o) => o.key === sort)?.label ?? 'Recommended';

  const tap = (next: OpenSheet) => {
    Haptics.selectionAsync().catch(() => {});
    setOpen(next);
  };

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  return (
    <View style={styles.bar}>
      <Pill
        label={sortLabel}
        icon="swap-vertical-outline"
        active={sort !== 'recommended'}
        onPress={() => tap('sort')}
      />
      <Pill
        label="Protein"
        count={proteins.length}
        active={proteins.length > 0}
        onPress={() => tap('protein')}
        disabled={proteinOptions.length === 0}
      />
      <Pill
        label="Features"
        count={features.length}
        active={features.length > 0}
        onPress={() => tap('feature')}
        disabled={featureOptions.length === 0}
      />

      <FilterSheet
        visible={open === 'sort'}
        title="Order by"
        options={sortOptions}
        selected={[sort]}
        multi={false}
        onSelect={(id) => {
          onSortChange(id as RecipeSortKey);
          setOpen(null); // a single choice is its own confirmation
        }}
        onClose={() => setOpen(null)}
      />

      <FilterSheet
        visible={open === 'protein'}
        title="Protein on special"
        subtitle="Shows recipes with at least one of these on special this week."
        options={proteinOptions}
        selected={proteins}
        multi
        onSelect={(id) => onProteinsChange(toggle(proteins, id))}
        onClear={() => onProteinsChange([])}
        onClose={() => setOpen(null)}
      />

      <FilterSheet
        visible={open === 'feature'}
        title="Features"
        subtitle="Shows recipes that match all of these."
        options={featureOptions}
        selected={features}
        multi
        onSelect={(id) => onFeaturesChange(toggle(features, id))}
        onClear={() => onFeaturesChange([])}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

function Pill({
  label,
  icon,
  count,
  active,
  disabled,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  count?: number;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive, disabled && styles.pillDisabled]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count} selected` : label}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={active ? colors.onBrand : colors.inkSecondary}
          style={styles.pillIcon}
        />
      ) : null}
      <Text style={[styles.pillText, active && styles.pillTextActive]} numberOfLines={1}>
        {label}
        {count ? ` · ${count}` : ''}
      </Text>
      <Ionicons
        name="chevron-down"
        size={14}
        color={active ? colors.onBrand : colors.inkSecondary}
      />
    </TouchableOpacity>
  );
}

function FilterSheet({
  visible,
  title,
  subtitle,
  options,
  selected,
  multi,
  onSelect,
  onClear,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: Option[];
  selected: string[];
  multi: boolean;
  onSelect: (id: string) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop dismiss — the gesture people already expect from a sheet. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.grabber} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {multi && selected.length > 0 && onClear ? (
            <TouchableOpacity onPress={onClear}>
              <Text style={styles.clear}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}

        <ScrollView style={styles.optionScroll} bounces={false}>
          {options.map((opt) => {
            const isSelected = selected.includes(opt.id);
            // Zero results and not already chosen: leave it visible but dead,
            // so the list does not reshuffle under a moving thumb.
            const dead = opt.count === 0 && !isSelected;
            return (
              <TouchableOpacity
                key={opt.id}
                style={styles.option}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onSelect(opt.id);
                }}
                disabled={dead}
                activeOpacity={0.7}
                accessibilityRole={multi ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: isSelected, disabled: dead }}
              >
                <Ionicons
                  name={
                    multi
                      ? isSelected
                        ? 'checkbox'
                        : 'square-outline'
                      : isSelected
                        ? 'radio-button-on'
                        : 'radio-button-off'
                  }
                  size={20}
                  color={dead ? colors.inkFaint : isSelected ? colors.brand : colors.borderStrong}
                />
                <View style={styles.optionBody}>
                  <Text style={[styles.optionLabel, dead && styles.optionDead]}>{opt.label}</Text>
                  {opt.hint ? <Text style={styles.optionHint}>{opt.hint}</Text> : null}
                </View>
                {opt.count != null ? (
                  <Text style={[styles.optionCount, dead && styles.optionDead]}>{opt.count}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity style={styles.done} onPress={onClose} activeOpacity={0.9}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  pillDisabled: { opacity: 0.4 },
  pillIcon: { marginRight: 1 },
  pillText: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: fonts.uiMedium,
    color: colors.inkSecondary,
  },
  pillTextActive: { color: colors.onBrand },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(42,36,31,0.35)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: '72%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.sunken,
    marginBottom: spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { fontSize: 20, fontFamily: fonts.display, color: colors.ink },
  clear: { fontSize: 14, fontFamily: fonts.uiMedium, color: colors.brand },
  sheetSubtitle: {
    fontSize: 13,
    fontFamily: fonts.ui,
    color: colors.inkSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  optionScroll: { marginTop: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionBody: { flex: 1 },
  optionLabel: { fontSize: 15, fontFamily: fonts.ui, color: colors.ink },
  optionHint: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: colors.inkSecondary,
    marginTop: 1,
  },
  optionCount: { fontSize: 13, fontFamily: fonts.ui, color: colors.inkFaint },
  optionDead: { color: colors.inkFaint },
  done: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand,
    borderRadius: radius.tag,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneText: { fontSize: 15, fontFamily: fonts.uiMedium, color: colors.onBrand },
});
