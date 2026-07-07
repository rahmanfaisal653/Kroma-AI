import { create } from 'zustand';
import { generateConversationId, generateTitleFromMessage } from '../features/chat/utils/messageHelpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  timestamp?: number;
  image_url?: string;
}

export interface Conversation {
  id: string;
  title: string;
  modelId?: string;
  systemPrompt?: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ConversationsState {
  userId: string;
  conversations: Conversation[];
  activeId: string | null;

  setUserScope: (userId?: string | number | null) => void;

  createConversation: (modelId?: string) => string;
  deleteConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  setActive: (id: string | null) => void;
  addMessage: (id: string, msg: ChatMessage) => void;
  syncMessages: (id: string, messages: ChatMessage[]) => void;
  updateSystemPrompt: (id: string, prompt: string) => void;
  getActive: () => Conversation | null;
  clearMessages: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY_PREFIX = 'kroma_conversations_';
const MAX_STORED = 50;
const MAX_MESSAGES_PER_CONVO = 200; // Prevent localStorage bloat
const STORAGE_WARN_BYTES = 4 * 1024 * 1024; // 4MB warning threshold

function getStorageKey(userId?: string | number): string {
  return `${STORAGE_KEY_PREFIX}${userId || 'anonymous'}`;
}

function getInitialUserScope(): string {
  try {
    const raw = localStorage.getItem('kroma_user');
    const user = raw ? JSON.parse(raw) : null;
    return String(user?.id || 'anonymous');
  } catch {
    return 'anonymous';
  }
}

function loadFromStorage(userId?: string | number): Conversation[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(convos: Conversation[], userId?: string | number) {
  try {
    // Trim messages per conversation to prevent bloat
    const trimmed = convos.slice(0, MAX_STORED).map(c => ({
      ...c,
      messages: c.messages.slice(-MAX_MESSAGES_PER_CONVO),
    }));
    const json = JSON.stringify(trimmed);

    // Warn if approaching localStorage limit
    if (json.length > STORAGE_WARN_BYTES) {
      console.warn(`[Conversations] Storage size: ${(json.length / 1024 / 1024).toFixed(1)}MB — approaching limit. Old conversations may be trimmed.`);
      // Auto-trim: keep only last 30 conversations if over limit
      const reduced = JSON.stringify(trimmed.slice(0, 30));
      localStorage.setItem(getStorageKey(userId), reduced);
      return;
    }

    localStorage.setItem(getStorageKey(userId), json);
  } catch (e: any) {
    // QuotaExceededError — trim aggressively
    console.error('[Conversations] localStorage quota exceeded, trimming...');
    try {
      const minimal = convos.slice(0, 20).map(c => ({
        ...c,
        messages: c.messages.slice(-50), // Keep only last 50 messages
      }));
      localStorage.setItem(getStorageKey(userId), JSON.stringify(minimal));
    } catch {
      /* give up */
    }
  }
}

function autoTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  return firstUser ? generateTitleFromMessage(firstUser.content) : 'New Chat';
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const initialUserScope = getInitialUserScope();

export const useConversationsStore = create<ConversationsState>((set, get) => ({
  userId: initialUserScope,
  conversations: loadFromStorage(initialUserScope),
  activeId: null,

  setUserScope: (userId) => {
    const scope = String(userId || 'anonymous');
    const current = get().userId;
    if (current === scope) return;
    const conversations = loadFromStorage(scope);
    set({
      userId: scope,
      conversations,
      activeId: conversations[0]?.id || null,
    });
  },

  createConversation: (modelId) => {
    const id = generateConversationId();
    const conv: Conversation = {
      id,
      title: 'New Chat',
      modelId,
      systemPrompt: '',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set(state => {
      const updated = [conv, ...state.conversations];
      saveToStorage(updated, state.userId);
      return { conversations: updated, activeId: id };
    });
    return id;
  },

  deleteConversation: (id) => {
    set(state => {
      const updated = state.conversations.filter(c => c.id !== id);
      saveToStorage(updated, state.userId);
      return {
        conversations: updated,
        activeId: state.activeId === id ? (updated[0]?.id || null) : state.activeId,
      };
    });
  },

  renameConversation: (id, title) => {
    set(state => {
      const updated = state.conversations.map(c =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c
      );
      saveToStorage(updated, state.userId);
      return { conversations: updated };
    });
  },

  setActive: (id) => set({ activeId: id }),

  addMessage: (id, msg) => {
    set(state => {
      const updated = state.conversations.map(c => {
        if (c.id !== id) return c;
        const messages = [...c.messages, { ...msg, timestamp: Date.now() }];
        const title = c.title === 'New Chat' ? autoTitle(messages) : c.title;
        return { ...c, messages, title, updatedAt: Date.now() };
      });
      saveToStorage(updated, state.userId);
      return { conversations: updated };
    });
  },

  /** Full replacement of messages for a conversation (bidirectional sync). */
  syncMessages: (id, messages) => {
    set(state => {
      const updated = state.conversations.map(c => {
        if (c.id !== id) return c;
        const storeMessages: ChatMessage[] = messages.map(m => ({
          role: m.role,
          content: m.content,
          thinking: m.thinking,
          timestamp: m.timestamp,
        }));
        const title = c.title === 'New Chat' ? autoTitle(storeMessages) : c.title;
        return { ...c, messages: storeMessages, title, updatedAt: Date.now() };
      });
      saveToStorage(updated, state.userId);
      return { conversations: updated };
    });
  },

  updateSystemPrompt: (id, prompt) => {
    set(state => {
      const updated = state.conversations.map(c =>
        c.id === id ? { ...c, systemPrompt: prompt, updatedAt: Date.now() } : c
      );
      saveToStorage(updated, state.userId);
      return { conversations: updated };
    });
  },

  getActive: () => {
    const { conversations, activeId } = get();
    return conversations.find(c => c.id === activeId) || null;
  },

  clearMessages: (id) => {
    set(state => {
      const updated = state.conversations.map(c =>
        c.id === id ? { ...c, messages: [], title: 'New Chat', updatedAt: Date.now() } : c
      );
      saveToStorage(updated, state.userId);
      return { conversations: updated };
    });
  },
}));
