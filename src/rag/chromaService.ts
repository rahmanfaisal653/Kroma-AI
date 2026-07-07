import { ChromaClient } from 'chromadb';
import { toUpstreamServiceError } from './upstreamError.js';

let client: ChromaClient | null = null;
const collectionPromises = new Map<string, Promise<any>>();

type RawChromaCollection = {
  id: string;
  name: string;
};
const rawCollectionIds = new Map<string, string>();

const getClient = (chromaBaseUrl: string) => {
  if (!client) {
    const parsed = new URL(chromaBaseUrl);
    client = new ChromaClient({
      host: parsed.hostname,
      port: Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)),
      ssl: parsed.protocol === 'https:'
    });
  }
  return client;
};

export const getKnowledgeCollection = async (chromaBaseUrl: string) => {
  const collectionName = String(process.env.CHROMADB_COLLECTION_NAME || '').trim();
  if (!collectionName) throw new Error('CHROMADB_COLLECTION_NAME must be configured');
  const cacheKey = `${chromaBaseUrl}::${collectionName}`;
  if (!collectionPromises.has(cacheKey)) {
    collectionPromises.set(cacheKey, getClient(chromaBaseUrl).getOrCreateCollection({ name: collectionName }));
  }
  return collectionPromises.get(cacheKey) as Promise<any>;
};

export const addKnowledgeDocs = async (
  chromaBaseUrl: string,
  payload: { ids: string[]; documents: string[]; metadatas: Record<string, any>[]; embeddings: number[][]; }
) => {
  const collection = await getKnowledgeCollection(chromaBaseUrl);
  await collection.add(payload);
};

export const upsertKnowledgeDocs = async (
  chromaBaseUrl: string,
  payload: { ids: string[]; documents: string[]; metadatas: Record<string, any>[]; embeddings: number[][]; }
) => {
  const collection = await getKnowledgeCollection(chromaBaseUrl);
  await collection.upsert(payload);
};

export const queryKnowledgeDocs = async (
  chromaBaseUrl: string,
  queryEmbedding: number[],
  topK = 3
) => {
  const collection = await getKnowledgeCollection(chromaBaseUrl);
  return collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK
  });
};

const getRawCollection = async (chromaBaseUrl: string): Promise<RawChromaCollection> => {
  const collectionName = String(process.env.CHROMADB_COLLECTION_NAME || '').trim();
  if (!collectionName) throw new Error('CHROMADB_COLLECTION_NAME must be configured');
  const cacheKey = `${chromaBaseUrl}::${collectionName}`;
  const cachedCollectionId = rawCollectionIds.get(cacheKey);
  if (cachedCollectionId) return { id: cachedCollectionId, name: collectionName };
  const base = chromaBaseUrl.replace(/\/+$/, '');
  const createRes = await fetch(`${base}/api/v2/tenants/default_tenant/databases/default_database/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: collectionName })
  }).catch((e: any) => {
    throw toUpstreamServiceError('CHROMADB', e);
  });
  if (createRes.ok) {
    const payload: any = await createRes.json();
    rawCollectionIds.set(cacheKey, payload?.id);
    return { id: payload?.id as string, name: collectionName };
  }
  if (createRes.status === 409) {
    const listRes = await fetch(`${base}/api/v2/tenants/default_tenant/databases/default_database/collections`, {
      headers: { 'Content-Type': 'application/json' }
    }).catch((e: any) => {
      throw toUpstreamServiceError('CHROMADB', e);
    });
    const listPayload: any = await listRes.json();
    const row = (Array.isArray(listPayload) ? listPayload : []).find((c: any) => c?.name === collectionName);
    if (!row?.id) throw new Error('Chroma collection exists but cannot resolve id');
    rawCollectionIds.set(cacheKey, row.id);
    return { id: row.id, name: collectionName };
  }
  const detail: any = await createRes.json().catch(() => ({}));
  throw new Error(detail?.message || 'Failed to create/get Chroma collection');
};

export const upsertKnowledgeDocsRaw = async (
  chromaBaseUrl: string,
  payload: { ids: string[]; documents: string[]; metadatas: Record<string, any>[]; embeddings: number[][]; }
) => {
  const base = chromaBaseUrl.replace(/\/+$/, '');
  const collection = await getRawCollection(chromaBaseUrl);
  const response = await fetch(`${base}/api/v2/tenants/default_tenant/databases/default_database/collections/${collection.id}/upsert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ids: payload.ids,
      documents: payload.documents,
      metadatas: payload.metadatas,
      embeddings: payload.embeddings
    })
  }).catch((e: any) => {
    throw toUpstreamServiceError('CHROMADB', e);
  });
  if (!response.ok) {
    const detail: any = await response.json().catch(() => ({}));
    throw new Error(detail?.message || `Chroma upsert failed (${response.status})`);
  }
};

export const queryKnowledgeDocsRaw = async (
  chromaBaseUrl: string,
  queryEmbedding: number[],
  topK = 3
) => {
  const base = chromaBaseUrl.replace(/\/+$/, '');
  const collection = await getRawCollection(chromaBaseUrl);
  const response = await fetch(`${base}/api/v2/tenants/default_tenant/databases/default_database/collections/${collection.id}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query_embeddings: [queryEmbedding],
      n_results: topK,
      include: ['documents', 'metadatas', 'distances']
    })
  }).catch((e: any) => {
    throw toUpstreamServiceError('CHROMADB', e);
  });
  if (!response.ok) {
    const detail: any = await response.json().catch(() => ({}));
    throw new Error(detail?.message || `Chroma query failed (${response.status})`);
  }
  const payload: any = await response.json();
  return {
    documents: payload?.documents || [],
    metadatas: payload?.metadatas || [],
    distances: payload?.distances || []
  };
};

export const deleteKnowledgeBySourceRaw = async (
  chromaBaseUrl: string,
  sourceUrl: string
) => {
  const base = chromaBaseUrl.replace(/\/+$/, '');
  const collection = await getRawCollection(chromaBaseUrl);
  const response = await fetch(`${base}/api/v2/tenants/default_tenant/databases/default_database/collections/${collection.id}/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      where: { source_url: sourceUrl }
    })
  }).catch((e: any) => {
    throw toUpstreamServiceError('CHROMADB', e);
  });
  if (!response.ok) {
    const detail: any = await response.json().catch(() => ({}));
    throw new Error(detail?.message || `Chroma delete failed (${response.status})`);
  }
};

export const getKnowledgeDocsBySourceRaw = async (
  chromaBaseUrl: string,
  sourceUrl: string,
  limit = 3
) => {
  const base = chromaBaseUrl.replace(/\/+$/, '');
  const collection = await getRawCollection(chromaBaseUrl);
  const response = await fetch(`${base}/api/v2/tenants/default_tenant/databases/default_database/collections/${collection.id}/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      where: { source_url: sourceUrl },
      include: ['documents', 'metadatas'],
      limit
    })
  }).catch((e: any) => {
    throw toUpstreamServiceError('CHROMADB', e);
  });
  if (!response.ok) {
    const detail: any = await response.json().catch(() => ({}));
    throw new Error(detail?.message || `Chroma get failed (${response.status})`);
  }
  const payload: any = await response.json();
  return {
    documents: Array.isArray(payload?.documents) ? payload.documents : [],
    metadatas: Array.isArray(payload?.metadatas) ? payload.metadatas : []
  };
};
