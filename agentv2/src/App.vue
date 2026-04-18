<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import CanvasArtifact from "@/components/CanvasArtifact.vue";
import ChatTurnGroup from "@/components/ChatTurnGroup.vue";
import type { CanvasItem } from "../shared/canvas";
import { summarizeTurn, type ChatTurn, type TurnActionItem } from "../shared/turn";
import { useTurnExpansion } from "./composables/useTurnExpansion";

type Role = "user" | "assistant";
type ConnectionStatus = "idle" | "connecting" | "ready" | "streaming" | "error";
type ThemePreference = "system" | "light" | "dark";

interface RuntimeModel {
  id: string;
  label: string;
  provider: "openai" | "ollama";
  baseUrl: string;
  model: string;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
}

interface RuntimeConfig {
  models: RuntimeModel[];
  defaultModelId: string;
  autoConnectModelId: string;
}

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  state?: "streaming" | "done" | "error";
}

interface ActivityItem {
  id: string;
  label: string;
  detail: string;
  tone: "neutral" | "live" | "warn";
}

interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  turns: ChatTurn[];
  activities: ActivityItem[];
  canvasItems: CanvasItem[];
}

interface SessionState {
  id: string;
  activeChatId: string;
  chats: ChatThread[];
}

interface ServerSnapshot {
  session: SessionState;
  status: ConnectionStatus;
  activeModel: string;
}

type ServerEvent =
  | { type: "ready"; snapshot: ServerSnapshot }
  | { type: "session_state"; snapshot: ServerSnapshot }
  | { type: "turn_started"; chatId: string; turn: ChatTurn }
  | { type: "turn_action_added"; chatId: string; turnId: string; item: TurnActionItem }
  | { type: "turn_completed"; chatId: string; turn: ChatTurn }
  | { type: "activity"; chatId: string; item: ActivityItem }
  | { type: "canvas_item"; chatId: string; item: CanvasItem }
  | { type: "canvas_clear"; chatId: string }
  | { type: "assistant_start"; chatId: string; messageId: string }
  | { type: "assistant_delta"; chatId: string; messageId: string; delta: string }
  | { type: "assistant_done"; chatId: string; messageId: string; content: string }
  | { type: "error"; message: string; detail?: string };

type ClientEvent =
  | {
      type: "init";
      model: string;
      sessionId?: string;
    }
  | { type: "new_chat" }
  | { type: "switch_chat"; chatId: string }
  | { type: "chat"; chatId: string; messageId: string; text: string };

const storageKeys = {
  sessionId: "agentv2.sessionId",
  theme: "agentv2.themePreference",
};

const runtimeConfig = ref<RuntimeConfig | null>(null);
const model = ref("");
const themePreference = ref<ThemePreference>((localStorage.getItem(storageKeys.theme) as ThemePreference) ?? "system");
const systemDark = ref(window.matchMedia("(prefers-color-scheme: dark)").matches);
const resolvedTheme = computed(() =>
  themePreference.value === "system" ? (systemDark.value ? "dark" : "light") : themePreference.value,
);

function setTheme(pref: ThemePreference) {
  themePreference.value = pref;
  localStorage.setItem(storageKeys.theme, pref);
}

const connectionStatus = ref<ConnectionStatus>("idle");
const statusDetail = ref("Nicht verbunden");
const session = ref<SessionState | null>(null);
const activeChatId = ref("");
const draft = ref("");
const socket = ref<WebSocket | null>(null);
const errorMessage = ref("");
const scrollTarget = ref<HTMLDivElement | null>(null);
const canvasRailRef = ref<HTMLDivElement | null>(null);
const selectedCanvasByChat = ref<Record<string, string>>({});
const autoConnectAttempted = ref(false);
const { isExpanded: isTurnExpanded, expandTurn, collapseTurn, collapseChatTurns } = useTurnExpansion();
const availableModels = computed(() => runtimeConfig.value?.models ?? []);
const selectedModel = computed(() => availableModels.value.find((entry) => entry.id === model.value) ?? null);
const selectedModelLabel = computed(() => selectedModel.value?.label ?? (runtimeConfig.value ? "Modell wählen" : "Modelle werden geladen"));

const currentChat = computed(() => {
  const current = session.value?.chats.find((chat) => chat.id === activeChatId.value);
  return current ?? session.value?.chats[0] ?? null;
});
const currentChatId = computed(() => currentChat.value?.id ?? "");

