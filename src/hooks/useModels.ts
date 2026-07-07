import { useState, useEffect, useCallback } from 'react';
import type { ApiModel } from '../types/api';
import { modelsApi } from '../services/api';

interface UseModelsReturn {
  models: ApiModel[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getById: (id: string | number) => ApiModel | undefined;
  getByType: (type: string) => ApiModel[];
}

export function useModels(): UseModelsReturn {
  const [models, setModels] = useState<ApiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await modelsApi.getAll();
      setModels(data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch models');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const getById = useCallback(
    (id: string | number) => models.find(m => String(m.id) === String(id)),
    [models]
  );

  const getByType = useCallback(
    (type: string) => models.filter(m => m.type === type),
    [models]
  );

  return { models, loading, error, refresh, getById, getByType };
}
