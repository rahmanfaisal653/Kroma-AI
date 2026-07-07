/**
 * Chat preferences store — persists user preferences like default model,
 * system prompt, temperature across sessions. Also stores "memory" facts
 * the AI can reference.
 */

import { create } from 'zustand';

export interface ChatMemoryEntry {
  id: string;
  content: string;
  createdAt: number;
}

export interface ChatPreferences {
  defaultModelId: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  defaultSystemPrompt: string;
  memories: ChatMemoryEntry[];
  showHistory: boolean;
}

interface ChatPreferencesState extends ChatPreferences {
  updatePreferences: (partial: Partial<ChatPreferences>) => void;
  addMemory: (content: string) => void;
  removeMemory: (id: string) => void;
  clearMemories: () => void;
  getMemoriesAsContext: () => string;
}

const STORAGE_KEY = 'kroma_chat_preferences';
const MAX_MEMORIES = 50;

function loadPreferences(): ChatPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaultPreferences(), ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaultPreferences();
}

function defaultPreferences(): ChatPreferences {
  return {
    defaultModelId: '',
    defaultTemperature: 0.7,
    defaultMaxTokens: 2048,
    defaultSystemPrompt: '',
    memories: [],
    showHistory: true,
  };
}

function savePreferences(prefs: ChatPreferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch { /* ignore quota errors */ }
}

export const useChatPreferencesStore = create<ChatPreferencesState>((set, get) => {
  const initial = loadPreferences();
  return {
    ...initial,

    updatePreferences: (partial) => {
      set(state => {
        const next = { ...state, ...partial };
        savePreferences(next);
        return next;
      });
    },

    addMemory: (content) => {
      const id = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      set(state => {
        const memories = [
          { id, content: content.trim(), createdAt: Date.now() },
          ...state.memories,
        ].slice(0, MAX_MEMORIES);
        const next = { ...state, memories };
        savePreferences(next);
        return { memories };
      });
    },

    removeMemory: (id) => {
      set(state => {
        const memories = state.memories.filter(m => m.id !== id);
        const next = { ...state, memories };
        savePreferences(next);
        return { memories };
      });
    },

    clearMemories: () => {
      set(state => {
        const next = { ...state, memories: [] };
        savePreferences(next);
        return { memories: [] };
      });
    },

    getMemoriesAsContext: () => {
      const { memories } = get();
      if (memories.length === 0) return '';
      const lines = memories.map(m => `- ${m.content}`);
      return `The user has stored the following memories/preferences:\n${lines.join('\n')}`;
    },
  };
});
