/**
 * DocsAPI — public, read-only HTTP endpoint exposing the bot's module and
 * command catalog for the web dashboard's /docs pages.
 *
 * Registers GET /api/docs on the bot's existing HTTP server (same
 * intercept-and-fall-through pattern as MusicAPI.ts / WebhookRouter.ts).
 * No auth: the response contains only command names/descriptions/argument
 * shapes, the same information any Discord user already sees via /help.
 */

import http from "http";
import { URL } from "url";
import { buildModuleCatalog } from "./lib/moduleCatalog";
import type { ModuleManager } from "./ModuleManager";

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

export function registerDocsAPI(server: http.Server, moduleManager: ModuleManager) {
  const originalHandler = server.listeners("request")[0] as Function;

  server.removeAllListeners("request");

  server.on(
    "request",
    async (req: http.IncomingMessage, res: http.ServerResponse) => {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "localhost"}`,
      );
      const pathname = url.pathname;

      if (pathname === "/api/docs" && req.method === "GET") {
        try {
          const catalog = buildModuleCatalog(moduleManager);
          return sendJson(res, 200, catalog);
        } catch (error) {
          moduleManager.logger.error(
            "Failed to build docs catalog",
            undefined,
            error,
            "docs-api",
          );
          return sendJson(res, 500, { error: "Failed to build docs catalog" });
        }
      }

      if (originalHandler) {
        (originalHandler as any)(req, res);
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      }
    },
  );

  console.log("[DocsAPI] GET /api/docs registered on HTTP server");
}