const canvasActivities = computed(() => currentChat.value?.activities ?? []);
function deriveTurnsFromMessages(chat: ChatThread | null): ChatTurn[] {
  if (!chat) return [];

  const turns: ChatTurn[] = [];
  let pendingUser: ChatMessage | null = null;

  for (const message of chat.messages) {
    if (message.role === "user") {
      pendingUser = message;
      turns.push({
        id: message.id,
        chatId: chat.id,
        userMessageId: message.id,
        userContent: message.content,
        status: "settled",
        startedAt: message.createdAt,
        actionSummary: {
          stepCount: 0,
          toolCount: 0,
          canvasCount: 0,
          errorCount: 0,
          headline: "Abgeschlossener Turn",
        },
        actionItems: [],
      });
      continue;
    }

    if (message.role === "assistant" && pendingUser) {
      const turn = turns[turns.length - 1];
      if (turn) {
        turn.assistantMessageId = message.id;
        turn.assistantContent = message.content;
      }
      pendingUser = null;
    }
  }

  return turns;
}

const currentTurns = computed(() => currentChat.value?.turns?.length ? currentChat.value.turns : deriveTurnsFromMessages(currentChat.value));
const timelineCanvasItems = computed(() => [...(currentChat.value?.canvasItems ?? [])].reverse());

const selectedCanvasId = computed<string>({
  get() {
    const chat = currentChat.value;
    if (!chat) return "";
    return selectedCanvasByChat.value[chat.id] ?? chat.canvasItems[0]?.id ?? "";
  },
  set(value) {
    const chat = currentChat.value;
    if (!chat || !value) return;
    selectedCanvasByChat.value = {
      ...selectedCanvasByChat.value,
      [chat.id]: value,
    };
  },
});

const selectedCanvasItem = computed(() => {
  if (timelineCanvasItems.value.length === 0) return null;
  return timelineCanvasItems.value.find((item) => item.id === selectedCanvasId.value) ?? timelineCanvasItems.value[timelineCanvasItems.value.length - 1];
});

const activityFeed = computed(() => canvasActivities.value.slice(0, 6));

