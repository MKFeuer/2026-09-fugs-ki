import { createActivity, createChat, createSession, snapshotSession, type ActivityItem, type SessionSnapshot, type SessionState } from "../state";
import { getRuntimeModel, type RuntimeConfig } from "../config/models";
import { streamOpenAICompatibleChat, type OpenAIConversationMessage, type OpenAIToolDefinition, type OpenAIToolCall } from "../openai";
import { createCanvasNote, type CanvasItem } from "../../shared/canvas";
import { createTurn, summarizeTurn, type ChatTurn, type TurnActionItem } from "../../shared/turn";
import { saveSession, loadSession } from "../db/persistence";
import { createSessionCookieHeader } from "../http/cookies";
import {
  createDiagramItem,
  createImageItem,
  createMapItem,
  createNoteItem,
  parseToolArguments,
} from "../services/canvas";
import { callMCPTool, getServerTools, type MCPToolCall } from "../services/mcp";
import { getToolRegistry } from "../config/tools";

export interface ConnectionState {
  modelId: string;
  runtimeConfig: RuntimeConfig;
  session: SessionState;
  status: SessionSnapshot["status"];
  controller?: AbortController;
}

interface ClientInitEvent {
  type: "init";
  model: string;
  sessionId?: string;
}

interface ClientNewChatEvent {
  type: "new_chat";
}

interface ClientSwitchChatEvent {
  type: "switch_chat";
  chatId: string;
}

interface ClientChatEvent {
  type: "chat";
  chatId: string;
  messageId: string;
  text: string;
}

type ClientEvent = ClientInitEvent | ClientNewChatEvent | ClientSwitchChatEvent | ClientChatEvent;

type ServerEvent =
  | { type: "ready"; snapshot: SessionSnapshot }
  | { type: "session_state"; snapshot: SessionSnapshot }
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

interface ToolExecutionResult {
  summary: string;
  item?: CanvasItem;
  cleared?: boolean;
  action?: TurnActionItem;
}

const sessions = new Map<string, SessionState>();
const MAX_TOOL_ROUNDS = 3;
const MAX_CANVAS_ITEMS = 12;
const systemPromptPath = new URL("../../system-prompt.md", import.meta.url);
const SYSTEM_PROMPT = await Bun.file(systemPromptPath).text();

function send(ws: Bun.ServerWebSocket<ConnectionState>, event: ServerEvent) {
  ws.send(JSON.stringify(event));
}

function getChat(session: SessionState, chatId: string) {
  const chat = session.chats.find((entry) => entry.id === chatId);
  if (!chat) throw new Error("Chat not found");
  return chat;
}

function emitSnapshot(ws: Bun.ServerWebSocket<ConnectionState>) {
  const data = ws.data;
  const model = getRuntimeModel(data.runtimeConfig, data.modelId);
  send(ws, {
    type: "session_state",
    snapshot: snapshotSession(data.session, data.status, model.label),
  });
  // Persist session after every state change
  persistSessionAsync(data.session);
}

function persistSessionAsync(session: SessionState) {
  // Non-blocking save to database
  Promise.resolve().then(() => {
    try {
      saveSession(session);
    } catch (error) {
      console.error("Failed to persist session:", error);
    }
  });
}

function clampCanvasItems(chat: SessionState["chats"][number]) {
  if (chat.canvasItems.length > MAX_CANVAS_ITEMS) {
    chat.canvasItems.splice(MAX_CANVAS_ITEMS);
  }
}

function touchChat(chat: SessionState["chats"][number]) {
  chat.updatedAt = new Date().toISOString();
}

function createTurnAction(label: string, detail: string, tone: TurnActionItem["tone"] = "neutral"): TurnActionItem {
  return {
    id: crypto.randomUUID(),
    label,
    detail,
    tone,
    createdAt: new Date().toISOString(),
  };
}

function getLatestTurn(chat: SessionState["chats"][number]) {
  return chat.turns[chat.turns.length - 1] ?? null;
}

