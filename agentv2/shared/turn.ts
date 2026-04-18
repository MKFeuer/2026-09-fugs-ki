export type TurnActionTone = "neutral" | "live" | "warn";

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

export type ChatTurnStatus = "live" | "settled" | "failed";

export interface ChatTurn {
  id: string;
  chatId: string;
  userMessageId: string;
  userContent?: string;
  assistantMessageId?: string;
  status: ChatTurnStatus;
  startedAt: string;
  completedAt?: string;
  actionSummary: TurnActionSummary;
  actionItems: TurnActionItem[];
  assistantContent?: string;
}

export function createTurn(chatId: string, userMessageId: string, assistantMessageId: string): ChatTurn {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    chatId,
    userMessageId,
    userContent: undefined,
    assistantMessageId,
    assistantContent: undefined,
    status: "live",
    startedAt: now,
    completedAt: undefined,
    actionSummary: {
      stepCount: 0,
      toolCount: 0,
      canvasCount: 0,
      errorCount: 0,
      headline: "Antwort wird vorbereitet",
    },
    actionItems: [],
  };
}

export function summarizeTurn(turn: ChatTurn): TurnActionSummary {
  const stepCount = turn.actionItems.length;
  const toolCount = turn.actionItems.filter((item) => item.label === "Tool").length;
  const canvasCount = turn.actionItems.filter((item) => item.label === "Canvas").length;
  const errorCount = turn.actionItems.filter((item) => item.tone === "warn").length;
  const latest = turn.actionItems[turn.actionItems.length - 1];

  return {
    stepCount,
    toolCount,
    canvasCount,
    errorCount,
    headline: latest?.detail || latest?.label || "Antwort abgeschlossen",
  };
}
