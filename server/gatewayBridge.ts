import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { once } from "node:events";
import { normalizeProviderUrl } from "../src/utils/providerConfig.ts";
import {
  CATALOG_TIMEOUT_MS,
  COMPLETION_TIMEOUT_MS,
  COMPLETION_TIMEOUT_MESSAGE,
} from "../src/utils/gatewayPolicy.ts";

export async function gatewayMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void,
) {
  const route = new URL(request.url || "/", "http://localhost");
  if (!route.pathname.startsWith("/api/gateway/")) {
    next();
    return;
  }
  const match = route.pathname.match(
    /^\/api\/gateway\/(omniroute|kilo|custom)\/(models|chat\/completions)$/,
  );
  const json = (status: number, message: string) => {
    if (!response.destroyed) {
      response.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify({ error: { message } }));
    }
  };
  if (!match) {
    json(404, "Unknown gateway route.");
    return;
  }
  const method = match[2] === "models" ? "GET" : "POST";
  if (request.method !== method) {
    json(405, "Method not allowed.");
    return;
  }
  // Only the app served by this server may use the credential-bearing bridge.
  if (request.headers.origin) {
    try {
      if (new URL(request.headers.origin).host !== request.headers.host) {
        json(403, "Gateway requests must come from this app.");
        return;
      }
    } catch {
      json(403, "Invalid request origin.");
      return;
    }
  }
  const controller = new AbortController();
  const upstreamSignal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(method === "POST" ? COMPLETION_TIMEOUT_MS : CATALOG_TIMEOUT_MS),
  ]);
  const disconnect = () => {
    if (!response.writableEnded) controller.abort();
  };
  response.on("close", disconnect);
  try {
    const base =
      match[1] === "kilo"
        ? "https://api.kilo.ai/api/gateway"
        : match[1] === "custom" ? String(request.headers["x-gateway-url"] || "") : String(
            request.headers["x-omniroute-url"] || "http://localhost:20128/v1",
          );
    let normalizedBase: string;
    try { normalizedBase = normalizeProviderUrl(base); }
    catch (error) {
      json(400, error instanceof Error ? error.message : "Invalid provider URL.");
      return;
    }
    const parsed = new URL(normalizedBase);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    ) {
      json(
        400,
        "Gateway URL must use HTTP or HTTPS without embedded credentials.",
      );
      return;
    }
    let body: string | undefined;
    if (method === "POST") {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 1_000_000) {
          json(
            413,
            "This prompt is too large. Shorten the conversation or project context.",
          );
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      body = Buffer.concat(chunks).toString("utf8");
      try {
        JSON.parse(body);
      } catch {
        json(400, "Invalid gateway request body.");
        return;
      }
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (request.headers.authorization)
      headers.Authorization = request.headers.authorization;
    const upstream = await fetch(
      `${normalizedBase}/${match[2]}${route.search}`,
      {
        method,
        headers,
        body,
        signal: upstreamSignal,
        redirect: "error",
      },
    );
    if (upstream.ok && upstream.headers.get("content-type")?.includes("text/event-stream")) {
      response.writeHead(upstream.status, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      });
      response.flushHeaders();
      if (!upstream.body) throw new Error("Missing gateway stream.");
      for await (const chunk of upstream.body) {
        if (response.destroyed) break;
        if (!response.write(Buffer.from(chunk)))
          await once(response, "drain", { signal: controller.signal });
      }
      if (!response.destroyed) response.end();
      return;
    }
    const content = await upstream.text();
    if (!response.destroyed) {
      response.writeHead(upstream.status, {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      });
      response.end(content);
    }
  } catch (error) {
    if (controller.signal.aborted) return;
    const message = (upstreamSignal.aborted && upstreamSignal.reason?.name === "TimeoutError") || (error instanceof Error && error.name === "TimeoutError")
      ? method === "POST" ? COMPLETION_TIMEOUT_MESSAGE : "The model catalog did not respond within 15 seconds."
      : `Could not reach ${match[1] === "kilo" ? "Kilo" : match[1] === "custom" ? "your API provider" : "OmniRoute"}. Check the gateway URL and your network connection.`;
    if (response.headersSent) {
      if (!response.destroyed)
        response.end(`data: ${JSON.stringify({ error: { message } })}\n\ndata: [DONE]\n\n`);
      return;
    }
    json(
      502,
      message,
    );
  } finally {
    response.off("close", disconnect);
  }
}

export function gatewayBridge(): Plugin {
  return {
    name: "ahpah-gateway-bridge",
    configureServer(server) {
      server.middlewares.use(gatewayMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(gatewayMiddleware);
    },
  };
}