function addTurn(chat: SessionState["chats"][number], userMessageId: string, assistantMessageId: string) {
  const turn = createTurn(chat.id, userMessageId, assistantMessageId);
  chat.turns.push(turn);
  return turn;
}

function appendTurnAction(chat: SessionState["chats"][number], turnId: string, action: TurnActionItem) {
  const turn = chat.turns.find((entry) => entry.id === turnId);
  if (!turn) throw new Error("Turn not found");
  turn.actionItems.push(action);
  turn.actionSummary = summarizeTurn(turn);
  return turn;
}

function clearCanvas(chat: SessionState["chats"][number]) {
  chat.canvasItems = [
    createCanvasNote(
      "Canvas bereit",
      "Noch keine Lagekarten vorhanden",
      "Hier legt der Agent später Diagramme, Karten und Bilder ab.",
    ),
  ];
}

function addCanvasItem(chat: SessionState["chats"][number], item: CanvasItem) {
  chat.canvasItems.unshift(item);
  clampCanvasItems(chat);
  touchChat(chat);
  return item;
}

async function executeToolCall(
  ws: Bun.ServerWebSocket<ConnectionState>,
  chat: SessionState["chats"][number],
  turnId: string,
  toolCall: OpenAIToolCall,
): Promise<ToolExecutionResult> {
  const args = parseToolArguments(toolCall.arguments);

  switch (toolCall.name) {
    case "canvas_create_diagram": {
      const item = addCanvasItem(chat, createDiagramItem(args));
      const action = createTurnAction("Canvas", `Diagramm ${item.title} angelegt`, "live");
      send(ws, {
        type: "canvas_item",
        chatId: chat.id,
        item,
      });
      return {
        summary: `Diagramm "${item.title}" angelegt.`,
        item,
        action,
      };
    }
    case "canvas_add_image": {
      const item = addCanvasItem(chat, createImageItem(args));
      const action = createTurnAction("Canvas", `Bild ${item.title} angelegt`, "live");
      send(ws, {
        type: "canvas_item",
        chatId: chat.id,
        item,
      });
      return {
        summary: `Bild "${item.title}" angelegt.`,
        item,
        action,
      };
    }
    case "canvas_create_map": {
      const item = addCanvasItem(chat, createMapItem(args));
      const action = createTurnAction("Canvas", `Karte ${item.title} angelegt`, "live");
      send(ws, {
        type: "canvas_item",
        chatId: chat.id,
        item,
      });
      return {
        summary: `Lageplan "${item.title}" angelegt.`,
        item,
        action,
      };
    }
    case "canvas_add_note": {
      const item = addCanvasItem(chat, createNoteItem(args));
      const action = createTurnAction("Canvas", `Notiz ${item.title} angelegt`, "live");
      send(ws, {
        type: "canvas_item",
        chatId: chat.id,
        item,
      });
      return {
        summary: `Notiz "${item.title}" angelegt.`,
        item,
        action,
      };
    }
    case "canvas_clear": {
      clearCanvas(chat);
      const action = createTurnAction("Canvas", "Canvas geleert", "warn");
      send(ws, {
        type: "canvas_clear",
        chatId: chat.id,
      });
      return {
        summary: "Canvas geleert.",
        cleared: true,
        action,
      };
    }
    default: {
      // Try to call external MCP tools
      try {
        // Determine which server has this tool
        const allTools = getToolRegistry();
        const tool = allTools.find((t) => t.function.name === toolCall.name);

        if (!tool) {
          throw new Error(`Unbekanntes Tool: ${toolCall.name}`);
        }

        // Find the server that has this tool
        let serverLabel = "";
        for (const server of ["tools", "commandx"]) {
          const serverTools = getServerTools(server);
          if (serverTools.some((t) => t.name === toolCall.name)) {
            serverLabel = server;
            break;
          }
        }

        if (!serverLabel) {
          throw new Error(`Konnte Server für Tool ${toolCall.name} nicht finden`);
        }

        const mcpCall: MCPToolCall = {
          toolName: toolCall.name,
          serverLabel,
          input: parseToolArguments(toolCall.arguments),
        };

        const result = await callMCPTool(mcpCall);
        const action = createTurnAction(
          "Tool",
          `${toolCall.name}: ${result.success ? "erfolgreich" : "fehlgeschlagen"}`,
          result.success ? "live" : "warn",
        );

        return {
          summary: result.success
            ? `Tool ${toolCall.name} erfolgreich ausgeführt (${result.duration}ms)`
            : `Tool ${toolCall.name} fehlgeschlagen: ${result.error}`,
          action,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const action = createTurnAction("Tool", `Fehler: ${errorMsg}`, "warn");
        return {
          summary: `Tool-Fehler: ${errorMsg}`,
          action,
        };
      }
    }
  }
}

function canvasTools(): OpenAIToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "canvas_create_diagram",
        description: "Erstellt ein Diagramm mit Knoten und Verbindungen auf dem Canvas.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", description: "Kurzer Titel des Diagramms" },
            summary: { type: "string", description: "Einzeilige Zusammenfassung" },
            layout: {
              type: "string",
              enum: ["flow", "radial", "timeline", "matrix"],
              description: "Darstellungsart des Diagramms",
            },
            nodes: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  detail: { type: "string" },
                },
                required: ["id", "label"],
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  label: { type: "string" },
                },
                required: ["from", "to"],
              },
            },
          },
          required: ["title", "summary", "layout", "nodes", "edges"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canvas_add_image",
        description: "Legt ein vorhandenes Bild oder einen Bildplatzhalter auf dem Canvas ab. Keine Bildgenerierung.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            sourceUrl: { type: "string", description: "Optional: vorhandene Bild-URL" },
            altText: { type: "string" },
            caption: { type: "string" },
          },
          required: ["title", "summary", "altText"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canvas_create_map",
        description: "Erstellt einen OSM-basierten Lageplan mit Zentrum, Layern, Legende, Markern, Bereichen und optionalen Routen.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            centerLabel: { type: "string" },
            centerLat: { type: "number" },
            centerLng: { type: "number" },
            zoom: { type: "number" },
            layers: {
              type: "array",
              items: { type: "string" },
            },
            legend: {
              type: "array",
              items: { type: "string" },
            },
            markers: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  kind: {
                    type: "string",
                    enum: ["fire", "hydrant", "water", "vehicle", "point"],
                  },
                  lat: { type: "number" },
                  lng: { type: "number" },
                  note: { type: "string" },
                },
                required: ["label", "kind", "lat", "lng"],
              },
            },
            areas: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  lat: { type: "number" },
                  lng: { type: "number" },
                  radiusMeters: { type: "number" },
                  color: { type: "string" },
                },
                required: ["label", "lat", "lng", "radiusMeters"],
              },
            },
            routes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  description: { type: "string" },
                  color: { type: "string" },
                  points: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        lat: { type: "number" },
                        lng: { type: "number" },
                      },
                      required: ["lat", "lng"],
                    },
                  },
                },
                required: ["name", "description", "points"],
              },
            },
          },
          required: ["title", "summary", "centerLabel", "centerLat", "centerLng", "zoom", "layers", "legend", "markers", "areas", "routes"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canvas_add_note",
        description: "Legt eine kurze Textnotiz auf dem Canvas ab.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            text: { type: "string" },
          },
          required: ["title", "summary", "text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canvas_clear",
        description: "Leert den Canvas-Bereich und setzt ihn auf den Grundzustand zurück.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            reason: { type: "string" },
          },
        },
      },
    },
  ];
}

