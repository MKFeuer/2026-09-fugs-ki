import { join } from "node:path";
import { toPublicRuntimeConfig, type RuntimeConfig } from "../config/models";

interface HttpHandlerOptions {
  runtimeConfig: RuntimeConfig;
  distDir: string;
}

export function createHttpHandler({ runtimeConfig, distDir }: HttpHandlerOptions) {
  return async function handleHttp(req: Request) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/api/health") {
      return Response.json({ ok: true });
    }

    if (req.method === "GET" && url.pathname === "/api/models") {
      return Response.json(toPublicRuntimeConfig(runtimeConfig).models);
    }

    if (req.method === "GET" && url.pathname === "/api/runtime-config") {
      return Response.json(toPublicRuntimeConfig(runtimeConfig));
    }

    if (process.env.NODE_ENV === "production") {
      const filePath = join(distDir, url.pathname === "/" ? "index.html" : url.pathname);
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response(Bun.file(join(distDir, "index.html")));
    }

    return new Response("Not Found", { status: 404 });
  };
}