const wsUrl =
  import.meta.env.PROD ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws` : "ws://localhost:3001/ws";

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function persistSessionId(id: string) {
  localStorage.setItem(storageKeys.sessionId, id);
}

function createLocalSession(sessionId?: string): SessionState {
  const chatId = makeId("chat");
  return {
    id: sessionId ?? localStorage.getItem(storageKeys.sessionId) ?? makeId("session"),
    activeChatId: chatId,
    chats: [
      {
        id: chatId,
        title: "Neue Lage",
        messages: [],
        turns: [],
        activities: [
          {
            id: makeId("activity"),
            label: "Canvas bereit",
            detail: "Hier erscheinen später Lagekarte, Hydranten und Pendelpläne.",
            tone: "neutral",
          },
        ],
        canvasItems: [],
      },
    ],
  };
}

async function seedSession(sessionId?: string) {
  const id = sessionId ?? localStorage.getItem(storageKeys.sessionId);
  
  // Try to recover session from server
  if (id) {
    try {
      const resp = await fetch("/api/session", {
        credentials: "include",
      });
      
      if (resp.ok) {
        const data = (await resp.json()) as { session: SessionState; recovered: boolean };
        session.value = data.session;
        activeChatId.value = data.session.activeChatId;
        persistSessionId(data.session.id);
        return;
      }
    } catch (error) {
      console.error("Failed to recover session:", error);
    }
  }
  
  // Fall back to local session creation
  session.value = createLocalSession(sessionId);
  activeChatId.value = session.value.activeChatId;
  persistSessionId(session.value.id);
}

function syncSnapshot(snapshot: ServerSnapshot) {
  session.value = snapshot.session;
  activeChatId.value = snapshot.session.activeChatId;
  connectionStatus.value = snapshot.status;
  statusDetail.value = snapshot.status === "ready" ? `Verbunden mit ${snapshot.activeModel}` : statusDetail.value;
  persistSessionId(snapshot.session.id);
  // Purge selectedCanvasByChat entries for chats no longer in this session
  const validIds = new Set(snapshot.session.chats.map((c) => c.id));
  const cleaned: Record<string, string> = {};
  for (const [id, sel] of Object.entries(selectedCanvasByChat.value)) {
    if (validIds.has(id)) cleaned[id] = sel;
  }
  selectedCanvasByChat.value = cleaned;
}

function ensureCanvasSelection(chatId: string) {
  const chat = session.value?.chats.find((entry) => entry.id === chatId);
  if (!chat || chat.canvasItems.length === 0) return;
  const selected = selectedCanvasByChat.value[chatId];
  if (!selected || !chat.canvasItems.some((item) => item.id === selected)) {
    selectedCanvasByChat.value = {
      ...selectedCanvasByChat.value,
      [chatId]: chat.canvasItems[0].id,
    };
  }
}

function ensureActiveChat() {
  if (!session.value) seedSession();
  if (!currentChat.value && session.value) {
    session.value.activeChatId = session.value.chats[0]?.id ?? session.value.activeChatId;
    activeChatId.value = session.value.activeChatId;
  }
}

function pushActivity(chatId: string, item: ActivityItem) {
  const chat = session.value?.chats.find((entry) => entry.id === chatId);
  if (!chat) return;
  chat.activities.unshift(item);
}

function addTurn(chatId: string, turn: ChatTurn) {
  const chat = session.value?.chats.find((entry) => entry.id === chatId);
  if (!chat) return;
  chat.turns.push(turn);
}

function updateTurn(chatId: string, turnId: string, updater: (turn: ChatTurn) => void) {
  const chat = session.value?.chats.find((entry) => entry.id === chatId);
  const turn = chat?.turns.find((entry) => entry.id === turnId);
  if (!turn) return;
  updater(turn);
}

function updateTurnForMessage(chatId: string, messageId: string, updater: (turn: ChatTurn) => void) {
  const chat = session.value?.chats.find((entry) => entry.id === chatId);
  const turn = chat?.turns.find(
    (entry) => entry.id === messageId || entry.userMessageId === messageId || entry.assistantMessageId === messageId,
  );
  if (!turn) return;
  updater(turn);
}

function toggleTurn(chatId: string, turnId: string) {
  if (isTurnExpanded(chatId, turnId)) {
    collapseTurn(chatId, turnId);
    return;
  }
  expandTurn(chatId, turnId);
}

function addMessage(chatId: string, message: ChatMessage) {
  const chat = session.value?.chats.find((entry) => entry.id === chatId);
  if (!chat) return;
  chat.messages.push(message);
}

function updateAssistantMessage(chatId: string, messageId: string, updater: (message: ChatMessage) => void) {
  const chat = session.value?.chats.find((entry) => entry.id === chatId);
  const message = chat?.messages.find((entry) => entry.id === messageId);
  if (!message) return;
  updater(message);
}

function updateChatTitleFromContent(chatId: string, content: string) {
  const chat = session.value?.chats.find((entry) => entry.id === chatId);
  if (!chat || chat.title !== "Neue Lage") return;
  const title = content.trim().split(/\s+/).slice(0, 4).join(" ");
  chat.title = title.length > 0 ? title.slice(0, 28) : "Neue Lage";
}

function scrollToBottom() {
  nextTick(() => {
    scrollTarget.value?.scrollTo({ top: scrollTarget.value.scrollHeight, behavior: "smooth" });
  });
}

function scrollCanvasToEnd() {
  nextTick(() => {
    canvasRailRef.value?.scrollTo({ left: canvasRailRef.value.scrollWidth, behavior: "smooth" });
  });
}

function focusCanvasItem(itemId: string) {
  selectedCanvasId.value = itemId;
  nextTick(() => {
    const item = document.getElementById(`canvas-item-${itemId}`);
    item?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });
}

function emit(event: ClientEvent) {
  socket.value?.send(JSON.stringify(event));
}

async function loadRuntimeConfig() {
  const response = await fetch("/api/runtime-config");
  if (!response.ok) {
    throw new Error(`Runtime config request failed: ${response.status} ${response.statusText}`);
  }

  const config = (await response.json()) as RuntimeConfig;
  runtimeConfig.value = config;
  model.value = config.autoConnectModelId || config.defaultModelId;
}

function connect() {
  const runtimeModel = runtimeConfig.value;
  const selectedModelId =
    runtimeModel?.models.some((entry) => entry.id === model.value)
      ? model.value
      : runtimeModel?.autoConnectModelId || runtimeModel?.defaultModelId || "";

  if (!runtimeModel || runtimeModel.models.length === 0) {
    connectionStatus.value = "error";
    statusDetail.value = "Keine Modelle konfiguriert";
    errorMessage.value = "Die Laufzeitkonfiguration konnte keine Modelle laden.";
    return;
  }

  if (!selectedModelId) {
    connectionStatus.value = "error";
    statusDetail.value = "Kein Modell verfügbar";
    errorMessage.value = "Es ist kein verbindbares Modell konfiguriert.";
    return;
  }

  model.value = selectedModelId;

  if (socket.value && socket.value.readyState === WebSocket.OPEN) {
    socket.value.close();
  }

  connectionStatus.value = "connecting";
  statusDetail.value = selectedModelLabel.value ? `Verbinde mit ${selectedModelLabel.value}` : "Verbinde...";
  errorMessage.value = "";

  socket.value = new WebSocket(wsUrl);

  socket.value.addEventListener("open", () => {
    emit({
      type: "init",
      model: model.value.trim(),
      sessionId: session.value?.id,
    });
  });

  socket.value.addEventListener("message", (message) => {
    const event = JSON.parse(message.data as string) as ServerEvent;

    if (event.type === "ready" || event.type === "session_state") {
      syncSnapshot(event.snapshot);
      ensureCanvasSelection(event.snapshot.session.activeChatId);
      return;
    }

    if (event.type === "activity") {
      pushActivity(event.chatId, event.item);
      scrollToBottom();
      return;
    }

    if (event.type === "turn_started") {
      addTurn(event.chatId, event.turn);
      expandTurn(event.chatId, event.turn.id);
      scrollToBottom();
      return;
    }

    if (event.type === "turn_action_added") {
      updateTurn(event.chatId, event.turnId, (turn) => {
        turn.actionItems.push(event.item);
        turn.actionSummary = summarizeTurn(turn);
      });
      expandTurn(event.chatId, event.turnId);
      scrollToBottom();
      return;
    }

    if (event.type === "turn_completed") {
      updateTurn(event.chatId, event.turn.id, (turn) => {
        Object.assign(turn, event.turn);
      });
      expandTurn(event.chatId, event.turn.id);
      scrollToBottom();
      return;
    }

    if (event.type === "canvas_item") {
      const chat = session.value?.chats.find((entry) => entry.id === event.chatId);
      if (chat) {
        chat.canvasItems.unshift(event.item);
        selectedCanvasByChat.value = {
          ...selectedCanvasByChat.value,
          [chat.id]: event.item.id,
        };
        scrollCanvasToEnd();
      }
      scrollToBottom();
      return;
    }

    if (event.type === "canvas_clear") {
      const chat = session.value?.chats.find((entry) => entry.id === event.chatId);
      if (chat) {
        chat.canvasItems = [];
        const { [chat.id]: _removed, ...rest } = selectedCanvasByChat.value;
        selectedCanvasByChat.value = rest;
      }
      scrollToBottom();
      return;
    }

    if (event.type === "assistant_start") {
      addMessage(event.chatId, {
        id: event.messageId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        state: "streaming",
      });
      updateTurnForMessage(event.chatId, event.messageId, (turn) => {
        turn.status = "live";
      });
      connectionStatus.value = "streaming";
      statusDetail.value = "Antwort wird gestreamt";
      scrollToBottom();
      return;
    }

    if (event.type === "assistant_delta") {
      updateAssistantMessage(event.chatId, event.messageId, (msg) => {
        msg.content += event.delta;
      });
      updateTurnForMessage(event.chatId, event.messageId, (turn) => {
        const assistantMessage = session.value?.chats.find((entry) => entry.id === event.chatId)?.messages.find((message) => message.id === event.messageId);
        turn.assistantContent = assistantMessage?.content ?? turn.assistantContent ?? event.delta;
      });
      scrollToBottom();
      return;
    }

    if (event.type === "assistant_done") {
      updateAssistantMessage(event.chatId, event.messageId, (msg) => {
        msg.content = event.content;
        msg.state = "done";
      });
      updateTurnForMessage(event.chatId, event.messageId, (turn) => {
        turn.assistantContent = event.content;
        turn.status = "settled";
      });
      connectionStatus.value = "ready";
      statusDetail.value = "Bereit";
      updateChatTitleFromContent(event.chatId, event.content);
      scrollToBottom();
      return;
    }

    if (event.type === "error") {
      connectionStatus.value = "error";
      statusDetail.value = event.detail ?? "Fehler";
      errorMessage.value = event.message;
    }
  });

  socket.value.addEventListener("close", () => {
    if (connectionStatus.value === "streaming") return;
    connectionStatus.value = "idle";
    statusDetail.value = "Getrennt";
  });

  socket.value.addEventListener("error", () => {
    connectionStatus.value = "error";
    statusDetail.value = "WebSocket Fehler";
  });
}

function disconnect() {
  socket.value?.close();
  socket.value = null;
  connectionStatus.value = "idle";
  statusDetail.value = "Nicht verbunden";
}

function newChat() {
  if (socket.value?.readyState === WebSocket.OPEN) {
    emit({ type: "new_chat" });
    return;
  }

  if (!session.value) {
    seedSession();
    return;
  }

  const chatId = makeId("chat");
  session.value.chats.unshift({
    id: chatId,
    title: "Neue Lage",
    messages: [],
    turns: [],
    activities: [
      {
        id: makeId("activity"),
        label: "Canvas bereit",
        detail: "Hier erscheinen später Lagekarte, Hydranten und Pendelpläne.",
        tone: "neutral",
      },
    ],
    canvasItems: [],
  });
  session.value.activeChatId = chatId;
  activeChatId.value = chatId;
}

function switchChat(chatId: string) {
  activeChatId.value = chatId;
  ensureCanvasSelection(chatId);
  nextTick(() => {
    const sel = selectedCanvasByChat.value[chatId];
    if (sel) {
      document.getElementById(`canvas-item-${sel}`)?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "center" });
    } else if (canvasRailRef.value) {
      canvasRailRef.value.scrollLeft = 0;
    }
  });
  if (socket.value?.readyState === WebSocket.OPEN) {
    emit({ type: "switch_chat", chatId });
  }
}

function sendMessage() {
  const text = draft.value.trim();
  if (!text || connectionStatus.value === "connecting" || connectionStatus.value === "streaming") return;

  if (socket.value?.readyState !== WebSocket.OPEN) {
    errorMessage.value = "Bitte zuerst verbinden.";
    return;
  }

  ensureActiveChat();
  if (!currentChat.value || !session.value) return;

  const chatId = currentChat.value.id;
  collapseChatTurns(chatId);
  const messageId = makeId("user");

  addMessage(chatId, {
    id: messageId,
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
  });

  pushActivity(chatId, {
    id: makeId("activity"),
    label: "Nachricht gesendet",
    detail: text.slice(0, 90),
    tone: "neutral",
  });

  scrollToBottom();
  draft.value = "";

  emit({
    type: "chat",
    chatId,
    messageId,
    text,
  });
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function activateCanvasItem(item: CanvasItem) {
  focusCanvasItem(item.id);
}

  onMounted(async () => {
    const savedSessionId = localStorage.getItem(storageKeys.sessionId);
    await seedSession(savedSessionId ?? undefined);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMqChange = (e: MediaQueryListEvent) => { systemDark.value = e.matches; };
    mq.addEventListener("change", onMqChange);
    onBeforeUnmount(() => mq.removeEventListener("change", onMqChange));

    loadRuntimeConfig()
      .then(() => {
        if (!autoConnectAttempted.value) {
          autoConnectAttempted.value = true;
          connect();
        }
      })
      .catch((error) => {
        connectionStatus.value = "error";
        statusDetail.value = "Laufzeitkonfiguration fehlt";
        errorMessage.value = error instanceof Error ? error.message : String(error);
      });
  });

watch(
  resolvedTheme,
  (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-theme-pref", themePreference.value);
  },
  { immediate: true },
);

watch(
  () => [currentChat.value?.id, currentChat.value?.canvasItems.map((item) => item.id).join("|")].join(":"),
  () => {
    if (currentChat.value) {
      ensureCanvasSelection(currentChat.value.id);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  socket.value?.close();
});
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">f</div>
        <div>
          <div class="brand-name">agentv2</div>
          <div class="brand-subtitle">Lageplanung in Echtzeit</div>
        </div>
      </div>

      <div class="controls">
        <div class="theme-toggle" role="group" aria-label="Farbschema">
          <button class="theme-btn" :class="{ active: themePreference === 'light' }" title="Hell" type="button" @click="setTheme('light')">☀</button>
          <button class="theme-btn" :class="{ active: themePreference === 'system' }" title="Auto" type="button" @click="setTheme('system')">◑</button>
          <button class="theme-btn" :class="{ active: themePreference === 'dark' }" title="Dunkel" type="button" @click="setTheme('dark')">☽</button>
        </div>
        <select v-model="model" class="field field-model" :disabled="availableModels.length <= 1">
          <option v-if="availableModels.length === 0" value="">
            {{ selectedModelLabel }}
          </option>
          <option v-for="entry in availableModels" :key="entry.id" :value="entry.id">
            {{ entry.label }}
          </option>
        </select>
        <button v-if="connectionStatus !== 'ready' && connectionStatus !== 'streaming'" class="button button-primary" type="button" @click="connect">
          Verbinden
        </button>
        <button v-else class="button" type="button" @click="disconnect">Trennen</button>
      </div>
    </header>

    <main class="workspace">
      <section class="panel chat-panel">
        <div class="panel-header">
          <div>
            <h2>Chat</h2>
            <p>Kurze Lage eingeben, das System zeigt Schritte und Tools live an.</p>
          </div>
          <div class="status-chip" :data-status="connectionStatus">
            <span class="status-dot"></span>
            <span>{{ statusDetail }}</span>
          </div>
        </div>

        <div class="chat-strip">
          <button
            v-for="chat in session?.chats ?? []"
            :key="chat.id"
            type="button"
            class="chat-pill"
            :class="{ active: chat.id === activeChatId }"
            @click="switchChat(chat.id)"
          >
            {{ chat.title }}
          </button>
          <button type="button" class="chat-pill chat-pill-add" @click="newChat">+ Neuer Chat</button>
        </div>

        <div ref="scrollTarget" class="chat-stream">
          <div v-if="currentTurns.length === 0 && (currentChat?.messages.length ?? 0) === 0" class="empty-state">
            <div class="empty-icon">⚑</div>
            <h3>Lage beschreiben</h3>
            <p>Zum Beispiel: Brand im Perlacher Forst, Position, erste Einschätzung, Wasserbedarf.</p>
          </div>

          <ChatTurnGroup
            v-for="turn in currentTurns"
            :key="turn.id"
            :turn="turn"
            :expanded="isTurnExpanded(currentChatId, turn.id) || turn.status === 'live'"
            @toggle="toggleTurn(currentChatId, turn.id)"
          />
        </div>

        <form class="composer" @submit.prevent="sendMessage">
          <textarea
            v-model="draft"
            rows="3"
            placeholder="Beschreibe knapp die Lage..."
            @keydown="handleKeydown"
          />
          <div class="composer-actions">
            <span class="hint">Enter zum Senden · Shift+Enter für neue Zeile</span>
            <button class="button button-primary" type="submit" :disabled="!draft.trim()">
              Senden
            </button>
          </div>
        </form>

        <p v-if="errorMessage" class="error-box">{{ errorMessage }}</p>
      </section>

      <section class="panel canvas-panel">
        <div class="canvas-header">
          <span class="canvas-header-label">Canvas</span>
          <strong v-if="selectedCanvasItem" class="canvas-header-title">{{ selectedCanvasItem.title }}</strong>
          <span v-else class="canvas-header-title canvas-header-title-empty">Noch leer</span>
          <div class="canvas-header-actions">
            <span class="canvas-header-count">{{ currentChat?.canvasItems.length ?? 0 }}</span>
            <button v-if="selectedCanvasItem" class="button canvas-focus-button" type="button" @click="scrollCanvasToEnd">Neueste</button>
          </div>
        </div>

        <div class="canvas-stage">
          <div v-if="selectedCanvasItem" class="canvas-focus">
            <div class="canvas-focus-viewport">
              <CanvasArtifact :item="selectedCanvasItem" />
            </div>
          </div>

          <article v-else class="canvas-empty">
            <strong>Noch leer</strong>
            <p>Canvas-Tools legen hier Diagramme, Karten und Bilder ab.</p>
          </article>

          <div class="canvas-history">
            <div class="canvas-history-head">
              <strong>Historie</strong>
              <span>Links älter · rechts neuer</span>
            </div>

            <div v-if="timelineCanvasItems.length > 0" ref="canvasRailRef" class="canvas-strip">
              <button
                v-for="item in timelineCanvasItems"
                :id="`canvas-item-${item.id}`"
                :key="item.id"
                type="button"
                class="canvas-tile"
                :class="{ active: item.id === selectedCanvasId }"
                @click="activateCanvasItem(item)"
              >
                <CanvasArtifact :item="item" compact />
              </button>
            </div>
            <div v-else class="canvas-strip-empty">
              <span>Noch keine Canvas-Objekte</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
