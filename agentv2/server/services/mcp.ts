// MCP Client for HTTP-based tool calling
// Communicates with FastMCP servers (tools, commandx, etc.)

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

interface MCPServer {
  label: string;
  url: string;
  availableTools?: MCPTool[];
}

const servers: Map<string, MCPServer> = new Map();

export function registerMCPServer(label: string, url: string) {
  servers.set(label, { label, url });
}

export async function discoverMCPTools(): Promise<Map<string, MCPTool[]>> {
  const toolsByServer = new Map<string, MCPTool[]>();

  for (const [, server] of servers) {
    try {
      const response = await fetch(`${server.url}/tools/list`);
      if (!response.ok) {
        console.warn(`Failed to discover tools from ${server.label}:`, response.statusText);
        continue;
      }

      const data = (await response.json()) as { tools?: MCPTool[] };
      const tools = data.tools || [];
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
    const response = await fetch(`${server.url}/tools/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: toolCall.toolName,
        arguments: toolCall.input,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        duration: Date.now() - startTime,
      };
    }

    const result = await response.json();
    return {
      success: true,
      result,
      duration: Date.now() - startTime,
    };
  } catch (error) {
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
  return servers.get(serverLabel)?.availableTools || [];
}
