import { db } from "./init";
import type { SessionState, ChatThread, ChatMessage, ActivityItem } from "../state";
import type { CanvasItem } from "../../shared/canvas";
import type { ChatTurn } from "../../shared/turn";

export function saveSession(session: SessionState): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO sessions (id, active_chat_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `);
  
  stmt.run(session.id, session.activeChatId, session.createdAt, session.updatedAt);
  
  // Save all chats
  for (const chat of session.chats) {
    saveChat(chat, session.id);
  }
}

export function loadSession(sessionId: string): SessionState | null {
  const sessionStmt = db.prepare(`SELECT * FROM sessions WHERE id = ?`);
  const sessionRow = sessionStmt.get(sessionId) as { id: string; active_chat_id: string; created_at: string; updated_at: string } | null;
  
  if (!sessionRow) return null;
  
  const chatsStmt = db.prepare(`SELECT id FROM chats WHERE session_id = ? ORDER BY created_at DESC`);
  const chatRows = chatsStmt.all(sessionId) as { id: string }[];
  
  const chats: ChatThread[] = [];
  for (const row of chatRows) {
    const chat = loadChat(row.id);
    if (chat) chats.push(chat);
  }
  
  return {
    id: sessionRow.id,
    activeChatId: sessionRow.active_chat_id,
    chats,
    createdAt: sessionRow.created_at,
    updatedAt: sessionRow.updated_at,
  };
}

function saveChat(chat: ChatThread, sessionId: string): void {
  const chatStmt = db.prepare(`
    INSERT OR REPLACE INTO chats (id, session_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  
  chatStmt.run(chat.id, sessionId, chat.title, chat.createdAt, chat.updatedAt);
  
  // Save messages
  for (const message of chat.messages) {
    const msgStmt = db.prepare(`
      INSERT OR REPLACE INTO messages (id, chat_id, role, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    msgStmt.run(message.id, chat.id, message.role, message.content, message.createdAt);
  }
  
  // Save activities
  for (const activity of chat.activities) {
    const actStmt = db.prepare(`
      INSERT OR REPLACE INTO activities (id, chat_id, label, detail, tone, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    actStmt.run(activity.id, chat.id, activity.label, activity.detail, activity.tone, new Date().toISOString());
  }
  
  // Save canvas items
  for (const item of chat.canvasItems) {
    const canvasStmt = db.prepare(`
      INSERT OR REPLACE INTO canvas_items (id, chat_id, kind, data, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    canvasStmt.run(item.id, chat.id, item.kind, JSON.stringify(item), item.createdAt);
  }
  
  // Save turns
  for (const turn of chat.turns) {
    const turnStmt = db.prepare(`
      INSERT OR REPLACE INTO turns (id, chat_id, user_message_id, assistant_message_id, status, started_at, completed_at, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    turnStmt.run(
      turn.id,
      chat.id,
      turn.userMessageId,
      turn.assistantMessageId ?? null,
      turn.status,
      turn.startedAt,
      turn.completedAt || null,
      JSON.stringify(turn),
      turn.startedAt
    );
  }
}

function loadChat(chatId: string): ChatThread | null {
  const chatStmt = db.prepare(`SELECT * FROM chats WHERE id = ?`);
  const chatRow = chatStmt.get(chatId) as { id: string; title: string; created_at: string; updated_at: string } | null;
  
  if (!chatRow) return null;
  
  // Load messages
  const msgStmt = db.prepare(`SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC`);
  const messages = (msgStmt.all(chatId) as { id: string; role: string; content: string; created_at: string }[]).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    createdAt: m.created_at,
  }));
  
  // Load activities
  const actStmt = db.prepare(`SELECT * FROM activities WHERE chat_id = ? ORDER BY created_at DESC`);
  const activities = (actStmt.all(chatId) as { id: string; label: string; detail: string; tone: string }[]).map((a) => ({
    id: a.id,
    label: a.label,
    detail: a.detail,
    tone: a.tone as "neutral" | "live" | "warn",
  }));
  
  // Load canvas items
  const canvasStmt = db.prepare(`SELECT data FROM canvas_items WHERE chat_id = ? ORDER BY created_at DESC`);
  const canvasItems = (canvasStmt.all(chatId) as { data: string }[]).map((c) => JSON.parse(c.data) as CanvasItem);
  
  // Load turns
  const turnStmt = db.prepare(`SELECT data FROM turns WHERE chat_id = ? ORDER BY created_at ASC`);
  const turns = (turnStmt.all(chatId) as { data: string }[]).map((t) => JSON.parse(t.data) as ChatTurn);
  
  return {
    id: chatRow.id,
    title: chatRow.title,
    messages,
    activities,
    canvasItems,
    turns,
    createdAt: chatRow.created_at,
    updatedAt: chatRow.updated_at,
  };
}

export function deleteSession(sessionId: string): void {
  const stmt = db.prepare(`DELETE FROM sessions WHERE id = ?`);
  stmt.run(sessionId);
}
