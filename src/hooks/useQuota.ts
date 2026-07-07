import { useState, useEffect, useCallback } from 'react';
import type { UserQuota } from '../types/user';
import { userApi } from '../services/api';
import { useAuthStore } from '../stores/auth.store';

interface UseQuotaReturn {
  quota: UserQuota | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetches the authenticated user's quota via JWT.
 * The optional argument is kept for backward compatibility but ignored —
 * the endpoint always returns the JWT owner's quota.
 */
export function useQuota(_userKey?: string | null): UseQuotaReturn {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [quota, setQuota] = useState<UserQuota | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const data = await userApi.getQuota();
      setQuota({
        ...data,
        remaining: (data.quota || 0) - (data.usage || 0)
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch quota');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { refresh(); }, [refresh]);

  return { quota, loading, error, refresh };
}
