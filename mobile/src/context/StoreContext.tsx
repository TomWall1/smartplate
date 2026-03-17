import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'smartplate-store';
const STATE_KEY = 'smartplate-state';

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
          SecureStore.getItemAsync(STORE_KEY),
          SecureStore.getItemAsync(STATE_KEY),
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
    await SecureStore.setItemAsync(STORE_KEY, store);
    setStoreState(store);
  }, []);

  const setSelectedState = useCallback(async (state: string) => {
    await SecureStore.setItemAsync(STATE_KEY, state);
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
