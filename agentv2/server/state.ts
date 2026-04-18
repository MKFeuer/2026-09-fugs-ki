import type { CanvasItem } from "../shared/canvas";
import type { ChatTurn } from "../shared/turn";

export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  label: string;
  detail: string;
  tone: "neutral" | "live" | "warn";
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  turns: ChatTurn[];
  activities: ActivityItem[];
  canvasItems: CanvasItem[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionState {
  id: string;
  activeChatId: string;
  chats: ChatThread[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionSnapshot {
  session: SessionState;
  status: "idle" | "connecting" | "ready" | "streaming" | "error";
  activeModel: string;
}

export function createActivity(label: string, detail: string, tone: ActivityItem["tone"] = "neutral"): ActivityItem {
  return {
    id: crypto.randomUUID(),
    label,
    detail,
    tone,
  };
}

export function createChat(title = "Neue Lage"): ChatThread {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    messages: [],
    turns: [],
    activities: [],
    canvasItems: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createSession(sessionId?: string): SessionState {
  const now = new Date().toISOString();
  const chat = createChat();
  return {
    id: sessionId ?? crypto.randomUUID(),
    activeChatId: chat.id,
    chats: [chat],
    createdAt: now,
    updatedAt: now,
  };
}

export function snapshotSession(session: SessionState, status: SessionSnapshot["status"], activeModel: string): SessionSnapshot {
  return {
    session,
    status,
    activeModel,
  };
}
