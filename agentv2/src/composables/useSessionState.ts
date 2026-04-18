import { ref, computed } from "vue";
import type { SessionState, ChatThread, ActivityItem, ChatMessage } from "../../shared/types";

const STORAGE_KEY = "agentv2_sessionId";

export function useSessionState() {
  const session = ref<SessionState | null>(null);
  const activeChatId = ref("");

  const currentChat = computed(() => {
    const current = session.value?.chats.find((chat) => chat.id === activeChatId.value);
    return current ?? session.value?.chats[0] ?? null;
  });

  const currentChatId = computed(() => currentChat.value?.id ?? "");

  const getSessionId = () => {
    return localStorage.getItem(STORAGE_KEY);
  };

  const setSessionId = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
  };

  const clearSessionId = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  const setSession = (newSession: SessionState) => {
    session.value = newSession;
    activeChatId.value = newSession.activeChatId;
    setSessionId(newSession.id);
  };

  const updateSessionState = (updater: (session: SessionState) => void) => {
    if (session.value) {
      updater(session.value);
    }
  };

  const addChat = (chat: ChatThread) => {
    if (session.value) {
      session.value.chats.unshift(chat);
      session.value.activeChatId = chat.id;
      activeChatId.value = chat.id;
      session.value.updatedAt = new Date().toISOString();
    }
  };

  const switchChat = (chatId: string) => {
    if (session.value) {
      session.value.activeChatId = chatId;
      activeChatId.value = chatId;
      session.value.updatedAt = new Date().toISOString();
    }
  };

  const updateCurrentChat = (updater: (chat: ChatThread) => void) => {
    if (currentChat.value) {
      updater(currentChat.value);
      if (session.value) {
        session.value.updatedAt = new Date().toISOString();
      }
    }
  };

  return {
    session,
    activeChatId,
    currentChat,
    currentChatId,
    getSessionId,
    setSessionId,
    clearSessionId,
    setSession,
    updateSessionState,
    addChat,
    switchChat,
    updateCurrentChat,
  };
}