function getAllTools(): OpenAIToolDefinition[] {
  const tools = [...canvasTools()];
  const mcpTools = getToolRegistry();
  tools.push(...mcpTools);
  return tools;
}

async function handleChat(ws: Bun.ServerWebSocket<ConnectionState>, event: ClientChatEvent) {
  const { session, runtimeConfig } = ws.data;
  const model = getRuntimeModel(runtimeConfig, ws.data.modelId);
  const chat = getChat(session, event.chatId);
  const assistantMessageId = crypto.randomUUID();
  const controller = new AbortController();
  ws.data.controller = controller;
  ws.data.status = "streaming";
  const usedTools: string[] = [];
  const turn = addTurn(chat, event.messageId, assistantMessageId);
  turn.userContent = event.text;

  chat.messages.push({
    id: event.messageId,
    role: "user",
    content: event.text,
    createdAt: new Date().toISOString(),
  });
  chat.activities.unshift(createActivity("Nachricht empfangen", event.text.slice(0, 120)));
  touchChat(chat);
  session.updatedAt = chat.updatedAt;

  send(ws, {
    type: "turn_started",
    chatId: chat.id,
    turn,
  });

  send(ws, {
    type: "activity",
    chatId: chat.id,
    item: createActivity("Denkt nach", "Lage wird analysiert und Werkzeuge werden vorbereitet.", "live"),
  });
  send(ws, {
    type: "turn_action_added",
    chatId: chat.id,
    turnId: turn.id,
    item: appendTurnAction(chat, turn.id, createTurnAction("Analyse", "Lage wird vorbereitet", "live")).actionItems.at(-1)!,
  });
  send(ws, {
    type: "assistant_start",
    chatId: chat.id,
    messageId: assistantMessageId,
  });

  const conversation: OpenAIConversationMessage[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nCanvas-Tools:\n- canvas_create_diagram: Diagramme mit Knoten/Verbindungen, Layouts: flow, radial, timeline, matrix\n- canvas_add_image: vorhandene Bilder oder Bildplatzhalter ablegen\n- canvas_create_map: Lageplan mit Zentrum, Layern, Legende und Routen\n- canvas_add_note: kurze Canvas-Notiz\n- canvas_clear: Canvas leeren\n\nNutze die Tools aktiv, wenn du Diagramme, Karten, Bilder oder Planungsartefakte ablegen willst.`,
    },
    ...chat.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  let assistantContent = "";

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      send(ws, {
        type: "activity",
        chatId: chat.id,
        item: createActivity(
          round === 0 ? "Planung" : "Weiterdenken",
          round === 0 ? "Erste Antwort und mögliche Canvas-Aktionen werden vorbereitet." : "Tool-Ergebnisse werden ausgewertet.",
          "live",
        ),
      });
      send(ws, {
        type: "turn_action_added",
        chatId: chat.id,
        turnId: turn.id,
        item: appendTurnAction(
          chat,
          turn.id,
          createTurnAction(
            round === 0 ? "Planung" : "Weiterdenken",
            round === 0 ? "Antwort und Schritte vorbereitet" : "Tool-Ergebnisse ausgewertet",
            "live",
          ),
        ).actionItems.at(-1)!,
      });

      const result = await streamOpenAICompatibleChat({
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        model: model.model,
        messages: conversation,
        tools: getAllTools(),
        signal: controller.signal,
        onContentDelta: (delta) => {
          assistantContent += delta;
          send(ws, {
            type: "assistant_delta",
            chatId: chat.id,
            messageId: assistantMessageId,
            delta,
          });
        },
      });

      if (result.toolCalls.length === 0) {
        break;
      }

      conversation.push({
        role: "assistant",
        content: result.content,
        tool_calls: result.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          type: "function",
          function: {
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
        })),
      });

      for (const toolCall of result.toolCalls) {
        usedTools.push(toolCall.name);
        send(ws, {
          type: "activity",
          chatId: chat.id,
          item: createActivity("Tool", toolCall.name, "live"),
        });
        send(ws, {
          type: "turn_action_added",
          chatId: chat.id,
          turnId: turn.id,
          item: appendTurnAction(chat, turn.id, createTurnAction("Tool", toolCall.name, "live")).actionItems.at(-1)!,
        });

        const execution = await executeToolCall(ws, chat, turn.id, toolCall);
        if (execution.action) {
          send(ws, {
            type: "turn_action_added",
            chatId: chat.id,
            turnId: turn.id,
            item: appendTurnAction(chat, turn.id, execution.action).actionItems.at(-1)!,
          });
        }
        chat.activities.unshift(createActivity("Canvas aktualisiert", execution.summary, "live"));
        send(ws, {
          type: "activity",
          chatId: chat.id,
          item: createActivity("Ergebnis", execution.summary, "live"),
        });

        conversation.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(execution),
        });
      }

      touchChat(chat);
      session.updatedAt = chat.updatedAt;
      send(ws, {
        type: "session_state",
        snapshot: snapshotSession(session, ws.data.status, model.label),
      });

      if (result.finishReason !== "tool_calls") {
        break;
      }
    }

    const toolSummary = usedTools.length > 0 ? `\nVerwendete Tools: ${[...new Set(usedTools)].join(", ")}` : "";
    const finalContent = `${assistantContent.trim() || "Canvas-Aktionen wurden ausgeführt."}${toolSummary}`;

    chat.messages.push({
      id: assistantMessageId,
      role: "assistant",
      content: finalContent,
      createdAt: new Date().toISOString(),
    });
    turn.assistantContent = finalContent;
    turn.status = "settled";
    turn.completedAt = new Date().toISOString();
    turn.actionSummary = summarizeTurn(turn);
    send(ws, {
      type: "turn_completed",
      chatId: chat.id,
      turn,
    });
    chat.activities.unshift(createActivity("Antwort fertig", finalContent.slice(0, 120), "live"));
    touchChat(chat);
    session.updatedAt = chat.updatedAt;
    ws.data.status = "ready";
    send(ws, {
      type: "assistant_done",
      chatId: chat.id,
      messageId: assistantMessageId,
      content: finalContent,
    });
    emitSnapshot(ws);
  } catch (error) {
    ws.data.status = "error";
    turn.status = "failed";
    turn.completedAt = new Date().toISOString();
    turn.actionSummary = summarizeTurn(turn);
    send(ws, {
      type: "turn_completed",
      chatId: chat.id,
      turn,
    });
    send(ws, {
      type: "error",
      message: "LLM Antwort fehlgeschlagen.",
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    ws.data.controller = undefined;
  }
}

export function createWebSocketHandlers(runtimeConfig: RuntimeConfig) {
  return {
    open() {},
    async message(ws: Bun.ServerWebSocket<ConnectionState>, raw: string | ArrayBuffer | Uint8Array) {
      const event = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)) as ClientEvent;

      if (event.type === "init") {
        let session = event.sessionId ? sessions.get(event.sessionId) : undefined;
        
        // Try to load from database if not in memory
        if (!session && event.sessionId) {
          try {
            const dbSession = loadSession(event.sessionId);
            if (dbSession) {
              session = dbSession;
            }
          } catch (error) {
            console.error("Failed to load session from database:", error);
          }
        }
        
        // Fall back to creating a new session
        if (!session) {
          session = createSession(event.sessionId);
        }
        
        const selectedModel = getRuntimeModel(runtimeConfig, event.model);

        sessions.set(session.id, session);
        ws.data = {
          modelId: selectedModel.id,
          runtimeConfig,
          session,
          status: "ready",
        };
        
        const headers = new Headers();
        headers.set("Set-Cookie", createSessionCookieHeader(session.id));
        
        send(ws, {
          type: "ready",
          snapshot: snapshotSession(session, "ready", selectedModel.label),
        });
        return;
      }

      if (!ws.data?.session) {
        throw new Error("WebSocket not initialized.");
      }

      if (event.type === "new_chat") {
        const chat = createChat();
        ws.data.session.chats.unshift(chat);
        ws.data.session.activeChatId = chat.id;
        touchChat(chat);
        ws.data.session.updatedAt = new Date().toISOString();
        emitSnapshot(ws);
        return;
      }

      if (event.type === "switch_chat") {
        const chat = getChat(ws.data.session, event.chatId);
        ws.data.session.activeChatId = chat.id;
        ws.data.session.updatedAt = new Date().toISOString();
        emitSnapshot(ws);
        return;
      }

      if (event.type === "chat") {
        if (ws.data.controller) {
          ws.data.controller.abort();
        }
        ws.data.session.activeChatId = event.chatId;
        await handleChat(ws, event);
      }
    },
    close(ws: Bun.ServerWebSocket<ConnectionState>) {
      ws.data.controller?.abort();
    },
  };
}
