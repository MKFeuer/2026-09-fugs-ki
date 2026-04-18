import { createActivity, createChat, createSession, snapshotSession, type ActivityItem, type SessionSnapshot, type SessionState } from "../state";
import { getRuntimeModel, type RuntimeConfig } from "../config/models";
import { streamOpenAICompatibleChat, type OpenAIConversationMessage, type OpenAIToolDefinition, type OpenAIToolCall } from "../openai";
import { type CanvasItem, type CanvasMapItem, type CanvasMapPolygon, type CanvasMapLabel, type CanvasMapWind } from "../../shared/canvas";
import { createTurn, summarizeTurn, type ChatTurn, type TurnActionItem } from "../../shared/turn";
import { saveSession, loadSession } from "../db/persistence";
import { createSessionCookieHeader } from "../http/cookies";
import {
  createChartItem,
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

interface ClientCanvasItemRemoveEvent {
  type: "canvas_item_remove";
  chatId: string;
  itemId: string;
}

interface ClientRenameChatEvent {
  type: "rename_chat";
  chatId: string;
  title: string;
}

interface ClientDeleteChatEvent {
  type: "delete_chat";
  chatId: string;
}

type ClientEvent =
  | ClientInitEvent
  | ClientNewChatEvent
  | ClientSwitchChatEvent
  | ClientChatEvent
  | ClientCanvasItemRemoveEvent
  | ClientRenameChatEvent
  | ClientDeleteChatEvent;

type ServerEvent =
  | { type: "ready"; snapshot: SessionSnapshot }
  | { type: "session_state"; snapshot: SessionSnapshot }
  | { type: "turn_started"; chatId: string; turn: ChatTurn }
  | { type: "turn_action_added"; chatId: string; turnId: string; item: TurnActionItem }
  | { type: "turn_completed"; chatId: string; turn: ChatTurn }
  | { type: "activity"; chatId: string; item: ActivityItem }
  | { type: "canvas_item"; chatId: string; item: CanvasItem }
  | { type: "canvas_clear"; chatId: string }
  | { type: "canvas_map_update"; chatId: string; mapId: string; map: CanvasMapItem }
  | { type: "assistant_start"; chatId: string; messageId: string }
  | { type: "assistant_delta"; chatId: string; messageId: string; delta: string }
  | { type: "assistant_done"; chatId: string; messageId: string; content: string }
  | { type: "error"; message: string; detail?: string };

interface ToolExecutionResult {
  summary: string;
  item?: CanvasItem;
  cleared?: boolean;
  action?: TurnActionItem;
  mapContext?: { mapId: string; center: { lat: number; lng: number }; title: string };
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
  chat.canvasItems = [];
  touchChat(chat);
}

function addCanvasItem(chat: SessionState["chats"][number], item: CanvasItem) {
  chat.canvasItems.unshift(item);
  clampCanvasItems(chat);
  touchChat(chat);
  return item;
}

function findActiveMap(chat: SessionState["chats"][number], mapId?: string): CanvasMapItem | null {
  const target = mapId
    ? chat.canvasItems.find((item) => item.kind === "map" && item.id === mapId)
    : chat.canvasItems.find((item) => item.kind === "map"); // unshift = newest first
  return (target as CanvasMapItem) ?? null;
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
    case "canvas_create_chart": {
      const item = addCanvasItem(chat, createChartItem(args));
      const action = createTurnAction("Canvas", `Chart ${item.title} angelegt`, "live");
      send(ws, {
        type: "canvas_item",
        chatId: chat.id,
        item,
      });
      return {
        summary: `Chart "${item.title}" angelegt.`,
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
    case "canvas_map_add_marker": {
      const map = findActiveMap(chat, typeof args.mapId === "string" ? args.mapId : undefined);
      if (!map) {
        const action = createTurnAction("Karte", "Keine Karte gefunden", "warn");
        return { summary: "Keine Karte vorhanden. Bitte erst canvas_create_map aufrufen.", action };
      }
      const markerKinds = ["fire", "hydrant", "water", "vehicle", "point"] as const;
      const kind = markerKinds.includes(String(args.kind) as (typeof markerKinds)[number])
        ? (args.kind as (typeof markerKinds)[number])
        : "point";
      const marker = {
        id: crypto.randomUUID(),
        label: String(args.label ?? "Marker"),
        kind,
        point: { lat: Number(args.lat ?? map.center.lat), lng: Number(args.lng ?? map.center.lng) },
        flowRateLpm: typeof args.flowRateLpm === "number" && Number.isFinite(args.flowRateLpm)
          ? args.flowRateLpm
          : typeof args.flowRateLpm === "string" && Number.isFinite(Number(args.flowRateLpm))
            ? Number(args.flowRateLpm)
            : undefined,
        flowRateEstimated: typeof args.flowRateEstimated === "boolean" ? args.flowRateEstimated : undefined,
        note: args.note ? String(args.note) : undefined,
      };
      map.markers.push(marker);
      touchChat(chat);
      send(ws, { type: "canvas_map_update", chatId: chat.id, mapId: map.id, map });
      const action = createTurnAction("Karte", `Marker „${marker.label}" (${kind}) gesetzt`, "live");
      return {
        summary: `Marker „${marker.label}" (${kind}) bei ${marker.point.lat.toFixed(5)}, ${marker.point.lng.toFixed(5)} eingetragen.`,
        action,
        mapContext: { mapId: map.id, center: map.center, title: map.title },
      };
    }

    case "canvas_map_add_area": {
      const map = findActiveMap(chat, typeof args.mapId === "string" ? args.mapId : undefined);
      if (!map) {
        const action = createTurnAction("Karte", "Keine Karte gefunden", "warn");
        return { summary: "Keine Karte vorhanden.", action };
      }
      const area = {
        id: crypto.randomUUID(),
        label: String(args.label ?? "Bereich"),
        center: { lat: Number(args.lat ?? 0), lng: Number(args.lng ?? 0) },
        radiusMeters: Number(args.radiusMeters ?? 100),
        color: args.color ? String(args.color) : undefined,
      };
      map.areas.push(area);
      touchChat(chat);
      send(ws, { type: "canvas_map_update", chatId: chat.id, mapId: map.id, map });
      const action = createTurnAction("Karte", `Bereich „${area.label}" (${area.radiusMeters}m) eingezeichnet`, "live");
      return {
        summary: `Bereich „${area.label}" mit Radius ${area.radiusMeters}m eingezeichnet.`,
        action,
        mapContext: { mapId: map.id, center: map.center, title: map.title },
      };
    }

    case "canvas_map_add_route": {
      const map = findActiveMap(chat, typeof args.mapId === "string" ? args.mapId : undefined);
      if (!map) {
        const action = createTurnAction("Karte", "Keine Karte gefunden", "warn");
        return { summary: "Keine Karte vorhanden.", action };
      }
      const points = Array.isArray(args.points)
        ? (args.points as Array<Record<string, unknown>>).map((p) => ({ lat: Number(p.lat ?? 0), lng: Number(p.lng ?? 0) }))
        : [];
      const route = {
        id: crypto.randomUUID(),
        name: String(args.name ?? "Route"),
        description: String(args.description ?? ""),
        points,
        color: args.color ? String(args.color) : undefined,
      };
      map.routes.push(route);
      touchChat(chat);
      send(ws, { type: "canvas_map_update", chatId: chat.id, mapId: map.id, map });
      const action = createTurnAction("Karte", `Route „${route.name}" (${points.length} Punkte) eingezeichnet`, "live");
      return {
        summary: `Route „${route.name}" mit ${points.length} Punkten eingezeichnet.`,
        action,
        mapContext: { mapId: map.id, center: map.center, title: map.title },
      };
    }

    case "canvas_map_add_polygon": {
      const map = findActiveMap(chat, typeof args.mapId === "string" ? args.mapId : undefined);
      if (!map) return { summary: "Keine Karte gefunden.", action: createTurnAction("Karte", "Keine Karte vorhanden", "warn") };
      if (!map.polygons) map.polygons = [];
      const points = Array.isArray(args.points)
        ? (args.points as Array<Record<string, unknown>>).map((p) => ({ lat: Number(p.lat ?? 0), lng: Number(p.lng ?? 0) }))
        : [];
      const polygon: CanvasMapPolygon = {
        id: crypto.randomUUID(),
        label: String(args.label ?? "Bereich"),
        points,
        color: args.color ? String(args.color) : undefined,
        fillOpacity: args.fillOpacity ? Number(args.fillOpacity) : undefined,
      };
      map.polygons.push(polygon);
      touchChat(chat);
      send(ws, { type: "canvas_map_update", chatId: chat.id, mapId: map.id, map });
      const action = createTurnAction("Karte", `Polygon „${polygon.label}" (${points.length} Punkte) eingezeichnet`, "live");
      return { summary: `Polygon „${polygon.label}" mit ${points.length} Punkten eingezeichnet.`, action };
    }

    case "canvas_map_add_label": {
      const map = findActiveMap(chat, typeof args.mapId === "string" ? args.mapId : undefined);
      if (!map) return { summary: "Keine Karte gefunden.", action: createTurnAction("Karte", "Keine Karte vorhanden", "warn") };
      if (!map.labels) map.labels = [];
      const label: CanvasMapLabel = {
        id: crypto.randomUUID(),
        text: String(args.text ?? "Label"),
        lat: Number(args.lat ?? 0),
        lng: Number(args.lng ?? 0),
        size: (["sm", "md", "lg"].includes(String(args.size)) ? args.size : "md") as CanvasMapLabel["size"],
      };
      map.labels.push(label);
      touchChat(chat);
      send(ws, { type: "canvas_map_update", chatId: chat.id, mapId: map.id, map });
      const action = createTurnAction("Karte", `Beschriftung „${label.text}" gesetzt`, "live");
      return { summary: `Beschriftung „${label.text}" auf Karte gesetzt.`, action };
    }

    case "canvas_map_add_wind": {
      const map = findActiveMap(chat, typeof args.mapId === "string" ? args.mapId : undefined);
      if (!map) return { summary: "Keine Karte gefunden.", action: createTurnAction("Karte", "Keine Karte vorhanden", "warn") };
      if (!map.winds) map.winds = [];
      const wind: CanvasMapWind = {
        id: crypto.randomUUID(),
        lat: Number(args.lat ?? 0),
        lng: Number(args.lng ?? 0),
        directionDeg: Number(args.directionDeg ?? 0),
        speedKmh: args.speedKmh ? Number(args.speedKmh) : undefined,
        label: args.label ? String(args.label) : undefined,
      };
      map.winds.push(wind);
      touchChat(chat);
      send(ws, { type: "canvas_map_update", chatId: chat.id, mapId: map.id, map });
      const dir = wind.directionDeg;
      const compass = ["N","NO","O","SO","S","SW","W","NW"][Math.round(dir / 45) % 8];
      const action = createTurnAction("Karte", `Windpfeil ${compass} (${dir}°)${wind.speedKmh ? ` · ${wind.speedKmh} km/h` : ""} gesetzt`, "live");
      return { summary: `Windpfeil: ${dir}° (${compass})${wind.speedKmh ? `, ${wind.speedKmh} km/h` : ""}.`, action };
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
            ? JSON.stringify(result.result)
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
        name: "canvas_create_chart",
        description: "Erstellt ein Zahlen-Chart auf dem Canvas, z.B. Balken-, Linien-, Flächen- oder XY-Darstellungen.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", description: "Kurzer Titel des Charts" },
            summary: { type: "string", description: "Einzeilige Zusammenfassung" },
            chartType: {
              type: "string",
              enum: ["bar", "line", "area", "scatter"],
              description: "Darstellungsart des Charts",
            },
            xLabels: {
              type: "array",
              description: "X-Achsenwerte oder Labels in Reihenfolge, z.B. Zeiten, Distanzen oder Kategorien.",
              minItems: 1,
              items: { type: "string" },
            },
            xUnit: { type: "string", description: "Optionale Einheit der X-Achse, z.B. min, m, km, Uhrzeit" },
            yUnit: { type: "string", description: "Optionale Einheit der Y-Achse, z.B. l/min, °C, Personen" },
            series: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string", description: "Name der Serie" },
                  color: { type: "string", description: "Optionale Hex-Farbe, z.B. #2563eb" },
                  values: {
                    type: "array",
                    minItems: 1,
                    items: { type: "number" },
                  },
                },
                required: ["label", "values"],
              },
            },
          },
          required: ["title", "summary", "chartType", "xLabels", "series"],
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
                  flowRateLpm: { type: "number", description: "Nur für Hydranten: Durchfluss in Litern pro Minute" },
                  flowRateEstimated: { type: "boolean", description: "Nur für Hydranten: true, wenn der Wert geschätzt ist" },
                  note: { type: "string", description: "Zusatzinfo für Hover, z.B. DN, Zustand oder kurze Taktiknotiz" },
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
    {
      type: "function",
      function: {
        name: "canvas_map_add_marker",
        description: "Fügt einen Marker zu einer bestehenden Karte hinzu. Nutze stets präzise WGS84-Koordinaten (z.B. vom Geocoding-Tool). Beim ersten Aufruf ohne mapId wird die neueste Karte verwendet.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            mapId: { type: "string", description: "ID der Zielkarte – weglassen für neueste Karte im Chat" },
            label: { type: "string", description: "Kurzbezeichnung des Markers, z.B. 'Hydrant 3' oder 'Brandstelle'" },
            kind: { type: "string", enum: ["fire", "hydrant", "water", "vehicle", "point"], description: "fire=Brandstelle, hydrant=Hydrant, water=Wasserentnahme, vehicle=Fahrzeug, point=sonstiger Punkt" },
            lat: { type: "number", description: "Breitengrad WGS84, z.B. 48.13743" },
            lng: { type: "number", description: "Längengrad WGS84, z.B. 11.57549" },
            flowRateLpm: { type: "number", description: "Nur für Hydranten: Durchfluss in Litern pro Minute, idealerweise aus analyze_hydrants()" },
            flowRateEstimated: { type: "boolean", description: "Nur für Hydranten: true setzen, wenn der Durchfluss laut OSM/MCP nur geschätzt ist" },
            note: { type: "string", description: "Typ-spezifische Kurzinfo die beim Hovern erscheint. Hydrant→'DN100, Unterflur', Fahrzeug→'HLF20, Bereit', Brandstelle→'EG Westflügel, Vollbrand', Wasser→'Zisterne 20m³'" },
          },
          required: ["label", "kind", "lat", "lng"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canvas_map_add_area",
        description: "Zeichnet einen Kreisbereich auf die Karte (Sperrzone, Einsatzbereich, Wasserentnahmezone, Gefahrenbereich).",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            mapId: { type: "string", description: "ID der Zielkarte – weglassen für neueste Karte" },
            label: { type: "string", description: "Bezeichnung des Bereichs" },
            lat: { type: "number", description: "Mittelpunkt Breitengrad WGS84" },
            lng: { type: "number", description: "Mittelpunkt Längengrad WGS84" },
            radiusMeters: { type: "number", description: "Radius in Metern" },
            color: { type: "string", description: "Hex-Farbe, z.B. #ff0000 für Sperrzone" },
          },
          required: ["label", "lat", "lng", "radiusMeters"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canvas_map_add_route",
        description: "Zeichnet eine Pendelroute, Zufahrt oder Rückzugsweg auf die Karte. Mindestens 2 Punkte mit präzisen Koordinaten.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            mapId: { type: "string", description: "ID der Zielkarte – weglassen für neueste Karte" },
            name: { type: "string", description: "Name der Route, z.B. 'Pendelroute A'" },
            description: { type: "string", description: "Kurzbeschreibung: von wo nach wo, Zweck" },
            points: {
              type: "array",
              minItems: 2,
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
            color: { type: "string", description: "Hex-Farbe, z.B. #3b82f6 für blau" },
          },
          required: ["name", "description", "points"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canvas_map_add_polygon",
        description: "Zeichnet eine unregelmäßige Fläche auf die Karte (Gebäudegrundriss, Waldbrand-Perimeter, Evakuierungszone, Einsatzabschnitt). Mindestens 3 Punkte.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            mapId: { type: "string", description: "ID der Zielkarte – weglassen für neueste Karte" },
            label: { type: "string", description: "Bezeichnung der Fläche, z.B. 'Evakuierungszone A'" },
            points: {
              type: "array",
              minItems: 3,
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
            color: { type: "string", description: "Hex-Farbe, z.B. #ef4444 (rot) für Sperrzone, #f59e0b (orange) für Gefahrenbereich" },
            fillOpacity: { type: "number", description: "Füll-Transparenz 0–1, Standard 0.15" },
          },
          required: ["label", "points"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canvas_map_add_label",
        description: "Setzt eine freie Textbeschriftung an einem Kartenpunkt (Sammelpunkt, Triage-Bereich, Bereitstellungsraum, Abschnittsname). Kein Symbol, nur Text.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            mapId: { type: "string", description: "ID der Zielkarte – weglassen für neueste Karte" },
            text: { type: "string", description: "Beschriftungstext, kurz halten (max ~20 Zeichen)" },
            lat: { type: "number", description: "Breitengrad WGS84" },
            lng: { type: "number", description: "Längengrad WGS84" },
            size: { type: "string", enum: ["sm", "md", "lg"], description: "Schriftgröße: sm=klein, md=mittel (Standard), lg=groß" },
          },
          required: ["text", "lat", "lng"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "canvas_map_add_wind",
        description: "Setzt einen Windpfeil auf die Karte. Zeigt Windrichtung und Stärke an – wichtig für Rauchausbreitung, Gefahrstoffe, Löschmitteleinsatz.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            mapId: { type: "string", description: "ID der Zielkarte – weglassen für neueste Karte" },
            lat: { type: "number", description: "Position Breitengrad WGS84" },
            lng: { type: "number", description: "Position Längengrad WGS84" },
            directionDeg: { type: "number", description: "Richtung wohin der Wind WEHT in Grad (0=N, 90=O, 180=S, 270=W). Beispiel: Wind aus SW der Richtung NO weht → 45°" },
            speedKmh: { type: "number", description: "Windgeschwindigkeit in km/h" },
            label: { type: "string", description: "Optionales Kürzel, z.B. 'SW 15km/h'" },
          },
          required: ["lat", "lng", "directionDeg"],
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

  const mcpToolList = getToolRegistry();
  const mcpSection =
    mcpToolList.length > 0
      ? `\n\nExterne Tools (${mcpToolList.length} verfügbar — rufe diese aktiv auf wenn passend):\n${mcpToolList.map((t) => `- ${t.function.name}: ${t.function.description}`).join("\n")}`
      : "";

  const conversation: OpenAIConversationMessage[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n\nCanvas-Tools:\n- canvas_create_map: Karte anlegen mit Zentrum, Zoom, initialen Markern/Bereichen/Routen\n- canvas_map_add_marker: Einzelnen Marker zur bestehenden Karte hinzufügen (label, kind, lat, lng) – bevorzuge dieses Tool für schrittweisen Aufbau\n- canvas_map_add_area: Kreisbereich einzeichnen (Sperrzone, Gefahrenbereich, Wasserentnahme)\n- canvas_map_add_route: Pendelroute oder Zufahrt einzeichnen (mind. 2 Punkte)\n- canvas_map_add_polygon: Unregelmäßige Fläche (Evakuierungszone, Gebäude, Abschnitt, Perimeter)\n- canvas_map_add_label: Freier Textpunkt (Sammelpunkt, Triage, Bereitstellungsraum)\n- canvas_map_add_wind: Windpfeil mit Richtung und Geschwindigkeit\n- canvas_create_diagram: Strukturdiagramme (flow, radial, timeline, matrix)\n- canvas_create_chart: Zahlenreihen als Balken-, Linien-, Flächen- oder XY-Chart\n- canvas_add_image: Bildplatzhalter\n- canvas_add_note: Textnotiz\n- canvas_clear: Canvas leeren\n\nKarten-Workflow für Lagebilder:\n1. canvas_create_map mit Einsatzort als Zentrum (centerLat/centerLng)\n2. Dann canvas_map_add_marker für jeden Punkt (Brandstelle, Hydranten, Fahrzeuge) – jeder Marker MUSS andere lat/lng haben\n3. Für Hydranten möglichst zuerst analyze_hydrants nutzen und den ermittelten Durchfluss in flowRateLpm übernehmen\n4. canvas_map_add_area für Sperrzonen\n5. canvas_map_add_route für Pendelrouten\n\nKOORDINATEN-REGELN:\n- Jeder Marker braucht eindeutige lat/lng – niemals zwei Marker mit identischen Koordinaten\n- Das Tool gibt nach jedem Aufruf mapContext.center zurück – nutze diese Kartenmitte als Basis\n- Wenn keine exakte Adresse bekannt: Offset vom Zentrum schätzen (±0.0001–0.002 Grad ≈ 10–200m)\n- Beispiel: Zentrum 48.1374, 11.5755 → Hydrant Nord: 48.1384, 11.5755 | Hydrant Ost: 48.1374, 11.5775\n- Nutze Geocoding-Tools für echte Adressen wenn vorhanden\n- Wenn analyze_hydrants einen Hydranten liefert, übernimm Flow rate in flowRateLpm und setze flowRateEstimated=true, falls der MCP-Output den Wert als geschätzt markiert${mcpSection}`,
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

    const finalContent = assistantContent.trim() || "Canvas-Aktionen wurden ausgeführt.";

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

      if (event.type === "canvas_item_remove") {
        const chat = getChat(ws.data.session, event.chatId);
        chat.canvasItems = chat.canvasItems.filter((item) => item.id !== event.itemId);
        touchChat(chat);
        ws.data.session.updatedAt = chat.updatedAt;
        emitSnapshot(ws);
        return;
      }

      if (event.type === "rename_chat") {
        const chat = ws.data.session.chats.find((c) => c.id === event.chatId);
        if (chat && event.title.trim()) {
          chat.title = event.title.trim().slice(0, 60);
          touchChat(chat);
          ws.data.session.updatedAt = chat.updatedAt;
          persistSessionAsync(ws.data.session);
        }
        return;
      }

      if (event.type === "delete_chat") {
        const session = ws.data.session;
        if (session.chats.length <= 1) return;
        session.chats = session.chats.filter((c) => c.id !== event.chatId);
        if (session.activeChatId === event.chatId) {
          session.activeChatId = session.chats[0].id;
        }
        session.updatedAt = new Date().toISOString();
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
