import { QueryClient } from '@tanstack/react-query';

/**
 * Shared React Query client. Deals/recipes change at most weekly, so we cache
 * aggressively and serve stale-while-revalidate instead of refetching on every
 * tab switch (the old per-screen useEffect refetched every mount).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,   // 10 min — data is weekly, no need to refetch often
      gcTime: 60 * 60 * 1000,      // keep cached an hour
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});
