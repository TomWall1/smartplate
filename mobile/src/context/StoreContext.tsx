import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// Non-secret UI prefs belong in AsyncStorage; SecureStore is reserved for the
// auth token. Old builds stored these in SecureStore — migrate once on read.
const STORE_KEY = 'deals-to-dish-store';
const STATE_KEY = 'deals-to-dish-state';
const LEGACY_STORE = 'smartplate-store';
const LEGACY_STATE = 'smartplate-state';

async function loadPref(key: string, legacyKey: string): Promise<string | null> {
  const current = await AsyncStorage.getItem(key);
  if (current != null) return current;
  try {
    const legacy = await SecureStore.getItemAsync(legacyKey);
    if (legacy != null) {
      await AsyncStorage.setItem(key, legacy);
      await SecureStore.deleteItemAsync(legacyKey);
      return legacy;
    }
  } catch {
    // SecureStore may be unavailable; ignore — just means no legacy value
  }
  return null;
}

interface StoreContextValue {
  selectedStore: string | null;
  selectedState: string | null;
  storeLoading: boolean;
  setSelectedStore: (store: string) => Promise<void>;
  setSelectedState: (state: string) => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [selectedStore, setStoreState] = useState<string | null>(null);
  const [selectedState, setStateState] = useState<string | null>(null);
  const [storeLoading, setStoreLoading] = useState(true);

  useEffect(() => {
    async function restore() {
      try {
        const [store, state] = await Promise.all([
          loadPref(STORE_KEY, LEGACY_STORE),
          loadPref(STATE_KEY, LEGACY_STATE),
        ]);
        if (store) setStoreState(store);
        if (state) setStateState(state);
      } finally {
        setStoreLoading(false);
      }
    }
    restore();
  }, []);

  const setSelectedStore = useCallback(async (store: string) => {
    await AsyncStorage.setItem(STORE_KEY, store);
    setStoreState(store);
  }, []);

  const setSelectedState = useCallback(async (state: string) => {
    await AsyncStorage.setItem(STATE_KEY, state);
    setStateState(state);
  }, []);

  return (
    <StoreContext.Provider value={{ selectedStore, selectedState, storeLoading, setSelectedStore, setSelectedState }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
