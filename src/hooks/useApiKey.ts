import { useState, useCallback } from 'react';
import { userApi } from '../services/api';
import { useAuthStore } from '../stores/auth.store';

interface UseApiKeyReturn {
  fullKey: string | null;
  maskedKey: string;
  loading: boolean;
  error: string | null;
  revealKey: () => Promise<void>;
  generateKey: () => Promise<string>;
  revokeKey: () => Promise<void>;
}

export function useApiKey(): UseApiKeyReturn {
  const user = useAuthStore(s => s.user);
  const [fullKey, setFullKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maskedKey = user?.user_key || '';

  const revealKey = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await userApi.revealKey(user.id);
      setFullKey(data.user_key);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reveal key');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const generateKey = useCallback(async (): Promise<string> => {
    if (!user?.id) throw new Error('Not authenticated');
    setLoading(true);
    setError(null);
    try {
      const data = await userApi.generateKey(user.id);
      setFullKey(data.api_key);
      useAuthStore.getState().updateUser({ user_key: data.user_key_preview });
      return data.api_key;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate key');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const revokeKey = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await userApi.revokeKey();
      setFullKey(null);
      useAuthStore.getState().updateUser({ user_key: '' });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to revoke key');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { fullKey, maskedKey, loading, error, revealKey, generateKey, revokeKey };
}
