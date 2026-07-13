import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown, AlertTriangle, RefreshCw } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import { useInternalModels } from '../../hooks/useInternalModels';
import { useAuthStore } from '../../stores/auth.store';
import { useConversationsStore } from '../../stores/conversations.store';
import { ChatSidebar } from './components/ChatSidebar';
import { ChatTopBar } from './components/ChatTopBar';
import { ChatBubble } from './components/ChatBubble';
import { ChatInput } from './components/ChatInput';
import { ChatEmptyState } from './components/ChatEmptyState';
import { useAutoScroll } from './hooks/useAutoScroll';
import { exportConversation, type ExportFormat } from './utils/exportChat';
import { useChatPreferencesStore } from '../../stores/chatPreferences.store';
import type { ChatSettings } from './components/ChatSettingsPanel';
import type { ChatMessage } from '../../types/api';

// ---------------------------------------------------------------------------
// ChatPage — thin orchestrator
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const { modelId } = useParams();
  const user = useAuthStore(s => s.user);
  const [gatewayKey, setGatewayKey] = useState(() => localStorage.getItem('kroma_gateway_key') || '');
  const { models: internalModels, loading: modelsLoading } = useInternalModels(gatewayKey);

  // --- Local UI state ---
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [input, setInput] = useState('');
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(() => window.innerWidth >= 768);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState('');
  const chatPrefs = useChatPreferencesStore();
  const [settings, setSettings] = useState<ChatSettings>({
    temperature: chatPrefs.defaultTemperature,
    maxTokens: chatPrefs.defaultMaxTokens,
    systemPrompt: chatPrefs.defaultSystemPrompt,
  });

  // --- Guards & refs ---
  const hasInitRef = useRef(false);       // Prevent double-init from StrictMode
  const isSwitchingRef = useRef(false);   // Prevent sync during conversation switch
  const messagesRef = useRef<ChatMessage[]>([]); // Stable ref to current messages
  const activeIdRef = useRef<string | null>(null); // Stable ref to activeId

  // --- Stores ---
  const {
    conversations, activeId, createConversation, deleteConversation,
    renameConversation, setActive, syncMessages, updateSystemPrompt, getActive,
    setUserScope, userId: conversationUserId,
  } = useConversationsStore();

  // Keep refs in sync
  activeIdRef.current = activeId;

  // --- Derived ---
  const textModels = internalModels.filter(m => m.type === 'text-to-text');
  const activeModel = textModels.find(m => String(m.id) === (modelId || selectedModel)) || textModels[0];

  // --- Chat hook ---
  const {
    messages, isLoading, error, contextTokens,
    sendMessage, regenerate, editAndRegenerate,
    clearMessages, clearError, setMessages, abortCurrentRequest,
  } = useChat({
    endpoint: activeModel?.endpoint || '/v1/chat/completions',
    userKey: gatewayKey || user?.user_key || '',
    model: activeModel?.model_slug,
    stream: activeModel?.is_streaming ?? false,
    maxContextTokens: (activeModel?.max_tokens ?? 4096) * 4,
  });

  useEffect(() => {
    setUserScope(user?.id);
    hasInitRef.current = false;
    setMessages([]);
  }, [user?.id, setUserScope, setMessages]);

  const saveGatewayKey = useCallback((key: string) => {
    const trimmed = key.trim();
    setGatewayKey(trimmed);
    localStorage.setItem('kroma_gateway_key', trimmed);
  }, []);

  // Keep message ref in sync
  messagesRef.current = messages;

  // --- Auto-scroll (use messages.length, not the array ref, to prevent loops) ---
  const { containerRef, endRef, showScrollButton, scrollToBottom } = useAutoScroll([
    messages.length, isLoading,
  ]);

  // --- Sync model from route param ---
  useEffect(() => {
    if (modelId && textModels.length > 0) setSelectedModel(modelId);
  }, [modelId, textModels.length]);

  // --- Auto-create conversation (with StrictMode guard) ---
  useEffect(() => {
    if (hasInitRef.current) return;
    hasInitRef.current = true;

    if (conversations.length === 0) {
      createConversation(modelId);
    } else if (!activeId && conversations.length > 0) {
      setActive(conversations[0].id);
    }

    // Load messages from active conversation into useChat hook
    const active = conversations.find(c => c.id === (activeId || conversations[0]?.id));
    if (active && active.messages.length > 0) {
      const loadedMessages: ChatMessage[] = active.messages.map((m, i) => ({
        id: `loaded_${active.id}_${i}`,
        role: m.role as ChatMessage['role'],
        content: m.content,
        thinking: m.thinking,
        timestamp: m.timestamp || Date.now(),
      }));
      setMessages(loadedMessages);
    }
  }, [conversationUserId, conversations.length]); // Re-run when authenticated user scope changes

  // --- Ensure activeId exists if it becomes null after delete ---
  useEffect(() => {
    if (hasInitRef.current && !activeId && conversations.length > 0) {
      setActive(conversations[0].id);
    }
  }, [activeId, conversations.length]);

  // --- Load system prompt from active conversation ---
  useEffect(() => {
    const convo = getActive();
    if (convo?.systemPrompt !== undefined) {
      setSettings(prev => {
        if (prev.systemPrompt === (convo.systemPrompt || '')) return prev; // no-op
        return { ...prev, systemPrompt: convo.systemPrompt || '' };
      });
    }
  }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Bidirectional sync: save messages to store when streaming ends ---
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isLoading;

    // Only sync on loading transition true → false (stream finished)
    // AND not during a conversation switch
    if (wasLoading && !isLoading && !isSwitchingRef.current) {
      const id = activeIdRef.current;
      const msgs = messagesRef.current;
      if (id && msgs.length > 0) {
        syncMessages(id, msgs as any);
      }
    }
  }, [isLoading]); // Only depend on isLoading — NOT messages, NOT activeId

  // --- Handlers ---
  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    if (!activeIdRef.current) createConversation(modelId);

    try {
      // Build system prompt with memories
      const memoryContext = chatPrefs.getMemoriesAsContext();
      const fullSystemPrompt = [settings.systemPrompt, memoryContext].filter(Boolean).join('\n\n');

      const overrides: Record<string, any> = {
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        ...(fullSystemPrompt ? { system: fullSystemPrompt } : {}),
        ...(attachedImage ? { image_url: attachedImage } : {}),
      };

      sendMessage(input, overrides);
    } catch (err) {
      console.error('[ChatPage] Send failed:', err);
    }

    setInput('');
    setAttachedImage(null);
    setAttachedImageName('');
  }, [input, isLoading, settings, attachedImage, sendMessage, createConversation, modelId, chatPrefs]);

  const handleNewChat = useCallback(() => {
    // Save current messages first
    const id = activeIdRef.current;
    const msgs = messagesRef.current;
    if (id && msgs.length > 0) {
      syncMessages(id, msgs as any);
    }
    // Then clear and create new
    clearMessages();
    createConversation(modelId);
  }, [clearMessages, createConversation, modelId, syncMessages]);

  const handleSelectConvo = useCallback((id: string) => {
    if (id === activeIdRef.current) return; // Already active

    isSwitchingRef.current = true;

    // Save current messages before switching
    const currentId = activeIdRef.current;
    const currentMsgs = messagesRef.current;
    if (currentId && currentMsgs.length > 0) {
      syncMessages(currentId, currentMsgs as any);
    }

    // Switch active conversation
    setActive(id);

    // Load messages from the target conversation
    const target = conversations.find(c => c.id === id);
    if (target && target.messages.length > 0) {
      const loadedMessages: ChatMessage[] = target.messages.map((m, i) => ({
        id: `loaded_${id}_${i}`,
        role: m.role as ChatMessage['role'],
        content: m.content,
        thinking: m.thinking,
        timestamp: m.timestamp || Date.now(),
      }));
      setMessages(loadedMessages);
    } else {
      clearMessages();
    }

    // Allow sync again after a tick
    setTimeout(() => { isSwitchingRef.current = false; }, 100);
  }, [conversations, setActive, syncMessages, setMessages, clearMessages]);

  const handleSelectModel = useCallback((id: string) => {
    setSelectedModel(id);
    setShowModelSelect(false);
    const model = textModels.find(m => String(m.id) === id);
    if (model) {
      setSettings(prev => ({
        ...prev,
        temperature: model.default_temperature ?? prev.temperature,
        maxTokens: model.max_tokens ?? prev.maxTokens,
      }));
    }
  }, [textModels]);

  const handleSettingsChange = useCallback((newSettings: ChatSettings) => {
    setSettings(newSettings);
    const id = activeIdRef.current;
    if (id) updateSystemPrompt(id, newSettings.systemPrompt);
  }, [updateSystemPrompt]);

  const handleRegenerate = useCallback((messageId: string) => {
    regenerate(messageId);
  }, [regenerate]);

  const handleEdit = useCallback((messageId: string, newContent: string) => {
    editAndRegenerate(messageId, newContent);
  }, [editAndRegenerate]);

  const handleExport = useCallback((format: ExportFormat) => {
    const convo = getActive();
    exportConversation(messagesRef.current, convo?.title || 'Chat Export', format);
  }, [getActive]);

  const handleFeedback = useCallback((_rating: 'up' | 'down', _messageIndex: number) => {
    // Feedback endpoint removed with legacy API cleanup.
  }, []);

  const handleClearChat = useCallback(() => {
    clearMessages();
    const id = activeIdRef.current;
    if (id) {
      syncMessages(id, []);
      renameConversation(id, 'New Chat');
    }
  }, [clearMessages, renameConversation, syncMessages]);

  // --- Render ---
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      {showHistory && (
        <ChatSidebar
          conversations={conversations}
          activeId={activeId}
          onNewChat={handleNewChat}
          onSelect={handleSelectConvo}
          onRename={renameConversation}
          onDelete={deleteConversation}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <input
            value={gatewayKey}
            onChange={e => saveGatewayKey(e.target.value)}
            placeholder="Paste kg_ API key untuk /v1 gateway"
            className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-mono text-[var(--color-text)]"
          />
        </div>
        {/* Top bar */}
        <ChatTopBar
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory(h => !h)}
          activeModel={activeModel}
          textModels={textModels}
          modelsLoading={modelsLoading}
          showModelSelect={showModelSelect}
          onToggleModelSelect={() => setShowModelSelect(s => !s)}
          onSelectModel={handleSelectModel}
          showSettings={showSettings}
          onToggleSettings={() => setShowSettings(s => !s)}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          contextTokens={contextTokens}
          maxContextTokens={activeModel?.max_tokens ? activeModel.max_tokens * 4 : undefined}
          hasMessages={messages.length > 0}
          onClearChat={handleClearChat}
          onExport={handleExport}
        />

        {/* Messages area */}
        <div ref={containerRef} className="flex-1 overflow-y-auto relative">
          {messages.length === 0 ? (
            <ChatEmptyState
              modelName={activeModel?.name}
              modelDescription={activeModel?.description}
            />
          ) : (
            <div className="max-w-4xl mx-auto py-4 px-4 md:px-8 space-y-1">
              {messages.map((msg, idx) => (
                <React.Fragment key={msg.id}>
                  <ChatBubble
                    message={msg}
                    messageIndex={idx}
                    isLastAssistant={idx === messages.length - 1}
                    isLoading={isLoading}
                    onRegenerate={handleRegenerate}
                    onEdit={handleEdit}
                    onFeedback={handleFeedback}
                  />
                </React.Fragment>
              ))}
              <div ref={endRef} />
            </div>
          )}

          {/* Scroll-to-bottom button */}
          {showScrollButton && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] shadow-lg text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors z-10"
            >
              <ChevronDown size={14} /> New messages
            </button>
          )}
        </div>

        {/* Error bar with retry */}
        {error && (
          <div className="px-4 py-3 text-sm text-red-400 bg-red-500/10 border-t border-red-500/20 flex items-start justify-center gap-3">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="whitespace-pre-line">{error}</div>
            <button
              onClick={() => { clearError(); regenerate(); }}
              className="flex items-center gap-1 text-xs bg-red-500/20 hover:bg-red-500/30 px-2 py-1 rounded transition-colors shrink-0"
            >
              <RefreshCw size={12} /> Coba Lagi
            </button>
          </div>
        )}

        {/* Input area */}
        <ChatInput
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onStop={abortCurrentRequest}
          isLoading={isLoading}
          disabled={!activeModel}
          placeholder={activeModel ? `Message ${activeModel.name}...` : 'Select a model first...'}
          attachedImage={attachedImage}
          attachedImageName={attachedImageName}
          onAttachImage={(dataUrl, name) => { setAttachedImage(dataUrl); setAttachedImageName(name); }}
          onClearImage={() => { setAttachedImage(null); setAttachedImageName(''); }}
        />
      </div>
    </div>
  );
}
