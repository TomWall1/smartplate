import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { getDealsByStore } from '../api/deals';
import { getRecipeSuggestions } from '../api/recipes';
import { Deal, Recipe } from '../types';
import RecipeCard from '../components/RecipeCard';
import LoadingState from '../components/LoadingState';
import ErrorState from '../components/ErrorState';

const STORE_CONFIG: Record<string, { name: string; color: string; lightColor: string }> = {
  woolworths: { name: 'Woolworths', color: '#00843D', lightColor: '#e8f5e9' },
  coles:      { name: 'Coles',      color: '#E31837', lightColor: '#ffeaed' },
  iga:        { name: 'IGA',        color: '#003DA5', lightColor: '#e8eeff' },
};

function DealItem({ deal }: { deal: Deal }) {
  const savings = deal.savings > 0;
  return (
    <View style={styles.dealCard}>
      <View style={styles.dealInfo}>
        <Text style={styles.dealName} numberOfLines={2}>{deal.dealName || deal.ingredient}</Text>
        {savings && (
          <View style={styles.savingsBadge}>
            <Text style={styles.savingsText}>Save ${deal.savings.toFixed(2)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.dealPrice}>${deal.price.toFixed(2)}</Text>
    </View>
  );
}

export default function StoreScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { selectedStore, selectedState } = useStore();

  const effectiveState = user?.state || selectedState;
  const store = selectedStore ?? 'woolworths';
  const storeConfig = STORE_CONFIG[store] ?? STORE_CONFIG['woolworths'];

  const [deals, setDeals] = useState<Deal[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [fetchedDeals, fetchedRecipes] = await Promise.all([
        getDealsByStore(store),
        effectiveState ? getRecipeSuggestions(effectiveState) : Promise.resolve([]),
      ]);
      setDeals(fetchedDeals);
      setRecipes(fetchedRecipes);
    } catch (err: any) {
      setError('Could not load deals. Please check your connection.');
    }
  }, [store, effectiveState]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  if (loading) return <LoadingState message={`Loading ${storeConfig.name} deals...`} />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }} />;

  // Show recipes that have at least one deal from this store, else show all
  const storeRecipes = recipes.filter((r) =>
    r.matchedDeals?.some((d) => d.store?.toLowerCase() === store)
  );
  const displayRecipes = storeRecipes.length > 0 ? storeRecipes : recipes;

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={storeConfig.color} colors={[storeConfig.color]} />
      }
    >
      {/* Store header */}
      <View style={[styles.storeHeader, { backgroundColor: storeConfig.color }]}>
        <View style={styles.storeHeaderContent}>
          <Text style={styles.storeHeaderName}>{storeConfig.name}</Text>
          <Text style={styles.storeHeaderSub}>This week's deals</Text>
        </View>
        <TouchableOpacity
          style={styles.changeStoreBtn}
          onPress={() => navigation.navigate('StoreSelection')}
        >
          <Text style={styles.changeStoreTxt}>Change</Text>
        </TouchableOpacity>
      </View>

      {/* Deals section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          🏷️ Deals this week
          <Text style={styles.sectionCount}> ({deals.length})</Text>
        </Text>

        {deals.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No deals loaded yet. Pull to refresh.</Text>
          </View>
        ) : (
          <FlatList
            data={deals.slice(0, 30)}
            keyExtractor={(item, index) => `${item.ingredient}-${index}`}
            renderItem={({ item }) => <DealItem deal={item} />}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>

      {/* Recipes section */}
      {effectiveState && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            🍳 Recipes using deals
            <Text style={styles.sectionCount}> ({displayRecipes.length})</Text>
          </Text>

          {displayRecipes.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No recipes found. Try refreshing.</Text>
            </View>
          ) : (
            displayRecipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onPress={() => navigation.navigate('StoreRecipeDetail', { id: recipe.id, title: recipe.title })}
              />
            ))
          )}
        </View>
      )}

      {!effectiveState && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.setStateCard}
            onPress={() => navigation.navigate('StateSelection')}
          >
            <Ionicons name="location-outline" size={24} color="#7DB87A" />
            <View style={styles.setStateText}>
              <Text style={styles.setStatePrimary}>Set your state</Text>
              <Text style={styles.setStateSecondary}>Get recipes matched to your area</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#a09080" />
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FDFAF5' },
  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingTop: 12,
  },
  storeHeaderContent: { flex: 1 },
  storeHeaderName: { fontSize: 22, fontWeight: '800', color: '#ffffff' },
  storeHeaderSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  changeStoreBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  changeStoreTxt: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#5C4A35', marginBottom: 12 },
  sectionCount: { fontSize: 14, fontWeight: '400', color: '#a09080' },
  dealCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
    gap: 12,
  },
  dealInfo: { flex: 1, gap: 4 },
  dealName: { fontSize: 14, fontWeight: '600', color: '#5C4A35', lineHeight: 20 },
  savingsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#D6EDD4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  savingsText: { fontSize: 11, fontWeight: '700', color: '#3D7A3A' },
  dealPrice: { fontSize: 17, fontWeight: '800', color: '#5C4A35' },
  separator: { height: 8 },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#e8e0d4',
  },
  emptyText: { fontSize: 14, color: '#a09080', textAlign: 'center' },
  setStateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#D6EDD4',
    gap: 14,
  },
  setStateText: { flex: 1 },
  setStatePrimary: { fontSize: 15, fontWeight: '700', color: '#5C4A35' },
  setStateSecondary: { fontSize: 13, color: '#a09080', marginTop: 2 },
});
