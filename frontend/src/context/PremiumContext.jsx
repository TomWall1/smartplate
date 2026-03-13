import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { premiumApi } from '../services/api';

const PremiumContext = createContext(null);

export function usePremium() {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremium must be used within PremiumProvider');
  return ctx;
}

export function PremiumProvider({ children }) {
  const { user } = useAuth();
  const [isPremium, setIsPremium]           = useState(false);
  const [premiumSince, setPremiumSince]     = useState(null);
  const [premiumLoading, setPremiumLoading] = useState(true);

  const refreshPremium = async () => {
    if (!user) {
      setIsPremium(false);
      setPremiumSince(null);
      setPremiumLoading(false);
      return;
    }
    try {
      const data = await premiumApi.getStatus();
      setIsPremium(data.isPremium ?? false);
      setPremiumSince(data.premiumSince ?? null);
    } catch {
      setIsPremium(false);
    } finally {
      setPremiumLoading(false);
    }
  };

  useEffect(() => {
    setPremiumLoading(true);
    refreshPremium();
  }, [user]);

  return (
    <PremiumContext.Provider value={{ isPremium, premiumSince, premiumLoading, refreshPremium }}>
      {children}
    </PremiumContext.Provider>
  );
}
