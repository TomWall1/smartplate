import React, { createContext, useContext } from 'react';
import { useAuth } from './AuthContext';

interface PremiumContextValue {
  isPremium: boolean;
}

const PremiumContext = createContext<PremiumContextValue>({ isPremium: false });

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const isPremium = user?.is_premium ?? false;

  return (
    <PremiumContext.Provider value={{ isPremium }}>
      {children}
    </PremiumContext.Provider>
  );
}

export function usePremium(): PremiumContextValue {
  return useContext(PremiumContext);
}
