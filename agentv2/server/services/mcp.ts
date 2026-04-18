// MCP Client using JSON-RPC 2.0 over StreamableHTTP (FastMCP compatible)
// Endpoint: POST /mcp — sessions managed via mcp-session-id header

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolCall {
  toolName: string;
  serverLabel: string;
  input: Record<string, any>;
}

export interface MCPToolResult {
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
}

export interface MCPServerStatus {
  label: string;
  url: string;
  connected: boolean;
  toolCount: number;
}

interface MCPServer {
  label: string;
  url: string;
  sessionId?: string;
  availableTools?: MCPTool[];
}

const servers: Map<string, MCPServer> = new Map();
let _requestId = 1;

function nextId(): number {
  return _requestId++;
}

async function mcpPost(server: MCPServer, body: object): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
  };
  if (server.sessionId) {
    headers["mcp-session-id"] = server.sessionId;
  }
  return fetch(`${server.url}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function parseResponse(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const text = await response.text();
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        try {
          const msg = JSON.parse(line.slice(6)) as { result?: any; error?: { message?: string } };
          if (msg.result !== undefined) return msg.result;
          if (msg.error) throw new Error(msg.error.message ?? JSON.stringify(msg.error));
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }
    throw new Error("No result found in SSE response");
  } else {
    const msg = (await response.json()) as { result?: any; error?: { message?: string } };
    if (msg.result !== undefined) return msg.result;
    if (msg.error) throw new Error(msg.error.message ?? JSON.stringify(msg.error));
    throw new Error("Unexpected response format");
  }
}

async function mcpRequest(server: MCPServer, method: string, params: object = {}): Promise<any> {
  const response = await mcpPost(server, {
    jsonrpc: "2.0",
    id: nextId(),
    method,
    params,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const sessionId = response.headers.get("mcp-session-id");
  if (sessionId) server.sessionId = sessionId;

  return parseResponse(response);
}

async function ensureSession(server: MCPServer): Promise<void> {
  if (server.sessionId) return;

  await mcpRequest(server, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    clientInfo: { name: "agentv2", version: "1.0.0" },
  });

  // Fire-and-forget initialized notification
  mcpPost(server, { jsonrpc: "2.0", method: "notifications/initialized" }).catch(() => {});
}

export function registerMCPServer(label: string, url: string): void {
  servers.set(label, { label, url });
}

export async function discoverMCPTools(): Promise<Map<string, MCPTool[]>> {
  const toolsByServer = new Map<string, MCPTool[]>();

  for (const [, server] of servers) {
    try {
      await ensureSession(server);
      const result = (await mcpRequest(server, "tools/list", {})) as { tools?: MCPTool[] };
      const tools = result.tools ?? [];
      toolsByServer.set(server.label, tools);
      server.availableTools = tools;
    } catch (error) {
      console.warn(`Error discovering tools from ${server.label}:`, error);
    }
  }

  return toolsByServer;
}

export async function callMCPTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
  const startTime = Date.now();
  const server = servers.get(toolCall.serverLabel);

  if (!server) {
    return {
      success: false,
      error: `Server '${toolCall.serverLabel}' not found`,
      duration: Date.now() - startTime,
    };
  }

  try {
    await ensureSession(server);
    const result = await mcpRequest(server, "tools/call", {
      name: toolCall.toolName,
      arguments: toolCall.input,
    });
    return { success: true, result, duration: Date.now() - startTime };
  } catch (error) {
    server.sessionId = undefined; // reset session on error
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

export function getAllAvailableTools(): MCPTool[] {
  const allTools: MCPTool[] = [];
  for (const [, server] of servers) {
    if (server.availableTools) {
      allTools.push(...server.availableTools);
    }
  }
  return allTools;
}

export function getServerTools(serverLabel: string): MCPTool[] {
  return servers.get(serverLabel)?.availableTools ?? [];
}

export function getMCPServerStatus(): MCPServerStatus[] {
  return Array.from(servers.values()).map((server) => ({
    label: server.label,
    url: server.url,
    connected: server.availableTools !== undefined,
    toolCount: server.availableTools?.length ?? 0,
  }));
}
