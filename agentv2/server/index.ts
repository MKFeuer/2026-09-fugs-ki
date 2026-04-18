import { join } from "node:path";
import { loadRuntimeConfig } from "./config/models";
import { initializeToolRegistry } from "./config/tools";
import { createHttpHandler } from "./http/routes";
import { createWebSocketHandlers, type ConnectionState } from "./ws/connection";
import { createSession } from "./state";

const PORT = 3001;
const distDir = join(import.meta.dir, "..", "dist");

const runtimeConfig = loadRuntimeConfig();
await initializeToolRegistry();
const handleHttp = createHttpHandler({ runtimeConfig, distDir });
const websocket = createWebSocketHandlers(runtimeConfig);

const server = Bun.serve<ConnectionState>({
  port: PORT,
  idleTimeout: 255,
  websocket,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/ws") {
      if (
        server.upgrade(req, {
          data: {
            modelId: runtimeConfig.autoConnectModelId,
            runtimeConfig,
            session: createSession(),
            status: "idle",
          },
        })
      ) {
        return;
      }
    }

    return handleHttp(req);
  },
});

console.log(`agentv2 listening on http://localhost:${server.port}`);
