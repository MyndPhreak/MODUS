/**
 * WebhookRouter — HTTP endpoint for receiving external webhook events.
 *
 * Registers `POST /webhooks/trigger/:secret` on the bot's existing HTTP
 * server (same pattern as MusicAPI.ts — intercepts before fallback).
 *
 * Provider handlers parse incoming payloads into Discord embeds and post
 * them to the configured channel.
 */

import http from "http";
import { URL } from "url";
import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { AppwriteService } from "./AppwriteService";

// ── Helpers ────────────────────────────────────────────────────────

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

/**
 * Resolve `{dot.path}` placeholders against a nested object.
 * E.g. `{pull_request.title}` in body `{ pull_request: { title: "Fix" } }` → "Fix"
 */
function resolvePlaceholders(
  template: string,
  data: Record<string, any>,
): string {
  return template.replace(/\{([^}]+)\}/g, (match, path) => {
    const keys = path.split(".");
    let value: any = data;
    for (const key of keys) {
      if (value == null || typeof value !== "object") return match;
      value = value[key];
    }
    return value != null ? String(value) : match;
  });
}

// ── Provider Handlers ──────────────────────────────────────────────

interface ProviderResult {
  skip: boolean;
  embed: EmbedBuilder | null;
}

/** Maps raw body + headers into placeholder-friendly flat structures */
function flattenGitHub(body: any): Record<string, any> {
  return {
    ...body,
    // Convenient aliases
    "pr.title": body.pull_request?.title ?? body.issue?.title ?? "",
    "pr.url": body.pull_request?.html_url ?? body.issue?.html_url ?? "",
    "pr.author": body.pull_request?.user?.login ?? body.sender?.login ?? "",
    "pr.number": body.pull_request?.number ?? body.issue?.number ?? "",
    "pr.state": body.pull_request?.state ?? body.action ?? "",
    "pr.merged": body.pull_request?.merged ?? false,
    "repo.name": body.repository?.full_name ?? "",
    "repo.url": body.repository?.html_url ?? "",
    "sender.login": body.sender?.login ?? "",
    "sender.avatar": body.sender?.avatar_url ?? "",
  };
}

function flattenTwitch(body: any): Record<string, any> {
  const sub = body.subscription ?? {};
  const event = body.event ?? {};
  return {
    ...body,
    "stream.user":
      event.broadcaster_user_name ?? event.broadcaster_user_login ?? "",
    "stream.title": event.title ?? "",
    "stream.game": event.category_name ?? "",
    "stream.type": sub.type ?? "",
    "stream.started_at": event.started_at ?? "",
  };
}

