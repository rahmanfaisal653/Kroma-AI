import axios from 'axios';
import { toUpstreamServiceError } from './upstreamError.js';

export const createOllamaEmbedding = async (
  ollamaBaseUrl: string,
  input: string,
  model: string
): Promise<number[]> => {
  if (!model || !model.trim()) {
    throw new Error('Embedding model is required (set OLLAMA_EMBED_MODEL)');
  }
  const endpoint = `${ollamaBaseUrl.replace(/\/+$/, '')}/api/embeddings`;

  // Support API key auth for Ollama behind reverse proxy (e.g., Cloudflare tunnel)
  const ollamaApiKey = String(process.env.OLLAMA_API_KEY || '').trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ollamaApiKey) {
    headers['x-api-key'] = ollamaApiKey;
  }

  let response: any;
  try {
    response = await axios.post(endpoint, {
      model,
      prompt: input
    }, {
      timeout: 30000,
      headers
    });
  } catch (error: any) {
    throw toUpstreamServiceError('OLLAMA', error);
  }

  const embedding = response.data?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('Invalid embedding response from Ollama');
  }
  return embedding as number[];
};

export const generateWithOllama = async (
  ollamaBaseUrl: string,
  messages: Array<{ role: string; content: string }>,
  model: string
): Promise<string> => {
  if (!model || !model.trim()) {
    throw new Error('Chat model is required (set OLLAMA_CHAT_MODEL or send model in request)');
  }
  const endpoint = `${ollamaBaseUrl.replace(/\/+$/, '')}/api/generate`;
  const prompt = messages
    .map((msg) => `[${msg.role.toUpperCase()}]\n${msg.content}`)
    .join('\n\n');

  // Support API key auth for Ollama behind reverse proxy
  const ollamaApiKey = String(process.env.OLLAMA_API_KEY || '').trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ollamaApiKey) {
    headers['x-api-key'] = ollamaApiKey;
  }

  let response: any;
  try {
    response = await axios.post(endpoint, {
      model,
      prompt,
      stream: false
    }, {
      timeout: 120000,
      headers
    });
  } catch (error: any) {
    throw toUpstreamServiceError('OLLAMA', error);
  }
  return String(response.data?.response || response.data?.text || '').trim();
};
