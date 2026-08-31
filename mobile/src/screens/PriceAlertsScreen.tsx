import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePremium } from '../context/PremiumContext';
import { useStore } from '../context/StoreContext';
import { usePriceAlerts, useCreatePriceAlert, useDeletePriceAlert } from '../api/hooks';
import PremiumGate from '../components/PremiumGate';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';
import { PriceAlert } from '../types';
import { colors, fonts, type, spacing, radius, shadow, storeColors } from '../theme';

/**
 * Price alerts — "tell me when this drops".
 *
 * There are no push notifications yet, so an alert is checked against the
 * current week's catalogue and reported here. The copy says exactly that
 * rather than implying a notification will arrive; promising a push that never
 * comes is worse than not offering one.
 */

function AlertRow({ alert, onDelete }: { alert: PriceAlert; onDelete: () => void }) {
  const met = alert.status?.met ?? false;
  const store = alert.store ? storeColors[alert.store.toLowerCase()] : null;

  return (
    <View style={[styles.card, met && styles.cardMet]}>
      <View style={styles.cardMain}>
        <View style={styles.cardHeader}>
          <Text style={styles.productName} numberOfLines={1}>{alert.product_name}</Text>
          <TouchableOpacity
            onPress={onDelete}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={18} color={colors.inkFaint} />
          </TouchableOpacity>
        </View>

        <Text style={styles.target}>
          Watching for {formatMoney(alert.target_price)} or less
          {store ? ` at ${store.name}` : ''}
        </Text>

        {alert.status ? (
          met ? (
            <View style={styles.metRow}>
              <Ionicons name="pricetag" size={14} color={colors.accent} />
              <Text style={styles.metText}>
                {formatMoney(alert.status.currentPrice)} now at {storeLabel(alert.status.store)} — that is your price.
              </Text>
            </View>
          ) : (
            <Text style={styles.statusText}>
              Cheapest this week is {formatMoney(alert.status.currentPrice)} at{' '}
              {storeLabel(alert.status.store)}.
            </Text>
          )
        ) : (
          <Text style={styles.statusText}>Not in this week's catalogue.</Text>
        )}
      </View>
    </View>
  );
}

function formatMoney(value: number): string {
  return `$${Number(value).toFixed(2)}`;
}

function storeLabel(store?: string): string {
  if (!store) return 'your store';
  return storeColors[store.toLowerCase()]?.name ?? store;
}

