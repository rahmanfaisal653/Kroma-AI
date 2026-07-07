import { useEffect, useState } from 'react';
import type { ApiModel } from '../types/api';

export function useInternalModels(apiKey: string) {
  const [models, setModels] = useState<ApiModel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!apiKey) { setLoading(false); return; }
    fetch('/v1/providers')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(data => {
        const modelIds = (data.data || []).flatMap((p: any) => p.models || []);
        setModels(modelIds.map((id: string) => ({
          id,
          name: id,
          type: 'text-to-text',
          description: id.split('/')[0],
          endpoint: '/v1/chat/completions',
          price_per_token: 0,
          price_input: 0,
          price_output: 0,
          features: [],
          versions: [],
          active: true,
          model_slug: id,
          is_streaming: true,
          max_tokens: 4096,
        })));
      })
      .finally(() => setLoading(false));
  }, [apiKey]);

  return { models, loading };
}