function handleGitHub(
  trigger: any,
  body: any,
  headers: http.IncomingHttpHeaders,
): ProviderResult {
  const flat = flattenGitHub(body);

  // Apply filters
  if (trigger.filters) {
    try {
      const filters = JSON.parse(trigger.filters);
      for (const [key, expected] of Object.entries(filters)) {
        // Support dot-notation keys in filters
        const actual = flat[key] ?? body[key];
        if (actual !== expected) {
          return { skip: true, embed: null };
        }
      }
    } catch {
      // Invalid filter JSON — proceed without filtering
    }
  }

  // Build embed
  let title = "🐙 GitHub — {pr.title}";
  let description = "[{repo.name}]({pr.url}) by **{sender.login}**";
  let color = 0x238636;

  if (trigger.embed_template) {
    try {
      const tmpl = JSON.parse(trigger.embed_template);
      if (tmpl.title) title = tmpl.title;
      if (tmpl.description) description = tmpl.description;
      if (tmpl.color) color = tmpl.color;
    } catch {}
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(resolvePlaceholders(title, flat).slice(0, 256))
    .setDescription(resolvePlaceholders(description, flat).slice(0, 4096))
    .setTimestamp();

  // Add sender avatar as thumbnail if available
  if (flat["sender.avatar"]) {
    embed.setThumbnail(flat["sender.avatar"]);
  }

  const ghEvent = headers["x-github-event"] as string | undefined;
  if (ghEvent) {
    embed.setFooter({ text: `Event: ${ghEvent} / ${body.action ?? "n/a"}` });
  }

  return { skip: false, embed };
}

function handleTwitch(
  trigger: any,
  body: any,
  _headers: http.IncomingHttpHeaders,
): ProviderResult {
  const flat = flattenTwitch(body);

  // Apply filters
  if (trigger.filters) {
    try {
      const filters = JSON.parse(trigger.filters);
      for (const [key, expected] of Object.entries(filters)) {
        const actual = flat[key] ?? body[key];
        if (actual !== expected) {
          return { skip: true, embed: null };
        }
      }
    } catch {}
  }

  let title = "📺 Twitch — {stream.user}";
  let description =
    "**{stream.user}** went live: *{stream.title}*\nPlaying **{stream.game}**";
  let color = 0x9146ff;

  if (trigger.embed_template) {
    try {
      const tmpl = JSON.parse(trigger.embed_template);
      if (tmpl.title) title = tmpl.title;
      if (tmpl.description) description = tmpl.description;
      if (tmpl.color) color = tmpl.color;
    } catch {}
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(resolvePlaceholders(title, flat).slice(0, 256))
    .setDescription(resolvePlaceholders(description, flat).slice(0, 4096))
    .setFooter({ text: `Type: ${flat["stream.type"]}` })
    .setTimestamp();

  return { skip: false, embed };
}

function handleGenericWebhook(
  trigger: any,
  body: any,
  _headers: http.IncomingHttpHeaders,
): ProviderResult {
  let title = "🔔 Webhook Triggered";
  let description =
    "```json\n" + JSON.stringify(body, null, 2).slice(0, 3900) + "\n```";
  let color = 0x5865f2;

  if (trigger.embed_template) {
    try {
      const tmpl = JSON.parse(trigger.embed_template);
      if (tmpl.title) title = resolvePlaceholders(tmpl.title, body);
      if (tmpl.description)
        description = resolvePlaceholders(tmpl.description, body);
      if (tmpl.color) color = tmpl.color;
    } catch {}
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title.slice(0, 256))
    .setDescription(description.slice(0, 4096))
    .setTimestamp();

  return { skip: false, embed };
}

// ── Router Registration ────────────────────────────────────────────

export function registerWebhookRoutes(
  server: http.Server,
  client: Client,
  appwriteService: AppwriteService,
) {
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

      // ── Twitch webhook verification challenge ────────────────────
      // Twitch sends a POST with type "webhook_callback_verification"
      // that requires echoing back the challenge value.
      // We handle this before the main trigger logic.

      // ── POST /webhooks/trigger/:secret ───────────────────────────
      const triggerMatch = pathname.match(
        /^\/webhooks\/trigger\/([a-f0-9-]{36})$/i,
      );
      if (triggerMatch && req.method === "POST") {
        const secret = triggerMatch[1];

        try {
          const trigger = await appwriteService.getTriggerBySecret(secret);

          if (!trigger) {
            console.warn(
              `[Webhooks] No trigger found for secret: ${secret.slice(0, 8)}...`,
            );
            return sendJson(res, 404, { error: "Trigger not found" });
          }

          if (!trigger.enabled) {
            console.warn(
              `[Webhooks] Trigger "${trigger.name}" is disabled, ignoring request`,
            );
            return sendJson(res, 404, { error: "Trigger not found" });
          }

          const body = await parseBody(req);

          // Handle Twitch verification challenge
          if (
            trigger.provider === "twitch" &&
            body.subscription?.type &&
            body.challenge
          ) {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end(body.challenge);
            console.log(
              `[Webhooks] Twitch verification challenge answered for trigger "${trigger.name}"`,
            );
            return;
          }

          // Dispatch to provider handler
          let result: ProviderResult;
          switch (trigger.provider) {
            case "github":
              result = handleGitHub(trigger, body, req.headers);
              break;
            case "twitch":
              result = handleTwitch(trigger, body, req.headers);
              break;
            default:
              result = handleGenericWebhook(trigger, body, req.headers);
              break;
          }

          if (result.skip || !result.embed) {
            return sendJson(res, 200, {
              ok: true,
              action: "skipped",
              reason: "Filtered out",
            });
          }

          // Send to Discord channel
          const guild = client.guilds.cache.find(
            (g) => g.id === trigger.guild_id,
          );
          if (!guild) {
            return sendJson(res, 500, { error: "Guild not found" });
          }

          const channel = guild.channels.cache.get(trigger.channel_id);
          if (!channel || !(channel instanceof TextChannel)) {
            return sendJson(res, 500, { error: "Channel not found" });
          }

          await channel.send({ embeds: [result.embed] });

          console.log(
            `[Webhooks] Trigger "${trigger.name}" fired → #${channel.name} (${guild.name})`,
          );

          return sendJson(res, 200, { ok: true, action: "sent" });
        } catch (err: any) {
          console.error("[Webhooks] Error processing trigger:", err);
          return sendJson(res, 500, {
            error: err.message || "Internal error",
          });
        }
      }

      // Fallback: pass to previous handler chain (MusicAPI → health check)
      if (originalHandler) {
        (originalHandler as any)(req, res);
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      }
    },
  );

  console.log("[Webhooks] Webhook trigger routes registered on HTTP server");
}