export default function PriceAlertsScreen() {
  const { isPremium } = usePremium();
  const { selectedStore } = useStore();

  const { data: alerts = [], isLoading, isError, isFetching, refetch } = usePriceAlerts(isPremium);
  const createAlert = useCreatePriceAlert();
  const deleteAlert = useDeletePriceAlert();

  const [productName, setProductName] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [thisStoreOnly, setThisStoreOnly] = useState(false);

  const handleCreate = useCallback(() => {
    const name = productName.trim();
    const price = parseFloat(targetPrice.replace(/[^0-9.]/g, ''));

    if (!name) {
      Alert.alert('What are you watching?', 'Name the product you want an alert for.');
      return;
    }
    if (!isFinite(price) || price <= 0) {
      Alert.alert('Set a target price', 'Enter the price you would be happy to pay.');
      return;
    }

    createAlert.mutate(
      { productName: name, targetPrice: price, store: thisStoreOnly ? selectedStore : null },
      {
        onSuccess: () => { setProductName(''); setTargetPrice(''); },
        onError: () => Alert.alert('Could not add alert', 'Please try again.'),
      }
    );
  }, [productName, targetPrice, thisStoreOnly, selectedStore, createAlert]);

  const handleDelete = useCallback((alert: PriceAlert) => {
    Alert.alert('Remove alert', `Stop watching ${alert.product_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => deleteAlert.mutate(alert.id),
      },
    ]);
  }, [deleteAlert]);

  if (!isPremium) return <PremiumGate feature="Price alerts" />;
  if (isLoading) return <LoadingState message="Loading your alerts…" />;
  if (isError) return <ErrorState message="Could not load your price alerts." onRetry={() => refetch()} />;

  const metCount = alerts.filter((a) => a.status?.met).length;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        style={styles.container}
        data={alerts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <AlertRow alert={item} onDelete={() => handleDelete(item)} />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.intro}>
              Name something you buy often and the price you want to pay. We check it
              against each week's catalogue and show it here when it lands.
            </Text>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                value={productName}
                onChangeText={setProductName}
                placeholder="e.g. lamb shoulder"
                placeholderTextColor={colors.inkFaint}
                returnKeyType="next"
              />
              <View style={styles.formRow}>
                <View style={styles.priceInputWrap}>
                  <Text style={styles.dollar}>$</Text>
                  <TextInput
                    style={styles.priceInput}
                    value={targetPrice}
                    onChangeText={setTargetPrice}
                    placeholder="9.00"
                    placeholderTextColor={colors.inkFaint}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleCreate}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.addButton, createAlert.isPending && styles.buttonDisabled]}
                  onPress={handleCreate}
                  disabled={createAlert.isPending}
                  activeOpacity={0.85}
                >
                  {createAlert.isPending
                    ? <ActivityIndicator color={colors.onBrand} size="small" />
                    : <Text style={styles.addButtonText}>Watch it</Text>}
                </TouchableOpacity>
              </View>

              {selectedStore && (
                <TouchableOpacity
                  style={styles.storeToggle}
                  onPress={() => setThisStoreOnly((v) => !v)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={thisStoreOnly ? 'checkbox' : 'square-outline'}
                    size={18}
                    color={thisStoreOnly ? colors.brand : colors.inkFaint}
                  />
                  <Text style={styles.storeToggleText}>
                    Only at {storeLabel(selectedStore)}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {metCount > 0 && (
              <View style={styles.metBanner}>
                <Ionicons name="pricetag" size={16} color={colors.accent} />
                <Text style={styles.metBannerText}>
                  {metCount === 1 ? 'One thing you watch is' : `${metCount} things you watch are`} at your price this week.
                </Text>
              </View>
            )}

            {alerts.length > 0 && <Text style={styles.sectionTitle}>Watching</Text>}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="notifications-outline" size={48} color={colors.border} />
            <Text style={styles.emptyTitle}>Nothing on watch yet</Text>
            <Text style={styles.emptyText}>
              Add the things you buy most. We will tell you the week they go on special.
            </Text>
          </View>
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },

  header: { gap: spacing.lg, marginBottom: spacing.xs },
  intro: { ...type.body, color: colors.inkSecondary },

  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.sheet,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  input: {
    ...type.body,
    color: colors.ink,
    backgroundColor: colors.bg,
    borderRadius: radius.tag,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  priceInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.tag,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  dollar: { ...type.body, color: colors.inkSecondary },
  priceInput: { ...type.body, color: colors.ink, flex: 1, paddingVertical: 11, paddingLeft: 2 },
  addButton: {
    backgroundColor: colors.brand,
    borderRadius: radius.tag,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 104,
  },
  addButtonText: { ...type.bodyMed, color: colors.onBrand },
  buttonDisabled: { opacity: 0.6 },

  storeToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  storeToggleText: { ...type.label, color: colors.inkSecondary },

  metBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentTint,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  metBannerText: { ...type.label, color: colors.ink, flex: 1 },

  sectionTitle: { ...type.heading, color: colors.ink },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  cardMet: { borderColor: colors.accent },
  cardMain: { gap: spacing.xs },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  productName: { ...type.bodyMed, color: colors.ink, flex: 1 },
  target: { ...type.caption, color: colors.inkSecondary },
  statusText: { ...type.caption, color: colors.inkFaint, marginTop: spacing.xs },
  metRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  metText: { ...type.label, color: colors.accent, flex: 1 },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxxl },
  emptyTitle: { ...type.title, color: colors.ink },
  emptyText: { ...type.body, color: colors.inkSecondary, textAlign: 'center' },
});
