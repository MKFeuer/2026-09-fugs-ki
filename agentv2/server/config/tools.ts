// Tool registry and configuration
// Manages MCP tool discovery and normalization for OpenAI compatibility

import { registerMCPServer, discoverMCPTools, getAllAvailableTools, type MCPTool } from "../services/mcp";
import type { OpenAIToolDefinition } from "../openai";

interface ToolConfig {
  servers: Array<{
    label: string;
    url: string;
    enabled: boolean;
  }>;
}

let toolRegistry: OpenAIToolDefinition[] = [];
const defaultConfig: ToolConfig = {
  servers: [
    {
      label: "tools",
      url: process.env.MCP_TOOLS_URL || "http://localhost:8000",
      enabled: true,
    },
    {
      label: "commandx",
      url: process.env.MCP_COMMANDX_URL || "http://localhost:8001",
      enabled: true,
    },
  ],
};

export async function initializeToolRegistry(): Promise<void> {
  const config = defaultConfig;

  // Register MCP servers
  for (const server of config.servers) {
    if (server.enabled) {
      registerMCPServer(server.label, server.url);
    }
  }

  // Discover available tools
  try {
    await discoverMCPTools();
    const tools = getAllAvailableTools();
    toolRegistry = normalizeToolsForOpenAI(tools);

    console.log(`Loaded ${toolRegistry.length} tools from MCP servers`);
    for (const tool of toolRegistry.slice(0, 5)) {
      console.log(`  - ${tool.function.name}: ${tool.function.description}`);
    }
  } catch (error) {
    console.error("Failed to initialize tool registry:", error);
  }
}

function normalizeToolsForOpenAI(mcpTools: MCPTool[]): OpenAIToolDefinition[] {
  return mcpTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.inputSchema || {
        type: "object",
        properties: {},
      },
    },
  }));
}

export function getToolRegistry(): OpenAIToolDefinition[] {
  return toolRegistry;
}

export function findToolByName(name: string): MCPTool | undefined {
  const tools = getAllAvailableTools();
  return tools.find((tool) => tool.name === name);
}

export function areToolsAvailable(): boolean {
  return toolRegistry.length > 0;
}
