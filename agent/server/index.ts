import { join } from "node:path";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";

const configPath = join(import.meta.dir, "..", "config.json");
const config = await Bun.file(configPath)
  .json()
  .catch(() => ({}));

const PORT = 3001;

const systemPromptPath = join(import.meta.dir, "..", "system-prompt.md");
const BASE_PROMPT = await Bun.file(systemPromptPath).text();

// --- Models ---

type ModelEntry = { label?: string; baseUrl: string; model: string; apiKey?: string };
const modelEntries: ModelEntry[] = config.models ?? [];

const models = modelEntries.map((entry) => {
  const provider = createOpenAICompatible({
    name: entry.label ?? entry.model,
    baseURL: entry.baseUrl,
    ...(entry.apiKey ? { apiKey: entry.apiKey } : {}),
  });
  return {
    label: entry.label ?? entry.model,
    instance: provider.chatModel(entry.model),
  };
});

let activeModelIndex = 0;

if (models.length === 0) {
  console.error("No models configured in config.json");
  process.exit(1);
}

console.log(
  `Models: ${models.map((m, i) => `${i === 0 ? "[active] " : ""}${m.label}`).join(", ")}`,
);

// --- MCP ---

type MCPClient = Awaited<ReturnType<typeof createMCPClient>>;

const mcpClients: MCPClient[] = [];
let allTools: Record<string, unknown> = {};

type MCPServerEntry =
  | { command: string; args?: string[]; label?: string }
  | { url: string; transport?: "sse" | "http"; headers?: Record<string, string>; label?: string };

async function initMCP() {
  const servers: MCPServerEntry[] = config.mcpServers ?? [];

  if (servers.length === 0) {
    console.log("No MCP servers configured");
    return;
  }

  console.log(`Connecting to ${servers.length} MCP server(s)...`);

  for (const entry of servers) {
    const name = entry.label ?? ("command" in entry ? entry.command : entry.url);
    try {
      const client =
        "command" in entry
          ? await createMCPClient({
              transport: new Experimental_StdioMCPTransport({
                command: entry.command,
                args: entry.args ?? [],
              }),
            })
          : await createMCPClient({
              transport:
                entry.transport === "sse"
                  ? { type: "sse" as const, url: entry.url, headers: entry.headers }
                  : { type: "http" as const, url: entry.url, headers: entry.headers },
            });
      mcpClients.push(client);

      const tools = await client.tools();
      allTools = { ...allTools, ...tools };
      console.log(`  ${name} → ${Object.keys(tools).length} tools`);
    } catch (err) {
      console.error(`  Failed: ${name}:`, err);
    }
  }

  console.log("MCP ready. Tools:", Object.keys(allTools).join(", ") || "(none)");
}

async function shutdown() {
  console.log("\nShutting down...");
  await Promise.all(mcpClients.map((c) => c.close()));
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const distDir = join(import.meta.dir, "..", "dist");

await initMCP();

// --- Server ---

function modelsResponse() {
  return Response.json({
    active: activeModelIndex,
    models: models.map((m) => m.label),
  });
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255,

  async fetch(req, bunServer) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Model selection
    if (url.pathname === "/api/models") {
      if (req.method === "POST") {
        const body = (await req.json()) as { index: number };
        if (body.index >= 0 && body.index < models.length) {
          activeModelIndex = body.index;
        }
      }
      return modelsResponse();
    }

    // Chat endpoint
    if (req.method === "POST" && url.pathname === "/api/chat") {
      bunServer.timeout(req, 0);

      try {
        const { messages } = (await req.json()) as { messages: UIMessage[] };
        const modelMessages = await convertToModelMessages(messages);

        const system = `${BASE_PROMPT}\n\n[Aktuelle Zeit: ${new Date().toISOString()}]`;

        const activeModel = models[activeModelIndex];
        console.log(`Chat request → ${activeModel.label}`);

        const result = streamText({
          model: activeModel.instance,
          system,
          messages: modelMessages,
          tools: allTools as Parameters<typeof streamText>[0]["tools"],
          stopWhen: stepCountIs(10),
          maxRetries: 1,
          onError: ({ error }) => console.error("Stream error:", error),
        });

        return result.toUIMessageStreamResponse();
      } catch (err) {
        console.error("Chat endpoint error:", err);
        return Response.json({ error: String(err) }, { status: 500 });
      }
    }

    // Production static file serving
    if (process.env.NODE_ENV === "production") {
      const filePath = join(distDir, url.pathname === "/" ? "index.html" : url.pathname);
      const file = Bun.file(filePath);

      if (await file.exists()) {
        return new Response(file);
      }

      return new Response(Bun.file(join(distDir, "index.html")));
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server listening on http://localhost:${server.port}`);
