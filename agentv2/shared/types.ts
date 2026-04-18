// Shared type contracts across client and server

export type Role = "user" | "assistant";
export type ConnectionStatus = "idle" | "connecting" | "ready" | "streaming" | "error";
export type ThemePreference = "system" | "light" | "dark";
export type TurnActionTone = "neutral" | "live" | "warn";
export type ChatTurnStatus = "live" | "settled" | "failed";
export type ActivityItemTone = "neutral" | "live" | "warn";

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
  tone: ActivityItemTone;
}

export interface TurnActionItem {
  id: string;
  label: string;
  detail: string;
  tone: TurnActionTone;
  createdAt: string;
}

export interface TurnActionSummary {
  stepCount: number;
  toolCount: number;
  canvasCount: number;
  errorCount: number;
  headline: string;
}

export interface ChatTurn {
  id: string;
  chatId: string;
  userMessageId: string;
  userContent?: string;
  assistantMessageId?: string;
  assistantContent?: string;
  status: ChatTurnStatus;
  startedAt: string;
  completedAt?: string;
  actionSummary: TurnActionSummary;
  actionItems: TurnActionItem[];
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  turns: ChatTurn[];
  activities: ActivityItem[];
  canvasItems: any[]; // CanvasItem imported separately
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
  status: ConnectionStatus;
  activeModel: string;
}
